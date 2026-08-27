const proofs = [...document.querySelectorAll(".proof-shell")];
const detailContents = [...document.querySelectorAll(".proof-detail")];
const detailToggles = [...document.querySelectorAll("[data-detail-toggle]")];
const detailLevelButtons = [...document.querySelectorAll("button[data-detail-level]")];
const navigationVisibilityControl = document.querySelector("[data-navigation-visibility]");
const utilityItems = [...document.querySelectorAll("[data-utility-item]")];
const utilityTriggers = [...document.querySelectorAll("[data-utility-trigger]")];
const contextNavigation = document.querySelector("[data-context-nav]");
const contextNavigationToggle = document.querySelector("[data-context-nav-toggle]");
const contextNavigationCollapse = document.querySelector("[data-context-nav-collapse]");
const contentsNavigations = [...document.querySelectorAll(".contents[data-collapsed]")];
const contentsToggles = [...document.querySelectorAll("[data-contents-toggle]")];
const sectionNavigationLinks = [...document.querySelectorAll("[data-section-target]")];
const locallyOpened = new Set();
const locallyClosed = new Set();
const preferenceKey = "layered-notes-reader-preferences-v1";
const contextNavigationPreferenceKey = "layered-notes-context-navigation-collapsed-v1";
const contextNavigationVisibilityPreferenceKey = "layered-notes-context-navigation-visible-v1";
const contentsPreferenceKey = "layered-notes-contents-collapsed-v2";
const wideContextNavigationQuery = window.matchMedia("(min-width: 1121px)");
let contextNavigationCollapsed = false;
let contextNavigationVisible = true;
let savedContentsPreferences = {};

try {
  contextNavigationCollapsed = window.localStorage.getItem(contextNavigationPreferenceKey) === "true";
} catch {
  // Storage may be unavailable on file URLs or in strict privacy modes.
}

try {
  contextNavigationVisible = window.localStorage.getItem(contextNavigationVisibilityPreferenceKey) !== "false";
} catch {
  // Storage may be unavailable on file URLs or in strict privacy modes.
}

try {
  savedContentsPreferences = JSON.parse(window.localStorage.getItem(contentsPreferenceKey) || "{}");
} catch {
  savedContentsPreferences = {};
}

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

function closeUtilityPanels(except = null) {
  utilityItems.forEach((item) => {
    if (item === except) return;
    item.dataset.open = "false";
    item.querySelector("[data-utility-trigger]")?.setAttribute("aria-expanded", "false");
  });
}

function toggleUtilityPanel(trigger) {
  const item = trigger.closest("[data-utility-item]");
  if (!item) return;
  const shouldOpen = item.dataset.open !== "true";
  closeUtilityPanels(item);
  item.dataset.open = String(shouldOpen);
  trigger.setAttribute("aria-expanded", String(shouldOpen));
}

function setContextNavigationOpen(open) {
  if (!contextNavigation || !contextNavigationToggle) return;
  contextNavigation.dataset.open = String(open);
  contextNavigationToggle.setAttribute("aria-expanded", String(open));
}

function renderContextNavigationVisibility() {
  document.body.dataset.contextNavigation = contextNavigationVisible ? "visible" : "hidden";
  if (navigationVisibilityControl) navigationVisibilityControl.checked = contextNavigationVisible;
  if (!contextNavigationVisible) setContextNavigationOpen(false);
}

function setContextNavigationVisible(visible) {
  contextNavigationVisible = visible;
  try {
    window.localStorage.setItem(contextNavigationVisibilityPreferenceKey, String(visible));
  } catch {
    // The preference remains page-local when storage is unavailable.
  }
  renderContextNavigationVisibility();
}

function renderContextNavigationPreference() {
  if (!contextNavigation || !contextNavigationCollapse) return;
  const collapsed = wideContextNavigationQuery.matches && contextNavigationCollapsed;
  contextNavigation.dataset.collapsed = String(collapsed);
  contextNavigation.closest(".reader-layout")?.setAttribute("data-context-collapsed", String(collapsed));
  contextNavigationCollapse.setAttribute("aria-expanded", String(!collapsed));
  contextNavigationCollapse.setAttribute(
    "aria-label",
    `${collapsed ? "Show" : "Hide"} ${contextNavigation.getAttribute("aria-label") || "contents"}`,
  );
  contextNavigationCollapse.querySelector("span").textContent = collapsed ? "‹" : "›";
}

