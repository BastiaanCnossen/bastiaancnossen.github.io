const proofs = [...document.querySelectorAll(".proof-shell")];
const detailContents = [...document.querySelectorAll(".proof-detail")];
const detailToggles = [...document.querySelectorAll("[data-detail-toggle]")];
const detailLevelButtons = [...document.querySelectorAll("button[data-detail-level]")];
const locallyOpened = new Set();
const locallyClosed = new Set();
const preferenceKey = "layered-notes-reader-preferences-v1";
const maximumDepth = detailContents.reduce(
  (maximum, detail) => Math.max(maximum, Number(detail.dataset.depth)),
  0,
);

function readPreferences() {
  try {
    return JSON.parse(window.localStorage.getItem(preferenceKey) || "{}");
  } catch {
    return {};
  }
}

function savePreferences() {
  try {
    window.localStorage.setItem(preferenceKey, JSON.stringify({
      detailLevel: String(detailLevel),
    }));
  } catch {
    // Some file URLs and privacy modes disable storage. The reader still works
    // with page-local defaults in that case.
  }
}

const storedPreferences = readPreferences();
const allowedDetailLevels = new Set(["-1", "1"]);
const storedDetailLevel = allowedDetailLevels.has(storedPreferences.detailLevel)
  ? storedPreferences.detailLevel
  : document.body.dataset.defaultDetail || "1";
let detailLevel = Number(storedDetailLevel);
const presentation = "compact";

function toggleForContent(content) {
  return detailToggles.find((toggle) => toggle.getAttribute("aria-controls") === content.id);
}

function ancestorDetails(element) {
  const ancestors = [];
  let parent = element.parentElement?.closest(".proof-detail");
  while (parent) {
    ancestors.push(parent);
    parent = parent.parentElement?.closest(".proof-detail");
  }
  return ancestors;
}

function selectedMaximumDepth() {
  return detailLevel === Number.POSITIVE_INFINITY ? maximumDepth : detailLevel;
}

function detailIsOpen(content) {
  const id = content.dataset.detailId;
  const depth = Number(content.dataset.depth);
  const baselineOpen = depth <= selectedMaximumDepth();
  if (presentation === "seamless") return baselineOpen;
  if (presentation === "compact") return baselineOpen || locallyOpened.has(id);
  if (locallyClosed.has(id)) return false;
  return baselineOpen || locallyOpened.has(id);
}

function updateToggle(toggle, open, baselineOpen) {
  const title = toggle.title;
  const symbol = toggle.querySelector(".detail-toggle-symbol");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", `${open ? "Collapse" : "Expand"}: ${title}`);
  symbol.textContent = open ? "−" : "+";
  toggle.hidden = presentation === "seamless" || (presentation === "compact" && baselineOpen);
}

function markDetailOpen(content) {
  const id = content.dataset.detailId;
  const baselineOpen = Number(content.dataset.depth) <= selectedMaximumDepth();
  locallyClosed.delete(id);
  if (baselineOpen) locallyOpened.delete(id);
  else locallyOpened.add(id);
}

function renderView() {
  const statementsOnly = detailLevel < 0;
  document.body.dataset.presentation = presentation;
  document.body.dataset.detailLevel = Number.isFinite(detailLevel) ? String(detailLevel) : "all";
  proofs.forEach((proof) => { proof.open = !statementsOnly; });

  detailContents.forEach((content) => {
    const depth = Number(content.dataset.depth);
    const baselineOpen = depth <= selectedMaximumDepth();
    const open = detailIsOpen(content);
    content.hidden = !open;
    const toggle = toggleForContent(content);
    if (toggle) updateToggle(toggle, open, baselineOpen);
  });

  detailLevelButtons.forEach((button) => {
    const value = button.dataset.detailLevel === "all"
      ? Number.POSITIVE_INFINITY
      : Number(button.dataset.detailLevel);
    button.setAttribute("aria-pressed", String(value === detailLevel));
  });
}

function resetLocalState() {
  locallyOpened.clear();
  locallyClosed.clear();
}

function setDetailLevel(value) {
  detailLevel = Number(value);
  resetLocalState();
  savePreferences();
  renderView();
}

function openDetailAndAncestors(toggle) {
  const content = document.getElementById(toggle.getAttribute("aria-controls"));
  if (!content) return;
  markDetailOpen(content);
  ancestorDetails(content).forEach(markDetailOpen);
}

function toggleDetail(toggle) {
  const content = document.getElementById(toggle.getAttribute("aria-controls"));
  if (!content) return;
  const id = content.dataset.detailId;
  const open = detailIsOpen(content);
  const baselineOpen = Number(content.dataset.depth) <= selectedMaximumDepth();
  if (open) {
    locallyOpened.delete(id);
    if (presentation === "headings" && baselineOpen) locallyClosed.add(id);
  } else {
    markDetailOpen(content);
    ancestorDetails(content).forEach(markDetailOpen);
  }
  renderView();
}

function revealHashTarget() {
  if (!window.location.hash) return;
  const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
  if (!target) return;
  const containingDetail = target.closest(".proof-detail");
  const toggle = target.matches("[data-detail-toggle]") ? target : containingDetail && toggleForContent(containingDetail);
  if (toggle) {
    if (detailLevel < 0) detailLevel = 1;
    openDetailAndAncestors(toggle);
    toggle.closest(".proof-shell")?.setAttribute("open", "");
    renderView();
  }
}

detailLevelButtons.forEach((button) => button.addEventListener("click", () => setDetailLevel(button.dataset.detailLevel)));
detailToggles.forEach((toggle) => toggle.addEventListener("click", () => toggleDetail(toggle)));

window.addEventListener("hashchange", revealHashTarget);

renderView();
revealHashTarget();
