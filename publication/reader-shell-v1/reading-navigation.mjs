import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installReaderShell, readerRevision } from "./install.mjs";

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function readingNavigationIndex(model) {
  const pages = new Map();
  const chapters = model.chapters;
  const sections = chapters.flatMap((chapter) => chapter.sections.map((section) => ({ ...section, chapterId: chapter.id })));
  const add = (page, context) => {
    if (!page || page.startsWith("/") || page.includes("\\") || page.split("/").includes("..") || !page.endsWith("/index.html")) throw new Error(`Invalid reading-navigation page: ${page}`);
    if (pages.has(page)) throw new Error(`Duplicate reading-navigation page: ${page}`);
    pages.set(page, context);
  };
  chapters.forEach((chapter, chapterIndex) => {
    if (!chapter.id || !chapter.heading || !chapter.title) throw new Error("Incomplete chapter navigation data.");
    add(chapter.page, { chapterIndex });
    chapter.sections.forEach((section) => add(section.page, { chapterIndex, sectionId: section.id }));
  });
  for (const entry of model.entries || []) {
    const chapterIndex = chapters.findIndex((chapter) => chapter.id === entry.chapterId);
    if (chapterIndex < 0) throw new Error(`Unknown chapter for entry ${entry.page}`);
    if (entry.sectionId && !chapters[chapterIndex].sections.some((section) => section.id === entry.sectionId)) throw new Error(`Unknown section for entry ${entry.page}`);
    add(entry.page, { chapterIndex, sectionId: entry.sectionId });
  }
  return { chapters, sections, pages };
}

export function renderReadingNavigation(index, page) {
  const current = index.pages.get(page);
  if (!current) return "";
  const { chapters, sections } = index;
  const chapter = chapters[current.chapterIndex];
  const sectionIndex = current.sectionId ? sections.findIndex((section) => section.chapterId === chapter.id && section.id === current.sectionId) : -1;
  // On a chapter opening, the next section is its first section; the previous
  // section is the last available section before the chapter, as in SCT.
  const chapterStart = chapters.slice(0, current.chapterIndex).reduce((total, item) => total + item.sections.length, 0);
  const previousSection = sections[current.sectionId ? sectionIndex - 1 : chapterStart - 1];
  const nextSection = sections[current.sectionId ? sectionIndex + 1 : chapterStart];
  const control = (target, direction, kind) => {
    const text = `${direction === "prev" ? "Previous" : "Next"} ${kind}`;
    const arrow = direction === "prev" ? "←" : "→";
    const directionHtml = `<span class="turn-direction">${arrow} ${text}</span>`;
    const step = `data-step="${direction}-${kind}"`;
    if (!target) return `<button type="button" disabled ${step} aria-label="No ${text.toLowerCase()}" title="No ${text.toLowerCase()} in this web edition">${directionHtml}<span class="turn-target">Not available</span></button>`;
    const href = path.posix.relative(path.posix.dirname(page), target.page) || "index.html";
    return `<a rel="${direction}" ${step} href="${escapeHtml(href)}" title="${escapeHtml(target.title)}" aria-label="${escapeHtml(`${text}: ${target.heading}, ${target.title}`)}">${directionHtml}<span class="turn-target">${escapeHtml(target.heading)}</span></a>`;
  };
  return `<nav class="page-turns" data-reading-navigation aria-label="Reading navigation">${[
    control(chapters[current.chapterIndex - 1], "prev", "chapter"),
    control(chapters[current.chapterIndex + 1], "next", "chapter"),
    control(previousSection, "prev", "section"),
    control(nextSection, "next", "section")
  ].join("\n")}</nav>`;
}

export function applyReadingNavigation(outputRoot, model) {
  const root = path.resolve(outputRoot);
  const index = readingNavigationIndex(model);
  const navPattern = /<nav class="page-turns" data-reading-navigation[^>]*>[\s\S]*?<\/nav>/;
  for (const [page] of index.pages) {
    const file = path.join(root, page);
    let html = fs.readFileSync(file, "utf8");
    const controls = renderReadingNavigation(index, page);
    if (navPattern.test(html)) html = html.replace(navPattern, controls);
    else {
      let found = false;
      html = html.replace(/(<header class="[^"]*\bsite-header\b[^"]*">)\s*<div>([\s\S]*?)<\/div>\s*<\/header>/, (_, header, heading) => {
        found = true;
        return `${header}\n<div class="reading-header-row"><div class="reader-heading">${heading}</div>${controls}</div>\n</header>`;
      });
      if (!found) throw new Error(`Cannot find the reader header on ${page}`);
    }
    html = html.replace(/<nav class="context-step-controls" aria-label="Previous and next (?:chapters|sections)">[\s\S]*?<\/nav>/g, "");
    fs.writeFileSync(file, html);
  }
  fs.mkdirSync(path.join(root, "_meta"), { recursive: true });
  fs.writeFileSync(path.join(root, "_meta", "reading-navigation.json"), `${JSON.stringify(model, null, 2)}\n`);
  refreshReaderAssets(root);
  console.log(`Updated the shared chapter/section navigation on ${index.pages.size} reader pages.`);
}

export function refreshReaderAssets(outputRoot) {
  const root = path.resolve(outputRoot);
  const receiptPath = path.join(root, "_meta", "reader-build.json");
  // Converter fixture tests generate HTML without installing browser assets.
  if (!fs.existsSync(receiptPath)) return;
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const stylePath = Object.keys(receipt.Assets).find((name) => name.endsWith("/style.css"));
  if (!stylePath) throw new Error("The reader receipt has no stylesheet.");
  installReaderShell(root, path.posix.dirname(stylePath));
  const revision = readerRevision();
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "_assets") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name === "index.html") {
        const html = fs.readFileSync(file, "utf8");
        if (html.includes("data-notes-reader=")) fs.writeFileSync(file, html.replace(/data-reader-revision="[^"]+"/g, `data-reader-revision="${revision}"`));
      }
    }
  }
  visit(root);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outputRoot] = process.argv.slice(2);
  if (!outputRoot) throw new Error("Usage: node reading-navigation.mjs OUTPUT_ROOT");
  applyReadingNavigation(outputRoot, JSON.parse(fs.readFileSync(path.join(outputRoot, "_meta", "reading-navigation.json"), "utf8")));
}
