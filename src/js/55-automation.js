/* #automation — hover/focus a mechanism card to show which pattern it demonstrates.
   All the motion itself is CSS (paused offscreen via data-anim); this only swaps the
   caption so keyboard and touch users get the same “which one” feedback as a hover. */
(() => {
  const sk = document.querySelector("#automation .auto-sketch");
  if (!sk) return;
  const note = sk.querySelector("#auto-mode-note");
  if (!note) return;

  const defaultText = note.textContent;
  const text = {
    sched: "Left: the clock. The gear turns once a week, aggregates the fleet, and publishes one snapshot — the dashboard, digest and owner DMs all read it.",
    event: "Right: the event. A run flips to FAILED, the wire trips, the bell rings, and an alert with a deep link is out within minutes. Opt-in, default off."
  };

  sk.querySelectorAll(".auto-mech").forEach((m) => {
    const set = () => { note.textContent = text[m.dataset.mech]; };
    const clear = () => { note.textContent = defaultText; };
    m.addEventListener("mouseenter", set);
    m.addEventListener("focus", set);
    m.addEventListener("click", set);
    m.addEventListener("mouseleave", clear);
    m.addEventListener("blur", clear);
  });
})();
