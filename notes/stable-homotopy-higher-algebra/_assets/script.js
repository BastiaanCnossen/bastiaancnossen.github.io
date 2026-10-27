(() => {
  const proofStorageKey = "sht-ha-proof-mode";
  const body = document.body;
  const proofModeButtons = [...document.querySelectorAll("button[data-proof-mode]")];
  const proofs = [...document.querySelectorAll(".proof")];

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

})();
