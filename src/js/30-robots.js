/* robots chapter: leader/follower SO-101 arms (2-link IK, wrist kept pointing down), cube pick-and-place,
   camera frames stacking into the dataset pile, packets on the bus cable; obstacle-alert state machine;
   warehouse track through occlusion. */
(() => {
  const root = document.getElementById("robots");
  if (!root) return;
  const SVGNS = "http://www.w3.org/2000/svg";

  /* ---------- SO-101 leader / follower ---------- */
  const svg = root.querySelector(".rb-svg");
  if (svg) {
    const q = (s, r = svg) => r.querySelector(s);
    const L1 = 150, L2 = 140, D = Math.PI / 180;
    const arm = (id, bx) => {
      const g = q("#" + id);
      return { bx, l1: q(".rb-l1", g), l2: q(".rb-l2", g), wr: q(".rb-wr", g), jaw: q(".rb-jaw", g) };
    };
    const lead = arm("rb-lead", 170), fol = arm("rb-fol", 540);
    const SY = 400; /* shoulder height */
    const cube = q("#rb-cube"), count = q("#rb-count");
    const frames = [...svg.querySelectorAll(".rb-frame")];
    const pkts = [...svg.querySelectorAll(".rb-pkt")];
    const cable = q("#rb-cable"), cableLen = cable.getTotalLength();

    /* phones: crop the empty label margins (labels are hidden there; the key list carries them) */
    const mq = matchMedia("(max-width: 640px)");
    const fit = () => svg.setAttribute("viewBox", mq.matches ? "100 172 930 352" : "0 150 1060 430");
    fit(); mq.addEventListener("change", fit);

    /* wrist targets relative to the shoulder: [dx, dy, gripOpen, seconds to next] */
    const K = [
      [70, -130, 1, .7], [70, -130, 1, .9], [140, -90, 1, .7], [140, -20, 1, .45], [140, -20, 0, .7],
      [150, -110, 0, .9], [230, -100, 0, .7], [230, -20, 0, .45], [230, -20, 1, .6], [230, -100, 1, .9]
    ];
    const T = K.reduce((s, k) => s + k[3], 0);
    const starts = []; K.reduce((s, k, i) => (starts[i] = s, s + k[3]), 0);
    const ease = (x) => x * x * (3 - 2 * x);
    const sample = (t) => {
      t = ((t % T) + T) % T;
      let i = K.length - 1; while (starts[i] > t) i--;
      const A = K[i], B = K[(i + 1) % K.length], f = ease((t - starts[i]) / A[3]);
      return { i, f, x: A[0] + (B[0] - A[0]) * f, y: A[1] + (B[1] - A[1]) * f, open: A[2] + (B[2] - A[2]) * f };
    };
    const ik = (x, y) => {
      const d = Math.min(Math.hypot(x, y), L1 + L2 - 1);
      const th = Math.atan2(x, -y) / D;
      const beta = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)) / D;
      const gam = Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)) / D;
      const a1 = th - beta, a2 = 180 - gam;
      return [a1, a2, 180 - a1 - a2];
    };
    const pose = (a, s) => {
      const [a1, a2, a3] = ik(s.x, s.y);
      a.l1.setAttribute("transform", `translate(0 -70) rotate(${a1.toFixed(2)})`);
      a.l2.setAttribute("transform", `translate(0 -150) rotate(${a2.toFixed(2)})`);
      a.wr.setAttribute("transform", `translate(0 -140) rotate(${a3.toFixed(2)})`);
      if (a.jaw) a.jaw.setAttribute("transform", `translate(${(s.open * 9).toFixed(2)} 0)`);
    };

    const START = [680, 450], GOAL = [772, 450];
    let demo = 1, lastCycle = 0;
    const placeCube = (s) => {
      let x, y, op = 1;
      if (s.i >= 4 && s.i <= 7) { x = fol.bx + s.x; y = SY + s.y + 70; }  /* held by the follower */
      else if (s.i >= 8) { [x, y] = GOAL; }
      else if (s.i === 0) { [x, y] = GOAL; op = 1 - s.f; }                 /* next demo: old cube clears */
      else { [x, y] = START; op = s.i === 1 ? s.f : 1; }                   /* and a fresh one appears */
      cube.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      cube.setAttribute("opacity", op.toFixed(2));
    };

    const lag = .28;
    const render = (t) => {
      pose(lead, sample(t));
      const s = sample(t - lag);
      pose(fol, s);
      placeCube(s);
      const cyc = Math.floor((t - lag) / T);
      if (cyc !== lastCycle) { lastCycle = cyc; demo = demo % 50 + 1; count.textContent = `demo ${demo} / 50`; }
      frames.forEach((el, k) => {
        const u = (t / 2.4 + k / frames.length) % 1;
        const x = 872 + 88 * u, y = 345 - 70 * Math.sin(Math.PI * u) + 76 * u;
        el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-14 + 18 * u).toFixed(1)}) scale(${(1 - .25 * u).toFixed(3)})`);
        el.setAttribute("opacity", (u < .1 ? u * 10 : u > .85 ? (1 - u) / .15 : 1).toFixed(2));
      });
      pkts.forEach((el, k) => {
        const p = cable.getPointAtLength(((t * .7 + k / pkts.length) % 1) * cableLen);
        el.setAttribute("cx", p.x.toFixed(1)); el.setAttribute("cy", p.y.toFixed(1));
      });
    };

    let clock = 1.2, playing = !NB.reduced;
    render(NB.reduced ? 5.0 : clock); /* static frame: cube lifted mid-carry */
    if (NB.reduced) { frames.forEach((el) => el.setAttribute("opacity", 0)); pkts.forEach((el) => el.style.display = "none"); }
    NB.loop(svg, (dt) => { if (playing) { clock += dt; render(clock); } });

    const btn = root.querySelector(".rb-pause");
    if (NB.reduced) btn.hidden = true;
    btn.addEventListener("click", () => {
      playing = !playing;
      btn.textContent = playing ? "pause the arms" : "play the arms";
      btn.setAttribute("aria-pressed", String(!playing));
    });
  }

  /* index cards: bars grow in when the row scrolls into view */
  const cards = root.querySelector(".rb-cards");
  if (cards) NB.onVisible(cards);

  /* ---------- obstacle alert: range rings + debounced state machine ---------- */
  const obs = root.querySelector(".rb-obs");
  if (obs) {
    const person = obs.querySelector("#rb-person"), dist = obs.querySelector(".rb-dist");
    const sweep = obs.querySelector("#rb-sweep"), stateT = obs.querySelector("#rb-state");
    const ticksG = obs.querySelector("#rb-ticks");
    const N = 10, ticks = [];
    for (let i = 0; i < N; i++) {
      const r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("x", i * 18); r.setAttribute("y", 4); r.setAttribute("width", 13); r.setAttribute("height", 13); r.setAttribute("rx", 2);
      r.setAttribute("class", "rb-tick"); ticksG.append(r); ticks.push(r);
    }
    const COL = ["#2E7D5B", "#C9A100", "#D2412F"], NAMES = ["clear", "caution", "stop"];
    const PX = 120, CX = 300, CY = 372, TH = 20 * Math.PI / 180;
    const ease = (x) => x * x * (3 - 2 * x);
    const CYC = 13;
    const distAt = (t) => {
      t %= CYC;
      if (t < 5) return 2.7 - 1.95 * ease(t / 5);
      if (t < 6.4) return .75;
      if (t < 11.4) return .75 + 1.95 * ease((t - 6.4) / 5);
      return 2.7;
    };
    let level = 0, up = 0, down = 0, acc = 0, sw = 0;
    const hist = Array(N).fill(0);
    const step = (d) => {   /* one perception frame */
      const stopTh = level === 2 ? 1.25 : 1.0, cautTh = level >= 1 ? 2.25 : 2.0;
      const raw = d < stopTh ? 2 : d < cautTh ? 1 : 0;
      if (raw > level) { down = 0; if (++up >= 2) { level = raw; up = 0; } }
      else if (raw < level) { up = 0; if (++down >= 5) { level = raw; down = 0; } }
      else { up = down = 0; }
      hist.push(raw); hist.shift();
    };
    const draw = (d) => {
      person.setAttribute("transform", `translate(${(CX + Math.sin(TH) * d * PX).toFixed(1)} ${(CY - Math.cos(TH) * d * PX).toFixed(1)})`);
      dist.textContent = "person · " + d.toFixed(1) + " m";
      ticks.forEach((r, i) => { r.setAttribute("fill", COL[hist[i]]); r.setAttribute("stroke", COL[hist[i]]); r.setAttribute("fill-opacity", i === N - 1 ? 1 : .55); });
      obs.dataset.state = NAMES[level];
      stateT.textContent = NAMES[level].toUpperCase();
    };
    let t = 0;
    if (NB.reduced) { for (let k = 0; k < 40; k++) step(.9); draw(.9); }
    else {
      draw(distAt(0));
      NB.loop(obs, (dt) => {
        t += dt; acc += dt;
        while (acc >= .1) { acc -= .1; step(distAt(t)); }   /* 10 Hz frames */
        draw(distAt(t));
        sw += dt;
        const ph = (sw / 1.8) % 2, a = ph < 1 ? -90 + 180 * ph : 270 - 180 * ph;
        sweep.setAttribute("transform", `translate(${CX} ${CY}) rotate(${a.toFixed(1)}) scale(${ph < 1 ? 1 : -1} 1)`);
      });
    }
  }

  /* ---------- warehouse: Kalman-predicted box while the case is behind the pillar ---------- */
  const wh = root.querySelector(".rb-wh");
  if (wh) {
    const kase = wh.querySelector("#rb-case"), trk = wh.querySelector("#rb-track");
    const box = wh.querySelector("#rb-trk-box"), lbl = wh.querySelector("#rb-trk-t");
    const PER = 6, X0 = 40, X1 = 360;
    let t = 0, mode = "";
    const setMode = (m) => {
      if (m === mode) return; mode = m;
      box.classList.toggle("is-pred", m === "pred"); lbl.classList.toggle("is-pred", m === "pred");
      lbl.textContent = m === "pred" ? "#7 · predicted" : m === "re" ? "#7 · re-matched" : "#7 · tracked";
    };
    const draw = (tt) => {
      const u = (tt % PER) / PER, x = X0 + (X1 - X0) * u;
      kase.setAttribute("transform", `translate(${x.toFixed(1)} 150)`);
      const hidden = Math.abs(x - 200) < 34;
      /* constant-velocity prediction drifts a little while hidden, then snaps back on re-association */
      const tx = hidden ? x + (x - 166) * .22 : x;
      trk.setAttribute("transform", `translate(${tx.toFixed(1)} 150)`);
      trk.setAttribute("opacity", u > .94 ? ((1 - u) / .06).toFixed(2) : u < .04 ? (u / .04).toFixed(2) : 1);
      setMode(hidden ? "pred" : x > 234 && x < 290 ? "re" : "trk");
    };
    draw(NB.reduced ? PER * .5 : 0);
    if (!NB.reduced) NB.loop(wh, (dt) => { t += dt; draw(t); });
  }
})();
