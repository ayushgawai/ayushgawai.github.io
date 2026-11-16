/* path: draws the route through the stop dots (rebuilt on resize), reveals it with scroll progress, toggles stop notes. */
(() => {
  const trail = document.querySelector("#path .pt-trail");
  if (!trail) return;
  const route = trail.querySelector(".pt-route"), next = trail.querySelector(".pt-route-next"), move = trail.querySelector(".pt-move");
  const stops = [...trail.querySelectorAll(".pt-stop")];
  const dots = stops.map((s) => s.querySelector(".pt-dot"));
  let marks = []; // route length fraction at each stop

  function build() {
    const box = trail.getBoundingClientRect();
    const pts = dots.map((d) => { const r = d.getBoundingClientRect(); return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top }; });
    const multi = Math.abs(pts[1].y - pts[0].y) < 8; // stops share a row → serpentine layout
    const rad = 22, edge = 26;
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], dy = q.y - p.y;
      if (Math.abs(dy) < 8) { // along a row: gentle meander
        const dx = q.x - p.x, a = i % 2 ? 5 : -5;
        segs.push(`C${p.x + dx / 3} ${p.y + a} ${q.x - dx / 3} ${q.y - a} ${q.x} ${q.y}`);
      } else if (multi) { // row change: rounded U-turn outside the grid edge
        const right = p.x > box.width / 2, s = right ? 1 : -1;
        const xe = right ? box.width + edge : -edge;
        segs.push(`L${xe - rad * s} ${p.y} Q${xe} ${p.y} ${xe} ${p.y + rad} L${xe} ${q.y - rad} Q${xe} ${q.y} ${xe - rad * s} ${q.y} L${q.x} ${q.y}`);
      } else { // vertical trail: slight wobble
        const w = i % 2 ? 7 : -7;
        segs.push(`C${p.x + w} ${p.y + dy / 3} ${q.x - w} ${q.y - dy / 3} ${q.x} ${q.y}`);
      }
    }
    const last = segs.pop(); // final leg (to "next") is drawn dashed in red pencil
    const start = `M${pts[0].x} ${pts[0].y}`;
    // measure cumulative length per stop to know when the line reaches each one
    const lens = [0];
    for (let i = 1; i <= segs.length; i++) { route.setAttribute("d", start + segs.slice(0, i).join("")); lens.push(route.getTotalLength()); }
    const total = lens[lens.length - 1] || 1;
    marks = lens.map((l) => l / total);
    route.setAttribute("d", start + segs.join(""));
    // label the Nagpur → San José leg (the U-turn into the SJSU row) beside the line
    const sj = stops.findIndex((s) => s.hasAttribute("data-move"));
    move.classList.toggle("is-on", multi && sj > 0);
    if (multi && sj > 0) { move.style.left = "14px"; move.style.top = (pts[sj - 1].y + pts[sj].y) / 2 + "px"; move.dataset.at = sj; }
    const pl = pts[pts.length - 2];
    next.setAttribute("d", `M${pl.x} ${pl.y}` + last);
    update();
  }

  function update() {
    if (NB.reduced) { stops.forEach((s) => s.classList.add("is-reached")); trail.classList.add("is-done"); move.classList.add("is-shown"); return; }
    const r = trail.getBoundingClientRect(), vh = innerHeight;
    const p = Math.min(1, Math.max(0, (vh * 0.72 - r.top) / (r.height * 0.92)));
    route.style.strokeDashoffset = 1 - p;
    marks.forEach((m, i) => stops[i].classList.toggle("is-reached", p >= m - 0.001 && p > 0));
    if (move.dataset.at) move.classList.toggle("is-shown", p >= marks[move.dataset.at] - 0.04);
    const done = p >= 0.999;
    trail.classList.toggle("is-done", done);
    stops[stops.length - 1].classList.toggle("is-reached", done);
  }

  let on = false, ticking = false;
  const onScroll = () => { if (!on || ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); };
  addEventListener("scroll", onScroll, { passive: true });
  NB.onVisible(trail, () => { on = true; update(); }, () => { on = false; });
  new ResizeObserver(build).observe(trail);
  document.fonts && document.fonts.ready.then(build);

  trail.addEventListener("click", (e) => {
    const b = e.target.closest("button.pt-toggle"); if (!b) return;
    const open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", open);
    document.getElementById(b.getAttribute("aria-controls")).hidden = !open;
  });
})();
