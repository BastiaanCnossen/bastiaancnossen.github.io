(() => {
  const proofStorageKey = "sht-ha-proof-mode";
  const navigationVisibilityStorageKey = "sht-ha-context-navigation-visible-v1";
  const contentsStorageKey = "sht-ha-contents-collapsed-v3";
  const body = document.body;
  const proofModeButtons = [...document.querySelectorAll("button[data-proof-mode]")];
  const navigationVisibilityControl = document.querySelector("[data-navigation-visibility]");
  const utilityItems = [...document.querySelectorAll("[data-utility-item]")];
  const utilityTriggers = [...document.querySelectorAll("[data-utility-trigger]")];
  const contextNavigation = document.querySelector("[data-context-nav]");
  const contextNavigationToggle = document.querySelector("[data-context-nav-toggle]");
  const contentsNavigations = [...document.querySelectorAll(".contents[data-collapsed]")];
  const contentsToggles = [...document.querySelectorAll("[data-contents-toggle]")];
  const proofs = [...document.querySelectorAll(".proof")];

  let savedContentsPreferences = {};
  let navigationVisible = true;
  try {
    savedContentsPreferences = JSON.parse(localStorage.getItem(contentsStorageKey) || "{}");
    navigationVisible = localStorage.getItem(navigationVisibilityStorageKey) !== "false";
  } catch {
    savedContentsPreferences = {};
  }

  function setProofExpanded(proof, expanded) {
    const button = proof.querySelector("[data-proof-toggle]");
    const content = button ? document.getElementById(button.getAttribute("aria-controls")) : null;
    proof.dataset.collapsed = String(!expanded);
    if (content) content.hidden = !expanded;
    if (button) {
      button.setAttribute("aria-expanded", String(expanded));
      button.setAttribute("aria-label", expanded ? "Collapse proof" : "Expand proof");
      button.title = expanded ? "Collapse proof" : "Expand proof";
    }
  }

  function setProofMode(mode) {
    const resolvedMode = mode === "collapsed" ? "collapsed" : "displayed";
    body.dataset.proofMode = resolvedMode;
    proofModeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.proofMode === resolvedMode));
    });
    proofs.forEach((proof) => setProofExpanded(proof, resolvedMode === "displayed"));
    try {
      localStorage.setItem(proofStorageKey, resolvedMode);
    } catch {
      // The preference remains page-local when storage is unavailable.
    }
  }

  let initialProofMode = "displayed";
  try {
    const savedProofMode = localStorage.getItem(proofStorageKey);
    initialProofMode = savedProofMode === "collapsed" || savedProofMode === "statements" ? "collapsed" : "displayed";
  } catch {
    // Use the displayed-proofs default.
  }
  setProofMode(initialProofMode);
  proofModeButtons.forEach((button) => button.addEventListener("click", () => setProofMode(button.dataset.proofMode)));
  proofs.forEach((proof) => {
    const button = proof.querySelector("[data-proof-toggle]");
    button?.addEventListener("click", () => setProofExpanded(proof, button.getAttribute("aria-expanded") !== "true"));
  });

  function closeUtilityPanels(except = null) {
    utilityItems.forEach((item) => {
      if (item === except) return;
      item.dataset.open = "false";
      item.querySelector("[data-utility-trigger]")?.setAttribute("aria-expanded", "false");
    });
  }

  utilityTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const item = trigger.closest("[data-utility-item]");
      if (!item) return;
      const shouldOpen = item.dataset.open !== "true";
      closeUtilityPanels(item);
      item.dataset.open = String(shouldOpen);
      trigger.setAttribute("aria-expanded", String(shouldOpen));
    });
  });

  function setContextNavigationOpen(open) {
    if (!contextNavigation || !contextNavigationToggle) return;
    contextNavigation.dataset.open = String(open);
    contextNavigationToggle.setAttribute("aria-expanded", String(open));
  }

  function renderNavigationVisibility() {
    body.dataset.contextNavigation = navigationVisible ? "visible" : "hidden";
    if (navigationVisibilityControl) navigationVisibilityControl.checked = navigationVisible;
    if (!navigationVisible) setContextNavigationOpen(false);
  }

  function setNavigationVisible(visible) {
    navigationVisible = visible;
    try {
      localStorage.setItem(navigationVisibilityStorageKey, String(visible));
    } catch {
      // The preference remains page-local when storage is unavailable.
    }
    renderNavigationVisibility();
  }

  function preferredCollapsed(navigation) {
    const key = navigation.dataset.ledgerKey;
    if (typeof savedContentsPreferences[key] === "boolean") return savedContentsPreferences[key];
    return navigation.dataset.defaultCollapsed === "true";
  }

  function renderContentsPreferences() {
    contentsNavigations.forEach((navigation) => {
      const ledger = navigation.closest("[data-contents-ledger]");
      const button = ledger?.querySelector("[data-contents-toggle]");
      const collapsed = preferredCollapsed(navigation);
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
      localStorage.setItem(contentsStorageKey, JSON.stringify(savedContentsPreferences));
    } catch {
      // The preference remains page-local when storage is unavailable.
    }
  }

  navigationVisibilityControl?.addEventListener("change", () => setNavigationVisible(navigationVisibilityControl.checked));
  contextNavigationToggle?.addEventListener("click", () => {
    setContextNavigationOpen(contextNavigation?.dataset.open !== "true");
  });
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

  renderNavigationVisibility();
  renderContentsPreferences();
})();
