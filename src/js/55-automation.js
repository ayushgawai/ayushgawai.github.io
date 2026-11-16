/* #automation: all motion is CSS. This only advances the week number on the snapshot page
   each time the scheduled cycle restarts, so every "week" publishes a new immutable report. */
(() => {
  const page = document.querySelector("#automation .as-page");
  const wk = page && page.querySelector(".as-wk");
  if (!wk || NB.reduced) return;
  let n = 23;
  page.addEventListener("animationiteration", () => { wk.textContent = `wk ${n = n >= 52 ? 1 : n + 1}`; });
})();