function toggleContextNavigationCollapsed() {
  contextNavigationCollapsed = !contextNavigationCollapsed;
  try {
    window.localStorage.setItem(contextNavigationPreferenceKey, String(contextNavigationCollapsed));
  } catch {
    // The preference remains page-local when storage is unavailable.
  }
  renderContextNavigationPreference();
}

function preferredContentsCollapsed(navigation) {
  const key = navigation.dataset.ledgerKey;
  if (typeof savedContentsPreferences[key] === "boolean") return savedContentsPreferences[key];
  return navigation.dataset.defaultCollapsed === "true";
}

function renderContentsPreferences() {
  contentsNavigations.forEach((navigation) => {
    const ledger = navigation.closest("[data-contents-ledger]");
    const button = ledger?.querySelector("[data-contents-toggle]");
    const collapsed = preferredContentsCollapsed(navigation);
    navigation.dataset.collapsed = String(collapsed);
    if (!button) return;
    button.setAttribute("aria-expanded", String(!collapsed));
    ledger.dataset.open = String(!collapsed);
  });
}

function toggleContents(button) {
  const ledger = button.closest("[data-contents-ledger]");
  const navigation = ledger?.querySelector(".contents[data-collapsed]");
  if (!navigation) return;
  const collapsed = navigation.dataset.collapsed !== "true";
  navigation.dataset.collapsed = String(collapsed);
  ledger.dataset.open = String(!collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
  savedContentsPreferences[navigation.dataset.ledgerKey] = collapsed;
  try {
    window.localStorage.setItem(contentsPreferenceKey, JSON.stringify(savedContentsPreferences));
  } catch {
    // The preference remains page-local when storage is unavailable.
  }
}

function updateSectionNavigationLocation() {
  if (sectionNavigationLinks.length === 0) return;
  const threshold = window.innerHeight * 0.32;
  const targets = sectionNavigationLinks
    .map((link) => ({ link, target: document.getElementById(link.dataset.sectionTarget) }))
    .filter(({ target }) => target);
  let current = targets[0];
  for (const candidate of targets) {
    if (candidate.target.getBoundingClientRect().top <= threshold) current = candidate;
    else break;
  }
  targets.forEach(({ link }) => {
    if (link === current?.link) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

let sectionScrollFrame = null;
function scheduleSectionNavigationUpdate() {
  if (sectionScrollFrame !== null) return;
  sectionScrollFrame = window.requestAnimationFrame(() => {
    sectionScrollFrame = null;
    updateSectionNavigationLocation();
  });
}

detailLevelButtons.forEach((button) => button.addEventListener("click", () => setDetailLevel(button.dataset.detailLevel)));
detailToggles.forEach((toggle) => toggle.addEventListener("click", () => toggleDetail(toggle)));
navigationVisibilityControl?.addEventListener("change", () => setContextNavigationVisible(navigationVisibilityControl.checked));
utilityTriggers.forEach((trigger) => trigger.addEventListener("click", () => toggleUtilityPanel(trigger)));
contextNavigationToggle?.addEventListener("click", () => {
  setContextNavigationOpen(contextNavigation?.dataset.open !== "true");
});
contextNavigationCollapse?.addEventListener("click", toggleContextNavigationCollapsed);
contentsToggles.forEach((button) => button.addEventListener("click", () => toggleContents(button)));
contextNavigation?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setContextNavigationOpen(false);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".utility-dock")) closeUtilityPanels();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const openTrigger = utilityTriggers.find((trigger) => trigger.getAttribute("aria-expanded") === "true");
  const contextWasOpen = contextNavigation?.dataset.open === "true";
  closeUtilityPanels();
  setContextNavigationOpen(false);
  openTrigger?.focus();
  if (!openTrigger && contextWasOpen) contextNavigationToggle?.focus();
});
window.addEventListener("hashchange", revealHashTarget);
window.addEventListener("hashchange", updateSectionNavigationLocation);
window.addEventListener("scroll", scheduleSectionNavigationUpdate, { passive: true });
window.addEventListener("resize", scheduleSectionNavigationUpdate);
wideContextNavigationQuery.addEventListener("change", renderContextNavigationPreference);
wideContextNavigationQuery.addEventListener("change", renderContentsPreferences);

renderView();
renderContextNavigationVisibility();
renderContextNavigationPreference();
renderContentsPreferences();
revealHashTarget();
updateSectionNavigationLocation();
