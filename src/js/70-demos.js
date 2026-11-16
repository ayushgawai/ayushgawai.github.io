/* demos: the transit diagram's packets are SMIL; run them only while the sketch is on screen, never under reduced motion. */
(() => {
  const svg = document.querySelector("#demos .dm-tr");
  if (!svg || !svg.pauseAnimations) return;
  svg.pauseAnimations();
  if (NB.reduced) return;
  NB.onVisible(svg, () => svg.unpauseAnimations(), () => svg.pauseAnimations());
})();
