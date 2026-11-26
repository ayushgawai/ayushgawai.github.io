/* skills: on phones each group shows its first few skills, the rest behind "+N more" */
(() => {
  const SHOW = 6;
  document.querySelectorAll('#skills .sk-note').forEach((note) => {
    const chips = note.querySelector('.sk-chips'), n = chips ? chips.children.length - SHOW : 0;
    if (n <= 0) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sk-more hand'; b.textContent = `+${n} more`; b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => { const open = note.classList.toggle('sk-all'); b.textContent = open ? 'show fewer' : `+${n} more`; b.setAttribute('aria-expanded', open); });
    chips.after(b);
  });
})();
