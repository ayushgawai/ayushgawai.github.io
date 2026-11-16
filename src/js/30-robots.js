/* robots chapter: leader/follower SO-101 arms (2-link IK, wrist kept pointing down), cube pick-and-place,
   camera frames stacking into the dataset pile, packets on the bus cable. */
(() => {
  const svg = document.querySelector("#robots .rb-svg");
  if (!svg) return;
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

  /* wrist targets relative to the shoulder: [dx, dy, gripOpen, seconds to next] */
  const K = [
    [70, -130, 1, .7],   /* home (hold) */
    [70, -130, 1, .9],
    [140, -90, 1, .7],   /* above the cube */
    [140, -20, 1, .45],  /* down */
    [140, -20, 0, .7],   /* close */
    [150, -110, 0, .9],  /* lift */
    [230, -100, 0, .7],  /* carry over the X */
    [230, -20, 0, .45],  /* lower */
    [230, -20, 1, .6],   /* release */
    [230, -100, 1, .9]   /* back up, then home */
  ];
  const T = K.reduce((s, k) => s + k[3], 0);
  const starts = []; K.reduce((s, k, i) => (starts[i] = s, s + k[3]), 0);
  const ease = (x) => x * x * (3 - 2 * x);
  function sample(t) {
    t = ((t % T) + T) % T;
    let i = K.length - 1; while (starts[i] > t) i--;
    const A = K[i], B = K[(i + 1) % K.length], f = ease((t - starts[i]) / A[3]);
    return { i, f, x: A[0] + (B[0] - A[0]) * f, y: A[1] + (B[1] - A[1]) * f, open: A[2] + (B[2] - A[2]) * f };
  }
  function ik(x, y) {
    const d = Math.min(Math.hypot(x, y), L1 + L2 - 1);
    const th = Math.atan2(x, -y) / D;
    const beta = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)) / D;
    const gam = Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)) / D;
    const a1 = th - beta, a2 = 180 - gam;
    return [a1, a2, 180 - a1 - a2];
  }
  function pose(a, s) {
    const [a1, a2, a3] = ik(s.x, s.y);
    a.l1.setAttribute("transform", `translate(0 -70) rotate(${a1.toFixed(2)})`);
    a.l2.setAttribute("transform", `translate(0 -150) rotate(${a2.toFixed(2)})`);
    a.wr.setAttribute("transform", `translate(0 -140) rotate(${a3.toFixed(2)})`);
    if (a.jaw) a.jaw.setAttribute("transform", `translate(${(s.open * 9).toFixed(2)} 0)`);
  }

  const START = [680, 450], GOAL = [772, 450];
  let demo = 1, lastCycle = 0;
  function placeCube(s) {
    let x, y, op = 1;
    if (s.i >= 4 && s.i <= 7) { x = fol.bx + s.x; y = SY + s.y + 70; }      /* held by the follower */
    else if (s.i >= 8) { [x, y] = GOAL; }
    else if (s.i === 0) { [x, y] = GOAL; op = 1 - s.f; }                     /* next demo: old cube clears */
    else { [x, y] = START; op = s.i === 1 ? s.f : 1; }                       /* and a fresh one appears */
    cube.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    cube.setAttribute("opacity", op.toFixed(2));
  }

  const lag = .28;
  function render(t) {
    pose(lead, sample(t));
    const s = sample(t - lag);
    pose(fol, s);
    placeCube(s);
    const cyc = Math.floor((t - lag) / T);
    if (cyc !== lastCycle) { lastCycle = cyc; demo = demo % 50 + 1; count.textContent = `demo ${demo} / 50`; }
    /* frames: camera lens → arc → top of the pile */
    frames.forEach((el, k) => {
      const u = ((t / 2.4 + k / frames.length) % 1);
      const x = 872 + 88 * u, y = 345 - 70 * Math.sin(Math.PI * u) + 76 * u;
      el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-14 + 18 * u).toFixed(1)}) scale(${(1 - .25 * u).toFixed(3)})`);
      el.setAttribute("opacity", (u < .1 ? u * 10 : u > .85 ? (1 - u) / .15 : 1).toFixed(2));
    });
    /* joint-angle packets on the cable, leader → follower */
    pkts.forEach((el, k) => {
      const p = cable.getPointAtLength(((t * .7 + k / pkts.length) % 1) * cableLen);
      el.setAttribute("cx", p.x.toFixed(1)); el.setAttribute("cy", p.y.toFixed(1));
    });
  }

  let clock = 1.2, playing = !NB.reduced;
  render(NB.reduced ? 5.0 : clock); /* static frame: cube lifted mid-carry */
  if (NB.reduced) { frames.forEach((el) => el.setAttribute("opacity", 0)); pkts.forEach((el) => el.style.display = "none"); }
  NB.loop(svg, (dt) => { if (playing) { clock += dt; render(clock); } });

  const btn = document.querySelector("#robots .rb-pause");
  if (NB.reduced) btn.hidden = true;
  btn.addEventListener("click", () => {
    playing = !playing;
    btn.textContent = playing ? "pause the arms" : "play the arms";
    btn.setAttribute("aria-pressed", String(!playing));
  });
})();
