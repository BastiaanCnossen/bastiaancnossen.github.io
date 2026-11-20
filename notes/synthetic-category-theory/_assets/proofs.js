// Ordinary proof adapter. Reader chrome and navigation belong to reader-shell-v1.
(() => {
  const key = `${document.querySelector('[data-notes-reader]').dataset.notesReader}:proofs`;
  const proofs = [...document.querySelectorAll('details.proof')];
  const controls = [...document.querySelectorAll('button[data-proof-mode]')];
  function apply(value) {
    const mode = value === 'collapsed' ? 'collapsed' : 'displayed';
    document.body.dataset.proofMode = mode;
    proofs.forEach(proof => proof.open = mode === 'displayed');
    controls.forEach(control => control.setAttribute('aria-pressed', String(control.dataset.proofMode === mode)));
    try { localStorage.setItem(key, mode); } catch {}
  }
  let initial='displayed';
  try { initial=localStorage.getItem(key) || initial; } catch {}
  apply(initial);
  controls.forEach(control => control.addEventListener('click', () => apply(control.dataset.proofMode)));
})();
