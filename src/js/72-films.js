/* films: one reel at a time. Starting a film pauses any other; scrolling a playing film offscreen pauses it. */
(() => {
  const root = document.getElementById("films");
  if (!root) return;
  const vids = [...root.querySelectorAll("video")];
  vids.forEach((v) => {
    v.addEventListener("play", () => vids.forEach((o) => o !== v && !o.paused && o.pause()));
    if (window.NB) NB.onVisible(v, () => {}, () => v.paused || v.pause());
  });
})();
