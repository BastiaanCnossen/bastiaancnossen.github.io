(() => {
  const controls = document.querySelector("[data-entry-links]");
  if (!controls) return;
  const status = controls.querySelector("[data-entry-link-status]");
  for (const link of controls.querySelectorAll("[data-entry-link]")) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Copy ${link.textContent.toLowerCase()}`;
    const feedback = document.createElement("span");
    feedback.hidden = true;
    feedback.textContent = "Copied";
    button.append(feedback);
    button.setAttribute("aria-label", button.firstChild.textContent);
    let resetFeedback;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link.href);
        status.textContent = `${link.textContent} copied.`;
        feedback.hidden = false;
        clearTimeout(resetFeedback);
        resetFeedback = setTimeout(() => { feedback.hidden = true; status.textContent = ""; }, 1800);
      } catch {
        const address = document.createElement("input");
        address.type = "url";
        address.readOnly = true;
        address.value = link.href;
        address.setAttribute("aria-label", link.textContent);
        button.replaceWith(address);
        address.focus();
        address.select();
        status.textContent = "Link selected for manual copying.";
      }
    });
    link.replaceWith(button);
  }
})();
