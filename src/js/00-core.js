/* Shared helpers. Every section script is concatenated after this file (alphabetical) into assets/site.js.
   Each section file must be self-contained: wrap in an IIFE, never leak globals besides window.NB. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* onVisible(el, start, stop): call start() when el scrolls into view, stop() when it leaves.
     Also toggles .is-visible (which un-pauses CSS animations inside [data-anim] and triggers .draw). */
  const watchers = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const w = watchers.get(e.target); if (!w) continue;
      e.target.classList.toggle("is-visible", e.isIntersecting);
      if (e.isIntersecting && !w.on) { w.on = true; w.start && w.start(); }
      else if (!e.isIntersecting && w.on) { w.on = false; w.stop && w.stop(); }
    }
  }, { rootMargin: "120px 0px" });
  function onVisible(el, start, stop) { if (!el) return; watchers.set(el, { start, stop, on: false }); io.observe(el); }

  /* loop(fn): rAF loop that only runs while el is visible. fn(dt seconds, t seconds). */
  function loop(el, fn) {
    let id = 0, last = 0;
    const tick = (now) => { const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; fn(dt, now / 1000); id = requestAnimationFrame(tick); };
    onVisible(el, () => { last = performance.now(); id = requestAnimationFrame(tick); }, () => cancelAnimationFrame(id));
  }

  /* jitter: deterministic pseudo-random (seeded) for hand-drawn wobble */
  function rng(seed = 1) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

  window.NB = { reduced, onVisible, loop, rng };

  document.addEventListener("DOMContentLoaded", () => {
    // auto-watch everything that wants visibility-driven animation
    document.querySelectorAll("[data-anim], .draw").forEach((el) => watchers.has(el) || onVisible(el));
    // nav tab highlighting
    const links = [...document.querySelectorAll(".tabs a")];
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const navIO = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.removeAttribute("aria-current"));
      const a = map.get(e.target.id); if (a) { a.setAttribute("aria-current", "true"); if (innerWidth < 760) a.scrollIntoView({ inline: "center", block: "nearest" }); }
    }), { rootMargin: "-45% 0px -50% 0px" });
    map.forEach((_, id) => { const s = document.getElementById(id); s && navIO.observe(s); });
  });
})();

/* click-to-load video facades: <button class="video" data-yt="ID"> or data-loom="ID" */
document.addEventListener("click", (e) => {
  const v = e.target.closest(".video[data-yt], .video[data-loom]");
  if (!v || v.classList.contains("is-playing")) return;
  const src = v.dataset.yt
    ? `https://www.youtube-nocookie.com/embed/${v.dataset.yt}?autoplay=1&rel=0`
    : `https://www.loom.com/embed/${v.dataset.loom}?autoplay=1&hide_owner=true`;
  const f = document.createElement("iframe");
  f.src = src; f.title = v.dataset.title || "Project demo video";
  f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true;
  v.classList.add("is-playing"); v.append(f);
});
