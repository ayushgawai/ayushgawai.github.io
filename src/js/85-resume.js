/* resume: track tabs swap the PDF everywhere (viewer, download, full screen, phone preview).
   The PDF iframe only loads on desktop, once the section is near the viewport. */
(() => {
  const root = document.getElementById("resume");
  if (!root) return;
  const viewer = root.querySelector(".rs-viewer");
  const tabs = [...root.querySelectorAll(".rs-tab")];
  const links = root.querySelectorAll(".rs-download, .rs-full, .rs-newtab, .rs-page");
  const full = root.querySelector(".rs-full"), exit = root.querySelector(".rs-exit");
  const cur = root.querySelector(".rs-current b"), prev = root.querySelector(".rs-preview");
  const wide = matchMedia("(min-width: 761px)");
  let frame = root.querySelector(".rs-frame");
  let pdf = frame.dataset.src, loaded = false, near = false;

  // swap in a fresh iframe instead of changing src, so switching tracks never adds browser-history entries
  const load = () => {
    if (!wide.matches) return;
    const next = frame.cloneNode();
    next.classList.remove("is-ready");
    next.addEventListener("load", () => next.classList.add("is-ready"));
    next.src = pdf + "#view=FitH";
    frame.replaceWith(next);
    frame = next; loaded = true;
  };

  // start loading about a screen early so the PDF is ready on arrival
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); near = true; load(); } }, { rootMargin: "600px 0px" });
  io.observe(root);
  wide.addEventListener("change", () => { if (near && !loaded) load(); });

  root.addEventListener("click", (e) => {
    const t = e.target.closest(".rs-tab"); if (!t) return;
    tabs.forEach((b) => b.setAttribute("aria-pressed", b === t));
    pdf = t.dataset.pdf;
    links.forEach((a) => { a.href = pdf; });
    prev.src = pdf.replace(/\.pdf$/, ".webp");
    prev.alt = "First page of my résumé: " + t.dataset.label;
    cur.textContent = t.dataset.label;
    frame.title = "Résumé PDF: " + t.dataset.label;
    loaded = false;
    if (near) load();
  });

  // "View full screen": real full screen on the viewer where supported; otherwise the link opens the PDF in a new tab
  full.addEventListener("click", (e) => {
    if (!wide.matches || !loaded || !viewer.requestFullscreen) return;
    e.preventDefault();
    viewer.requestFullscreen().catch(() => window.open(pdf, "_blank", "noopener"));
  });
  exit.addEventListener("click", () => document.exitFullscreen());
  let wasFull = false;
  document.addEventListener("fullscreenchange", () => {
    const isFull = document.fullscreenElement === viewer;
    if (isFull) exit.focus(); else if (wasFull) full.focus();
    wasFull = isFull;
  });
})();
