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

  // Copying the LaTeX source of a formula: right-click (or long-press, or the
  // context-menu key on a focused formula) opens a small menu. The book's own
  // macros are expanded so that the copied code compiles anywhere.
  let latexMenu = null;

  function closeLatexMenu() {
    latexMenu?.remove();
    latexMenu = null;
  }

  function formulaSource(container) {
    try {
      const item = window.MathJax?.startup?.document?.getMathItemsWithin(container)?.[0];
      if (item?.math) return item.math.trim();
    } catch {
      // Fall back to the annotation that MathJax writes into the output.
    }
    return (container.querySelector("mjx-math")?.getAttribute("data-latex") || "").trim();
  }

  function readMacroArgument(text, cursor) {
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    if (text[cursor] === "{") {
      let depth = 0;
      for (let index = cursor; index < text.length; index += 1) {
        if (text[index] === "\\") { index += 1; continue; }
        if (text[index] === "{") depth += 1;
        if (text[index] === "}" && --depth === 0) return { value: text.slice(cursor + 1, index), end: index + 1 };
      }
      return null;
    }
    if (text[cursor] === "\\") {
      const name = text.slice(cursor).match(/^\\(?:[A-Za-z]+|.)/);
      return name ? { value: name[0], end: cursor + name[0].length } : null;
    }
    return cursor < text.length ? { value: text[cursor], end: cursor + 1 } : null;
  }

  function expandMacros(source) {
    const macros = window.MathJax?.config?.tex?.macros || {};
    let text = source;
    for (let pass = 0; pass < 12; pass += 1) {
      let changed = false;
      let output = "";
      let cursor = 0;
      const pattern = /\\([A-Za-z]+)(?![A-Za-z])/g;
      for (let match; (match = pattern.exec(text)); ) {
        const definition = macros[match[1]];
        if (definition === undefined) continue;
        const [body, count = 0] = Array.isArray(definition) ? definition : [definition, 0];
        let end = pattern.lastIndex;
        const values = [];
        for (let index = 0; index < count; index += 1) {
          const argument = readMacroArgument(text, end);
          if (!argument) break;
          values.push(argument.value);
          end = argument.end;
        }
        if (values.length < count) continue;
        let replacement = String(body).replace(/#([1-9])/g, (_, number) => values[Number(number) - 1] ?? "");
        // Keep a space after a control word so that "\\Sp X" does not become "\\mathrm{Sp}X" ambiguously.
        if (/\\[A-Za-z]+$/.test(replacement) && /^[A-Za-z]/.test(text.slice(end))) replacement += " ";
        output += text.slice(cursor, match.index) + replacement;
        cursor = end;
        pattern.lastIndex = end;
        changed = true;
      }
      text = output + text.slice(cursor);
      if (!changed) break;
    }
    return text;
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "latex-copy-toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 1600);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  function openLatexMenu(container, x, y) {
    closeLatexMenu();
    const source = formulaSource(container);
    if (!source) return false;
    const expanded = expandMacros(source);
    latexMenu = document.createElement("div");
    latexMenu.className = "latex-copy-menu";
    latexMenu.setAttribute("role", "menu");
    const options = [["Copy LaTeX", expanded]];
    if (expanded !== source) options.push(["Copy LaTeX with the book’s macros", source]);
    for (const [label, text] of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      button.addEventListener("click", async () => {
        closeLatexMenu();
        await copyText(text);
        showToast("LaTeX copied");
        container.focus?.();
      });
      latexMenu.append(button);
    }
    document.body.append(latexMenu);
    const width = latexMenu.offsetWidth;
    const height = latexMenu.offsetHeight;
    latexMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
    latexMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
    latexMenu.querySelector("button")?.focus();
    return true;
  }

  document.addEventListener("contextmenu", (event) => {
    const container = event.target.closest?.("mjx-container");
    if (!container) return;
    let { clientX: x, clientY: y } = event;
    if (!x && !y) {
      const box = container.getBoundingClientRect();
      x = box.left;
      y = box.bottom + 4;
    }
    if (openLatexMenu(container, x, y)) event.preventDefault();
  });
  document.addEventListener("click", (event) => {
    if (latexMenu && !latexMenu.contains(event.target)) closeLatexMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLatexMenu();
  });
  window.addEventListener("scroll", closeLatexMenu, { passive: true });
})();
