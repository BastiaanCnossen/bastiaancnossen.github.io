import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  renderCollectionReturn,
  renderContentsLedger,
  renderContextNavigation,
  renderContextNavigationToggle,
  renderManuscriptControl,
  renderReaderHeader,
  renderUtilityDock,
  renderReaderSettings,
  renderReaderScripts,
  renderEditionFooter,
  installReaderShell,
  validateReaderShell
} from "./components.mjs";
import { readingNavigationIndex, renderReadingNavigation, applyReadingNavigation } from "./reading-navigation.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const style = fs.readFileSync(path.join(root, "style.css"), "utf8");
for (const selector of [".site-header", ".collection-return", ".utility-dock", ".notes-page", ".reader-layout", ".context-nav"]) {
  assert(style.includes(selector), `The shared stylesheet is missing ${selector}.`);
}

assert(renderCollectionReturn({ href: "/books.html" }).includes('data-site-return'));
assert(renderManuscriptControl("book.pdf").includes("📖"));
assert(renderUtilityDock("control").includes('aria-label="Page tools"'));
assert(renderReaderHeader({ workTitle: "Work", location: "Chapter 1", title: "Title" }).includes("Work · Chapter 1"));
const breadcrumbHeader = renderReaderHeader({
  workTitle: "Work",
  breadcrumbs: [
    { label: "Part I", href: "../part/stable-homotopy-theory/" },
    { label: "Chapter 2", href: "../chapter/animae-as-spaces/" },
    { label: "Section 2.1" }
  ],
  title: "Title"
});
assert(breadcrumbHeader.includes('<a href="../part/stable-homotopy-theory/">Part I</a> · <a href="../chapter/animae-as-spaces/">Chapter 2</a> · Section 2.1'));
assert(renderContextNavigationToggle().includes("Manuscript contents"));
const collapsedLedger = renderContentsLedger({ key: "chapters", title: "Chapters", content: "items", collapsed: true });
assert(collapsedLedger.includes('data-default-collapsed="true"'));
assert(collapsedLedger.includes('class="contents-heading"><button class="contents-toggle"'));
assert(collapsedLedger.includes('aria-expanded="false"'));
assert(!collapsedLedger.includes("data-contents-collapse"));
assert(renderContextNavigation({ ledgers: [{ key: "chapters", title: "Chapters", content: "items" }] }).includes('class="contents-ledgers"'));

assert(renderReaderSettings().includes('data-proof-mode="collapsed">Proofs collapsed</button>'));
assert(renderReaderSettings({ proofAttribute: "data-detail-level", proofChoices: [{ value: "1", label: "Full text" }] }).includes('data-detail-level="1">Full text</button>'));
assert.throws(() => renderReaderSettings({ proofAttribute: 'onclick="bad"' }), /Invalid/);
assert.throws(() => renderReaderScripts({ workId: "Missing ID" }), /permanent work ID/);
const scripts = renderReaderScripts({ assetPrefix: "../reader/", adapterHref: "../proof.js", workId: "test-work" });
assert(scripts.indexOf("reader.js") < scripts.indexOf("proof.js"));
assert(scripts.includes('data-notes-reader="test-work"'));
assert(renderEditionFooter({ sourceNote: "A < B" }).includes("A &lt; B"));
assert(renderEditionFooter({ feedbackEmail: "reader@example.com", workTitle: "Work", pageTitle: "Theorem", pageUrl: "https://example.com/result/" }).includes("Report an error"));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "reader-install-test-"));
try {
  assert.throws(() => installReaderShell(temporary, "../outside"), /inside/);
  const receipt = installReaderShell(temporary, "_assets/reader");
  fs.writeFileSync(path.join(temporary, "index.html"), `<aside class="utility-dock"></aside>${renderReaderScripts({ assetPrefix: "_assets/reader/", workId: "test-work" })}`);
  assert.equal(validateReaderShell(temporary).Revision, receipt.Revision);
  fs.appendFileSync(path.join(temporary, "_assets/reader/reader.js"), "stale");
  assert.throws(() => validateReaderShell(temporary), /differs/);

  const model = { chapters: [
    { id: "one", heading: "Chapter 1", title: "First chapter", page: "chapter/one/index.html", sections: [
      { id: "a", heading: "Section 1.1", title: "First section", page: "section/one/a/index.html" },
      { id: "b", heading: "Section 1.2", title: "Second section", page: "section/one/b/index.html" }
    ] },
    { id: "two", heading: "Chapter 2", title: "Chapter without sections", page: "chapter/two/index.html", sections: [] },
    { id: "appendix", heading: "Appendix A", title: "An appendix", page: "chapter/appendix/index.html", sections: [
      { id: "a", heading: "Section A.1", title: "Appendix section", page: "section/appendix/a/index.html" }
    ] }
  ], entries: [{ page: "entry/result/index.html", chapterId: "one", sectionId: "b" }] };
  const navigation = readingNavigationIndex(model);
  const first = renderReadingNavigation(navigation, "chapter/one/index.html");
  assert(first.includes('disabled data-step="prev-chapter"'));
  assert(first.includes('disabled data-step="prev-section"'));
  assert(first.includes('class="turn-target">Section 1.1</span>'));
  const boundary = renderReadingNavigation(navigation, "section/one/b/index.html");
  assert(boundary.includes('href="../../appendix/a/index.html"'));
  assert(boundary.includes('class="turn-target">Chapter 2</span>'));
  const empty = renderReadingNavigation(navigation, "chapter/two/index.html");
  assert(empty.includes('class="turn-target">Section 1.2</span>'));
  assert(empty.includes('class="turn-target">Section A.1</span>'));
  assert(renderReadingNavigation(navigation, "entry/result/index.html").includes('href="../../section/appendix/a/index.html"'));
  assert(renderReadingNavigation(navigation, "section/appendix/a/index.html").includes('disabled data-step="next-section"'));
  assert.throws(() => readingNavigationIndex({ chapters: [], entries: [{ page: "entry/missing/index.html", chapterId: "missing" }] }), /Unknown chapter/);
  installReaderShell(temporary, "_assets/reader");
  for (const page of navigation.pages.keys()) {
    fs.mkdirSync(path.dirname(path.join(temporary, page)), { recursive: true });
    fs.writeFileSync(path.join(temporary, page), '<header class="site-header"><div><h1>Title</h1></div></header><article class="notes-page"><p>Unchanged mathematical content.</p></article><nav class="context-step-controls" aria-label="Previous and next chapters">Old arrows</nav>');
  }
  applyReadingNavigation(temporary, model);
  const page = path.join(temporary, "chapter/one/index.html");
  const once = fs.readFileSync(page, "utf8");
  assert(once.includes('<article class="notes-page"><p>Unchanged mathematical content.</p></article>'));
  assert(!once.includes("Old arrows"));
  applyReadingNavigation(temporary, model);
  assert.equal(fs.readFileSync(page, "utf8"), once, "Refreshing navigation must be idempotent.");
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log("Validated reader-shell-v1 components, style, installation, and revision contract.");
