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

export function renderReaderHeader({
  collectionHref = "",
  collectionLabel = "Books & notes",
  homeHref = "",
  workTitle,
  location = "",
  title,
  className = "site-header work-header"
}) {
  const work = homeHref
    ? `<a href="${escapeHtml(homeHref)}">${escapeHtml(workTitle)}</a>`
    : escapeHtml(workTitle);
  const locationText = location ? ` · ${escapeHtml(location)}` : "";
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
