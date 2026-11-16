/* resume: track tabs swap the PDF; the preview iframe only loads once the section is near the viewport (desktop only). */
(() => {
  const root = document.getElementById("resume");
  if (!root) return;
  const frame = root.querySelector(".rs-frame");
  const tabs = [...root.querySelectorAll(".rs-tab")];
  const dl = root.querySelector(".rs-download"), open = root.querySelector(".rs-open");
  const mob = root.querySelector(".rs-mobile"), mobSub = root.querySelector(".rs-mobile-sub");
  const cur = root.querySelector(".rs-current b"), prev = root.querySelector(".rs-preview");
  const wide = matchMedia("(min-width: 761px)");
  let pdf = frame.dataset.src, loaded = false, near = false;

  const load = () => { if (!wide.matches) return; frame.classList.remove("is-ready"); frame.src = pdf + "#view=FitH"; loaded = true; };
  frame.addEventListener("load", () => frame.classList.add("is-ready"));

  // start loading about a screen early so the preview is ready on arrival
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); near = true; load(); } }, { rootMargin: "600px 0px" });
  io.observe(root);
  wide.addEventListener("change", () => { if (near && !loaded) load(); });

  root.addEventListener("click", (e) => {
    const t = e.target.closest(".rs-tab"); if (!t) return;
    tabs.forEach((b) => b.setAttribute("aria-pressed", b === t));
    pdf = t.dataset.pdf;
    dl.href = open.href = mob.href = pdf;
    prev.src = pdf.replace(/\.pdf$/, ".webp");
    mobSub.textContent = cur.textContent = t.dataset.label;
    frame.title = "Résumé preview: " + t.dataset.label;
    if (near) load();
  });
})();
