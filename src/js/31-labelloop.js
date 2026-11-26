// "Technical deep dive" buttons open the <details> they point at.
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]');
  const d = a && document.getElementById(a.dataset.open);
  if (d) { d.open = true; }
});
