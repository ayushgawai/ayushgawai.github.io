/* research chapter: eye-tracking scanpath over two sketched images (three task modes) + wheelchair alert loop */
(() => {
  const root = document.getElementById("research");
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const SVGNS = "http://www.w3.org/2000/svg";
  /* phones: crop to the action (in-SVG labels are hidden there; HTML carries them) */
  const mq = matchMedia("(max-width: 640px)");
  const fit = () => {
    const g = $("r-gaze-svg"), c = $("r-chair-svg");
    if (g) g.setAttribute("viewBox", mq.matches ? "24 44 952 314" : "0 0 1000 420");
    if (c) c.setAttribute("viewBox", mq.matches ? "30 20 650 350" : "0 0 1000 400");
  };
  fit(); mq.addEventListener("change", fit);

  /* ---------- study 1: scanpath ---------- */
  const gaze = $("r-gaze-svg");
  if (gaze) {
    const fixG = $("r-fixes"), sacc = $("r-sacc"), cur = $("r-gaze"), countEl = $("r-count"), cap = $("r-mode-cap");
    const coverA = $("r-coverA"), coverB = $("r-coverB");
    const diffs = [...gaze.querySelectorAll("#r-diffs circle")];
    const btns = [...root.querySelectorAll(".r-mb")];
    /* [x, y, radius ~ fixation duration]; image B sits 498 px right of image A */
    const MODES = {
      global: { f: [[108, 124, 22], [226, 236, 28], [366, 234, 24], [304, 114, 16], [140, 300, 14], [400, 312, 12], [282, 304, 18]],
        cap: "task 1 · describe the whole picture: one image, long fixations spread across it" },
      sel: { f: [[226, 200, 14], [724, 200, 14], [209, 253, 18], [707, 253, 24], [366, 234, 12], [864, 234, 12], [368, 126, 12], [866, 124, 22], [108, 124, 10], [606, 124, 10]],
        cap: "task 2 · spot the difference: both images at once, short back-and-forth saccades between matching spots" },
      seq: { f: [[108, 124, 16], [304, 114, 14], [224, 258, 22], [366, 234, 18], [606, 124, 16], [802, 114, 14], [722, 258, 22], [864, 234, 18], [866, 124, 16]], sw: 4,
        cap: "task 3 · sequential comparison: A first, then B on its own, compared across time instead of side by side" }
    };
    const ORDER = ["global", "sel", "seq"], SACC = .22, HOLD = 1.8;
    let mode = "global", t = 0, auto = true, shown = -1, plan;

    const build = (m) => {
      let s = 0; const st = MODES[m].f.map((f) => { const a = s; s += SACC + f[2] / 22; return a; });
      plan = { st, end: s };
    };
    const setCovers = (k) => {
      const M = MODES[mode];
      let a = false, b = false, bt = "not shown";
      if (mode === "global") b = true;
      else if (mode === "seq") { if (k < M.sw) { b = true; bt = "B comes next"; } else a = true; }
      coverA.classList.toggle("is-on", a); coverB.classList.toggle("is-on", b);
      coverB.querySelector("text").textContent = bt;
    };
    const addFix = (k) => {
      const [x, y, r] = MODES[mode].f[k];
      const g = document.createElementNS(SVGNS, "g"); g.setAttribute("class", "r-fix");
      const c = document.createElementNS(SVGNS, "circle"); c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", r);
      const n = document.createElementNS(SVGNS, "text"); n.setAttribute("x", x); n.setAttribute("y", y); n.textContent = k + 1;
      g.append(c, n); fixG.append(g);
    };
    const showUpTo = (k) => {   /* fixations 0..k visible */
      while (shown < k) addFix(++shown);
      countEl.textContent = shown + 1;
      if (mode === "sel") { diffs[0].classList.toggle("is-on", shown >= 3); diffs[1].classList.toggle("is-on", shown >= 3); diffs[2].classList.toggle("is-on", shown >= 7); diffs[3].classList.toggle("is-on", shown >= 7); }
    };
    const reset = (m) => {
      mode = m; t = 0; shown = -1; fixG.textContent = ""; sacc.setAttribute("d", ""); countEl.textContent = "0";
      diffs.forEach((d) => d.classList.remove("is-on"));
      build(m); setCovers(0); cap.textContent = MODES[m].cap;
      btns.forEach((b) => { const on = b.dataset.mode === m; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
    };
    const render = () => {
      const F = MODES[mode].f, st = plan.st;
      let k = F.length - 1; while (k > 0 && st[k] > t) k--;
      const inSacc = t - st[k] < SACC && k > 0;
      const p = inSacc ? (t - st[k]) / SACC : 1;
      const prev = F[Math.max(0, k - 1)], tgt = F[k];
      const cx = prev[0] + (tgt[0] - prev[0]) * p, cy = prev[1] + (tgt[1] - prev[1]) * p;
      showUpTo(inSacc ? k - 1 : k);
      setCovers(inSacc ? k - 1 : k);
      if (mode === "seq") { const past = (inSacc ? k - 1 : k) >= MODES.seq.sw; [...fixG.children].forEach((g, i) => { g.style.opacity = past && i < MODES.seq.sw ? .3 : 1; }); }
      /* sequential mode: no saccade line across the swap, the pictures were never on screen together */
      const from = mode === "seq" && k >= MODES.seq.sw ? MODES.seq.sw : 0;
      const pts = F.slice(from, k).map((f) => f[0] + " " + f[1]);
      if (!(mode === "seq" && k === MODES.seq.sw)) pts.push(cx.toFixed(1) + " " + cy.toFixed(1));
      else pts.push(F[k][0] + " " + F[k][1]);
      sacc.setAttribute("d", "M" + pts.join(" L"));
      const done = t > plan.end;
      cur.setAttribute("cx", (mode === "seq" && k === MODES.seq.sw && inSacc ? tgt[0] : cx).toFixed(1));
      cur.setAttribute("cy", (mode === "seq" && k === MODES.seq.sw && inSacc ? tgt[1] : cy).toFixed(1));
      cur.style.opacity = done ? 0 : 1;
    };

    reset("global");
    if (NB.reduced) { t = plan.end + 1; render(); }
    else NB.loop(gaze, (dt) => {
      t += dt;
      if (t > plan.end + HOLD) reset(auto ? ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length] : mode);
      render();
    });
    btns.forEach((b) => b.addEventListener("click", () => {
      auto = false; reset(b.dataset.mode);
      if (NB.reduced) { t = plan.end + 1; render(); }
    }));
  }

  /* ---------- study 2: wheelchair alert loop ---------- */
  const chair = $("r-chair-svg");
  if (chair) {
    const ped = $("r-ped"), z = $("r-z"), tag = chair.querySelector(".r-tag");
    const wire = $("r-wire"), cmd = $("r-cmd"), wireLen = wire.getTotalLength();
    const stages = [...root.querySelectorAll(".r-pipe li")];
    const CUES = { inst: "“Stop. Person ahead.”", info: "“Person on your left.”" };
    root.querySelectorAll(".r-cuebtn").forEach((b) => b.addEventListener("click", () => {
      root.querySelectorAll(".r-cuebtn").forEach((o) => { o.classList.toggle("is-on", o === b); o.setAttribute("aria-pressed", String(o === b)); });
      $("r-cue").textContent = CUES[b.dataset.cue];
    }));

    const X0 = 900, XS = 435, V = 103.3, PXM = 150, FRONT = 300, BLUE = 615, RED = 450, LAG = 1.65, CYC = 9.5;
    const tBlue = (X0 - BLUE) / V;
    let lastZ = "";
    const fitTag = () => { const bb = z.getBBox(); tag.setAttribute("x", bb.x - 6); tag.setAttribute("y", bb.y - 3); tag.setAttribute("width", bb.width + 12); tag.setAttribute("height", bb.height + 6); };
    const stage = (s) => stages.forEach((li, i) => li.classList.toggle("is-on", i === s));
    const draw = (tt) => {
      const x = Math.max(XS, X0 - V * tt);
      ped.setAttribute("transform", `translate(${x.toFixed(1)} 0)`);
      ped.setAttribute("opacity", tt > 8 ? Math.max(0, 1 - (tt - 8) / .7).toFixed(2) : 1);
      const zt = "person " + ((x - FRONT) / PXM).toFixed(1) + " m";
      if (zt !== lastZ) { lastZ = zt; z.textContent = zt; fitTag(); }
      chair.classList.toggle("is-still", x <= XS);
      const alert = x <= RED && tt < 8.2;
      chair.classList.toggle("is-alert", alert);
      const c = tt - tBlue;   /* haptic command in flight for LAG seconds */
      if (c > 0 && c < LAG) { const p = wire.getPointAtLength(wireLen * c / LAG); cmd.setAttribute("cx", p.x); cmd.setAttribute("cy", p.y); cmd.style.opacity = 1; }
      else cmd.style.opacity = 0;
      if (alert) stage(tt - (X0 - RED) / V > 1.4 ? 5 : 4);
      else if (x <= BLUE && tt < 8.2) stage(3);
      else stage(tt < 8.2 ? Math.floor(tt / .35) % 3 : -1);
    };
    let t = 0;
    fitTag();
    if (NB.reduced) draw(5.5);
    else NB.loop(chair, (dt) => { t = (t + dt) % CYC; draw(t); });
  }
})();
