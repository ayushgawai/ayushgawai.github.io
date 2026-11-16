/* research chapter: gaze scanpath cycling + wheelchair alert loop */
(() => {
  const $ = (id) => document.getElementById(id);

  /* ---------- study 1: eye-tracking scanpath ---------- */
  const gaze = $("r-gaze-svg");
  if (gaze) {
    const fixes = $("r-fixes"), sacc = $("r-saccades"), cur = $("r-cursor"), dot = $("r-cursor-dot");
    const MODES = {
      global: [[110, 105, 12], [250, 250, 16], [358, 244, 12], [160, 290, 10], [300, 200, 9]],
      sel: [[251, 252, 17], [110, 105, 8], [358, 244, 9], [160, 290, 10], [251, 252, 14]],
      sus: [[110, 105, 9], [250, 250, 9], [110, 105, 9], [358, 244, 9], [250, 250, 9], [300, 200, 9]]
    };
    const seq = ["global", "sel", "sus"];
    const btns = { global: $("r-mode-global"), sel: $("r-mode-sel"), sus: $("r-mode-sus") };
    const diff = $("r-diffmark");
    let mode = "global", t = 0, auto = !NB.reduced;

    function setModeUi(m) {
      Object.keys(btns).forEach((k) => {
        const on = k === m;
        btns[k].classList.toggle("is-on", on);
        btns[k].setAttribute("aria-pressed", String(on));
      });
      if (diff) diff.style.display = m === "sel" ? "" : "none";
    }

    function drawPath(key, progress) {
      const P = MODES[key], pts = P.slice(0, Math.max(2, Math.min(P.length, Math.ceil(progress * P.length))));
      let d = "M" + pts[0][0] + " " + pts[0][1];
      for (let i = 1; i < pts.length; i++) d += " L" + pts[i][0] + " " + pts[i][1];
      sacc.setAttribute("d", d);
      fixes.innerHTML = "";
      pts.forEach((f, i) => {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", f[0]); c.setAttribute("cy", f[1]); c.setAttribute("r", f[2]);
        c.setAttribute("fill", "url(#hatch-blue)");
        c.setAttribute("stroke", "var(--blue)"); c.setAttribute("stroke-width", "1.6");
        c.style.opacity = i === pts.length - 1 && progress * P.length < P.length - 1 ? .35 : 1;
        fixes.appendChild(c);
      });
      const li = pts.length - 1;
      [cur, dot].forEach((el) => { el.setAttribute("cx", pts[li][0]); el.setAttribute("cy", pts[li][1]); });
    }

    NB.loop(gaze, (dt) => {
      if (!auto) return;
      t += dt;
      const perFix = 1.4;
      const full = t / (perFix * MODES[mode].length);
      if (full >= 1.15) {
        mode = seq[(seq.indexOf(mode) + 1) % seq.length];
        t = 0;
        setModeUi(mode);
        return;
      }
      const p = Math.min(1, t / (perFix * MODES[mode].length));
      drawPath(mode, p);
      const done = p >= .97;
      cur.setAttribute("opacity", done ? 0 : 1);
      dot.setAttribute("opacity", done ? 0 : 1);
    });

    Object.keys(btns).forEach((k) => {
      btns[k].addEventListener("click", () => {
        auto = false; t = 0;
        setModeUi(k);
        drawPath(k, 1);
        cur.setAttribute("opacity", 0);
        dot.setAttribute("opacity", 0);
      });
    });

    if (NB.reduced) { setModeUi("global"); drawPath("global", 1); }
  }

  /* ---------- study 2: wheelchair obstacle alert loop ---------- */
  const chair = $("r-chair-svg");
  if (chair) {
    const ped = $("r-ped");
    const CUES = {
      inst: { text: "“Stop. Person ahead.”", label: "instructional cue" },
      info: { text: "“Person on your right, about 1 m.”", label: "informative cue" }
    };
    document.querySelectorAll("#research .r-cuebtn").forEach((b) => {
      b.addEventListener("click", () => {
        const c = CUES[b.dataset.cue];
        document.querySelectorAll("#research .r-cuebtn").forEach((o) => o.classList.toggle("is-on", o === b));
        $("r-cue").textContent = c.text;
        $("r-cue-label").textContent = c.label;
      });
    });

    let tt = 0;
    const cycle = 7, approachEnd = 3.2, holdEnd = 5.2;
    const easeIO = (v) => v * v * (3 - 2 * v);
    NB.loop(chair, (dt) => {
      tt = (tt + dt) % cycle;
      let x, alert = false;
      if (tt < approachEnd) x = 460 - 88 * easeIO(tt / approachEnd);
      else if (tt < holdEnd) { x = 372; alert = true; }
      else x = 372 + 88 * easeIO((tt - holdEnd) / (cycle - holdEnd));
      ped.setAttribute("transform", `translate(${x} 0)`);
      chair.classList.toggle("is-alert", alert);
    });
    if (NB.reduced) { ped.setAttribute("transform", "translate(372 0)"); chair.classList.add("is-alert"); }
  }
})();
