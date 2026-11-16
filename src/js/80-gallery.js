/* gallery: native <dialog> lightbox for the scrapbook photos */
(() => {
  const root = document.getElementById("gallery");
  const dlg = root && root.querySelector(".lightbox");
  if (!dlg || !dlg.showModal) return;
  const shots = [...root.querySelectorAll(".snap-open")];
  const img = dlg.querySelector("img");
  const cap = dlg.querySelector("figcaption");
  const count = dlg.querySelector(".lb-count");
  let i = 0, opener = null;

  function show(n) {
    i = (n + shots.length) % shots.length;
    const b = shots[i];
    img.width = +b.dataset.w; img.height = +b.dataset.h;
    img.src = b.dataset.full;
    img.alt = b.querySelector("img").alt;
    cap.textContent = b.dataset.caption;
    count.textContent = `${i + 1} of ${shots.length}`;
  }

  shots.forEach((b, n) => b.addEventListener("click", () => { opener = b; show(n); dlg.showModal(); }));
  dlg.querySelector(".lb-prev").addEventListener("click", () => show(i - 1));
  dlg.querySelector(".lb-next").addEventListener("click", () => show(i + 1));
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); show(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); show(i + 1); }
  });
  // click on the backdrop (outside the paper) closes
  dlg.addEventListener("click", (e) => {
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
  dlg.addEventListener("close", () => { opener && opener.focus(); });
})();
