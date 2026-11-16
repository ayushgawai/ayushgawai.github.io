/* demos: click-to-load video facades + CarbonShift slide flipper. No iframes exist until a visitor presses play. */
(() => {
  const root = document.getElementById("demos");
  if (!root) return;

  root.addEventListener("click", (e) => {
    const play = e.target.closest(".dm-play");
    if (play) {
      const f = document.createElement("iframe");
      f.src = play.dataset.embed;
      f.title = play.dataset.title;
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      f.referrerPolicy = "strict-origin-when-cross-origin";
      f.loading = "lazy";
      play.replaceWith(f);
      f.focus();
      return;
    }
    const s = e.target.closest(".dm-slides");
    if (s) {
      const srcs = s.dataset.slides.split("|"), alts = s.dataset.alts.split("|");
      const i = ((+s.dataset.i || 0) + 1) % srcs.length;
      s.dataset.i = i;
      const img = s.querySelector("img");
      img.src = srcs[i]; img.alt = alts[i];
      s.querySelector(".dm-slide-count b").textContent = i + 1;
      s.setAttribute("aria-label", `Show next CarbonShift slide (${i + 1} of ${srcs.length})`);
    }
  });
})();
