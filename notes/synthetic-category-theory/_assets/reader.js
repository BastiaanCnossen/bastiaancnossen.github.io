/* Shared browser behavior. Manuscript proof logic belongs in its adapter. */
(() => {
  const script = document.querySelector("script[data-notes-reader]");
  if (!script || window.NotesReader) return;
  const work = script.dataset.notesReader;
  const prefix = `notes-reader:${work}:v1:`;
  const body = document.body;
  const read = (key, fallback = null) => {
    if (!key) return fallback;
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* Page-local controls still work. */ }
  };
  function preference(name, fallback) {
    return read(prefix + name, read(script.dataset[`legacy${name[0].toUpperCase()}${name.slice(1)}`], fallback));
  }
  function objectPreference(name) {
    try {
      const value = JSON.parse(preference(name, "{}"));
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  window.NotesReader = Object.freeze({ version: script.dataset.readerRevision, workId: work, read, write });

  const utilityItems = [...document.querySelectorAll("[data-utility-item]")];
  const utilityTriggers = [...document.querySelectorAll("[data-utility-trigger]")];
  function utilityExpanded(item) {
    return item.dataset.open === "true" || (item.dataset.open !== "closed" && item.dataset.hoverOpen === "true");
  }
  function syncUtility(item) {
    item.querySelector("[data-utility-trigger]")?.setAttribute("aria-expanded", String(utilityExpanded(item)));
  }
  function closeUtilityPanels(except = null) {
    utilityItems.forEach((item) => {
      if (item === except) return;
      // Suppress hover until the pointer leaves, so clicking twice really closes it.
      item.dataset.open = item.dataset.hoverOpen === "true" ? "closed" : "false";
      item.dataset.hoverOpen = "false";
      syncUtility(item);
    });
  }
  utilityItems.forEach((item) => {
    item.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse" || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      item.dataset.hoverOpen = "true";
      syncUtility(item);
    });
    item.addEventListener("pointerleave", () => {
      item.dataset.hoverOpen = "false";
      if (item.dataset.open === "closed") item.dataset.open = "false";
      syncUtility(item);
    });
  });
  utilityTriggers.forEach((trigger) => trigger.addEventListener("click", () => {
    const item = trigger.closest("[data-utility-item]");
    if (!item) return;
    const pinned = item.dataset.open === "true";
    closeUtilityPanels(item);
    item.dataset.open = pinned ? "closed" : "true";
    syncUtility(item);
  }));

  const navigation = document.querySelector("[data-context-nav]");
  const navigationToggle = document.querySelector("[data-context-nav-toggle]");
  const navigationCollapse = document.querySelector("[data-context-nav-collapse]");
  const visibilityControl = document.querySelector("[data-navigation-visibility]");
  const wide = matchMedia("(min-width: 1121px)");
  let navigationVisible = preference("navigation", "true") !== "false";
  let railCollapsed = preference("rail", "false") === "true";
  const contents = [...document.querySelectorAll(".contents[data-collapsed]")];
  const savedContents = objectPreference("contents");
  function setNavigationOpen(open) {
    if (!navigation || !navigationToggle) return;
    navigation.dataset.open = String(open && navigationVisible);
    navigationToggle.setAttribute("aria-expanded", navigation.dataset.open);
  }
  function renderVisibility() {
    body.dataset.contextNavigation = navigationVisible ? "visible" : "hidden";
    if (visibilityControl) visibilityControl.checked = navigationVisible;
    if (!navigationVisible) setNavigationOpen(false);
  }
  function renderRail() {
    if (!navigation || !navigationCollapse) return;
    const collapsed = wide.matches && railCollapsed;
    navigation.dataset.collapsed = String(collapsed);
    navigation.closest(".reader-layout")?.setAttribute("data-context-collapsed", String(collapsed));
    navigationCollapse.setAttribute("aria-expanded", String(!collapsed));
    navigationCollapse.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} ${navigation.getAttribute("aria-label") || "contents"}`);
    const symbol = navigationCollapse.querySelector("span");
    if (symbol) symbol.textContent = collapsed ? "‹" : "›";
  }
  function setContentsCollapsed(nav, collapsed) {
    const ledger = nav.closest("[data-contents-ledger]");
    nav.dataset.collapsed = String(collapsed);
    ledger?.setAttribute("data-open", String(!collapsed));
    ledger?.querySelector("[data-contents-toggle]")?.setAttribute("aria-expanded", String(!collapsed));
  }
  contents.forEach((nav) => {
    const saved = savedContents[nav.dataset.ledgerKey];
    setContentsCollapsed(nav, typeof saved === "boolean" ? saved : nav.dataset.defaultCollapsed === "true");
  });
  document.querySelectorAll("[data-contents-toggle]").forEach((button) => button.addEventListener("click", () => {
    const nav = document.getElementById(button.getAttribute("aria-controls"));
    if (!nav) return;
    const collapsed = nav.dataset.collapsed !== "true";
    setContentsCollapsed(nav, collapsed);
    savedContents[nav.dataset.ledgerKey] = collapsed;
    write(prefix + "contents", JSON.stringify(savedContents));
  }));
  visibilityControl?.addEventListener("change", () => {
    navigationVisible = visibilityControl.checked;
    write(prefix + "navigation", String(navigationVisible));
    renderVisibility();
  });
  navigationToggle?.addEventListener("click", () => setNavigationOpen(navigation?.dataset.open !== "true"));
  navigationCollapse?.addEventListener("click", () => {
    railCollapsed = !railCollapsed;
    write(prefix + "rail", String(railCollapsed));
    renderRail();
  });
  navigation?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setNavigationOpen(false);
  });
  wide.addEventListener("change", () => { renderRail(); setNavigationOpen(false); });
  renderVisibility();
  renderRail();

  // Optional active-position highlighting, supplied as data by the converter.
  const sectionLinks = [...document.querySelectorAll("[data-section-target]")];
  let sectionFrame = null;
  function updateSectionLocation() {
    sectionFrame = null;
    const targets = sectionLinks.map((link) => ({ link, target: document.getElementById(link.dataset.sectionTarget) })).filter(({ target }) => target);
    let current = targets[0];
    for (const candidate of targets) {
      if (candidate.target.getBoundingClientRect().top <= innerHeight * 0.32) current = candidate;
      else break;
    }
    targets.forEach(({ link }) => {
      if (link === current?.link) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }
  function scheduleSectionLocation() {
    if (sectionLinks.length && sectionFrame === null) sectionFrame = requestAnimationFrame(updateSectionLocation);
  }
  window.addEventListener("hashchange", scheduleSectionLocation);
  window.addEventListener("scroll", scheduleSectionLocation, { passive: true });
  window.addEventListener("resize", scheduleSectionLocation);
  scheduleSectionLocation();

  let latexMenu = null;
  let formulaFocus = null;
  function closeLatexMenu(restoreFocus = false) {
    latexMenu?.remove();
    latexMenu = null;
    if (restoreFocus) formulaFocus?.focus();
  }
  function formulaSource(container) {
    try {
      const item = window.MathJax?.startup?.document?.getMathItemsWithin(container)?.[0];
      if (item?.math) return item.math.trim();
    } catch { /* Fall back to a source annotation. */ }
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
    const macros = window.MathJax?.config?.tex?.macros || window.MathJax?.tex?.macros || {};
    let text = source;
    for (let pass = 0; pass < 12; pass += 1) {
      let changed = false;
      let output = "";
      let cursor = 0;
      const pattern = /\\([A-Za-z]+)(?![A-Za-z])/g;
      for (let match; (match = pattern.exec(text)); ) {
        // Do not read inherited object properties as mathematical macros.
        if (!Object.hasOwn(macros, match[1])) continue;
        const definition = macros[match[1]];
        const [replacementBody, count = 0] = Array.isArray(definition) ? definition : [definition, 0];
        if (typeof replacementBody !== "string" || (Array.isArray(definition) && definition.length > 2)) continue;
        let end = pattern.lastIndex;
        const values = [];
        for (let index = 0; index < count; index += 1) {
          const argument = readMacroArgument(text, end);
          if (!argument) break;
          values.push(argument.value);
          end = argument.end;
        }
        if (values.length < count) continue;
        let replacement = replacementBody.replace(/#([1-9])/g, (_, number) => values[Number(number) - 1] ?? "");
        if (/\\[A-Za-z]+$/.test(replacement) && /^[A-Za-z]/.test(text.slice(end))) replacement += " ";
        output += text.slice(cursor, match.index) + replacement;
        cursor = end;
        pattern.lastIndex = end;
        changed = true;
      }
      const expanded = output + text.slice(cursor);
      if (!changed || expanded === text) return expanded;
      text = expanded;
    }
    return text;
  }
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "latex-copy-toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    body.append(toast);
    setTimeout(() => toast.remove(), 1600);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      body.append(area);
      try {
        area.select();
        if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
      } finally { area.remove(); }
    }
  }
  function openLatexMenu(container, x, y) {
    closeLatexMenu();
    const source = formulaSource(container);
    if (!source) return false;
    formulaFocus = container;
    const expanded = expandMacros(source);
    latexMenu = document.createElement("div");
    latexMenu.className = "latex-copy-menu";
    latexMenu.setAttribute("role", "menu");
    latexMenu.setAttribute("aria-label", "Copy formula");
    const options = [["Copy LaTeX", expanded]];
    if (expanded !== source) options.push(["Copy LaTeX with manuscript macros", source]);
    for (const [label, text] of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      button.addEventListener("click", async () => {
        closeLatexMenu();
        try { await copyText(text); showToast("LaTeX copied"); }
        catch { showToast("Could not copy LaTeX"); }
        container.focus?.();
      });
      latexMenu.append(button);
    }
    body.append(latexMenu);
    latexMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - latexMenu.offsetWidth - 8))}px`;
    latexMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - latexMenu.offsetHeight - 8))}px`;
    latexMenu.querySelector("button")?.focus();
    return true;
  }
  document.addEventListener("contextmenu", (event) => {
    const container = event.target.closest?.("mjx-container");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (openLatexMenu(container, event.clientX || rect.left, event.clientY || rect.bottom + 4)) event.preventDefault();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".utility-dock")) closeUtilityPanels();
    if (latexMenu && !latexMenu.contains(event.target)) closeLatexMenu();
    if (navigation?.dataset.open === "true" && !event.target.closest?.("[data-context-nav], [data-context-nav-toggle]")) setNavigationOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (latexMenu) {
      if (event.key === "Escape") { event.preventDefault(); closeLatexMenu(true); return; }
      if (event.key === "Tab") { closeLatexMenu(true); return; }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        const options = [...latexMenu.querySelectorAll("button")];
        const current = options.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length;
        options[next]?.focus();
        event.preventDefault();
        return;
      }
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      const container = event.target.closest?.("mjx-container");
      if (container) {
        const rect = container.getBoundingClientRect();
        if (openLatexMenu(container, rect.left, rect.bottom + 4)) event.preventDefault();
      }
    }
    if (event.key !== "Escape") return;
    const openTrigger = utilityTriggers.find((trigger) => trigger.getAttribute("aria-expanded") === "true");
    const navOpen = navigation?.dataset.open === "true";
    closeUtilityPanels();
    setNavigationOpen(false);
    openTrigger?.focus();
    if (!openTrigger && navOpen) navigationToggle?.focus();
  });
  window.addEventListener("scroll", () => closeLatexMenu(), { passive: true });
})();
