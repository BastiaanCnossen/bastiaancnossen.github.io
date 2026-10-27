import { readerRevision } from "./install.mjs";
export { installReaderShell, validateReaderShell } from "./install.mjs";
export { applyReadingNavigation, renderReadingNavigation, readingNavigationIndex } from "./reading-navigation.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderCollectionReturn({ href, label = "Books & notes" }) {
  if (!href) return "";
  return `<a class="collection-return" data-site-return href="${escapeHtml(href)}"><span aria-hidden="true">←</span> ${escapeHtml(label)}</a>`;
}

export function renderManuscriptControl(href) {
  if (!href) return "";
  return `<div class="utility-item manuscript-item">
      <a class="utility-trigger manuscript-trigger" href="${escapeHtml(href)}" title="View the entire manuscript as a PDF">
        <span class="utility-expansion">View the entire manuscript as a PDF</span>
        <span class="utility-icon book-icon" aria-hidden="true">📖</span>
        <span class="sr-only">View the entire manuscript as a PDF</span>
      </a>
    </div>`;
}

export function renderUtilityDock(content) {
  return `<aside class="utility-dock" aria-label="Page tools">${content}</aside>`;
}

export function renderReaderSettings({
  proofAttribute = "data-proof-mode",
  proofChoices = [
    { value: "displayed", label: "Proofs displayed" },
    { value: "collapsed", label: "Proofs collapsed" }
  ]
} = {}) {
  if (!/^data-[a-z]+(?:-[a-z]+)*$/.test(proofAttribute)) throw new Error("Invalid proof control attribute.");
  return `<div class="utility-item settings-item" data-utility-item data-open="false">
      <button class="utility-trigger" id="display-settings-trigger" type="button" data-utility-trigger aria-controls="display-settings-panel" aria-expanded="false" aria-label="Reader settings" title="Reader settings">
        <span class="utility-icon" aria-hidden="true">⚙</span>
      </button>
      <section class="utility-panel settings-panel" id="display-settings-panel" aria-labelledby="display-settings-heading">
        <h2 id="display-settings-heading">Proof display</h2>
        <div class="preset-group" role="group" aria-label="Default proof display">
          ${proofChoices.map(({ value, label }) => `<button type="button" ${proofAttribute}="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join("\n          ")}
        </div>
        <h2>Page layout</h2>
        <label class="settings-check"><input type="checkbox" data-navigation-visibility checked> Show navigation panel</label>
      </section>
    </div>`;
}

export function renderReaderScripts({ assetPrefix, adapterHref, workId, legacyPreferences = {} }) {
  if (!workId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workId)) throw new Error("Reader scripts need a permanent work ID.");
  const attributes = Object.entries(legacyPreferences).map(([key, value]) => {
    if (!["navigation", "contents", "rail"].includes(key)) throw new Error(`Unknown reader preference: ${key}`);
    return ` data-legacy-${key}="${escapeHtml(value)}"`;
  }).join("");
  return `<script defer src="${escapeHtml(assetPrefix)}reader.js" data-notes-reader="${escapeHtml(workId)}" data-reader-revision="${readerRevision()}"${attributes}></script>${adapterHref ? `\n<script defer src="${escapeHtml(adapterHref)}"></script>` : ""}`;
}

export function renderEditionFooter({ updated = "", pdfHref = "", feedbackEmail = "", workTitle = "", pageTitle = "", pageUrl = "", sourceNote = "" } = {}) {
  const subject = `${workTitle}: ${pageTitle}`;
  const body = `Page: ${pageUrl}\n\nDescribe the error (and, if possible, the correction):\n\n`;
  const mailto = `mailto:${feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `<footer class="edition-footer">${updated ? `\n  <span>Last updated ${escapeHtml(updated)}</span>` : ""}${pdfHref ? `\n  <a href="${escapeHtml(pdfHref)}">PDF</a>` : ""}${feedbackEmail ? `\n  <a href="${escapeHtml(mailto)}">Report an error</a>` : ""}${sourceNote ? `\n  <p class="source-note">${escapeHtml(sourceNote)}</p>` : ""}\n</footer>`;
}

export function renderReaderHeader({
  collectionHref = "",
  collectionLabel = "Books & notes",
  homeHref = "",
  workTitle,
  location = "",
  breadcrumbs = [],
  title,
  className = "site-header work-header"
}) {
  const work = homeHref
    ? `<a href="${escapeHtml(homeHref)}">${escapeHtml(workTitle)}</a>`
    : escapeHtml(workTitle);
  const trail = breadcrumbs.length > 0
    ? breadcrumbs
    : location
      ? [{ label: location }]
      : [];
  const locationText = trail.map(({ label, href = "" }) => {
    const item = href
      ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
      : escapeHtml(label);
    return ` · ${item}`;
  }).join("");
  return `<header class="${escapeHtml(className)}">
    <div>
      ${renderCollectionReturn({ href: collectionHref, label: collectionLabel })}
      <p class="eyebrow">${work}${locationText}</p>
      <h1>${escapeHtml(title)}</h1>
    </div>
  </header>`;
}

export function renderContextNavigationToggle({
  label = "Manuscript contents",
  controls = "context-navigation"
} = {}) {
  return `<button class="context-nav-toggle" type="button" id="${escapeHtml(controls)}-toggle" data-context-nav-toggle aria-controls="${escapeHtml(controls)}" aria-expanded="false">
      <span aria-hidden="true">☰</span> ${escapeHtml(label)}
    </button>`;
}

export function renderContentsLedger({ key, title, content, collapsed = false }) {
  const id = `contents-${key}`;
  const open = !collapsed;
  return `<section class="contents-ledger" data-contents-ledger data-open="${String(open)}">
    <h2 class="contents-heading"><button class="contents-toggle" type="button" data-contents-toggle aria-controls="${escapeHtml(id)}" aria-expanded="${String(open)}">
      <span>${escapeHtml(title)}</span><span class="contents-chevron" aria-hidden="true"></span>
    </button></h2>
    <nav class="contents" id="${escapeHtml(id)}" aria-label="${escapeHtml(title)}" data-ledger-key="${escapeHtml(key)}" data-default-collapsed="${String(collapsed)}" data-collapsed="${String(collapsed)}">
      ${content}
    </nav>
  </section>`;
}

export function renderContextNavigation({ ledgers, before = "", label = "Page navigation", controls = "context-navigation" }) {
  return `<aside class="context-nav manuscript-contents-nav" id="${escapeHtml(controls)}" data-context-nav data-open="false" aria-label="${escapeHtml(label)}">
    ${before}<div class="contents-ledgers">${ledgers.map(renderContentsLedger).join("")}</div>
  </aside>`;
}
