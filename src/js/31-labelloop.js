// LabelLoop page: "Technical deep dive" buttons open their <details>; the robot sketch runs one parcel through the loop.
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]');
  const d = a && document.getElementById(a.dataset.open);
  if (d) d.open = true;
});

(() => {
  const fig = document.querySelector('#labelloop .ll-robot');
  if (!fig || !window.NB) return;
  const $ = (s) => fig.querySelector(s);
  const arms = [...fig.querySelectorAll('.ll-arm')].map((g) => ({
    g, side: +g.dataset.side, o: g.querySelector('.ll-tube-o'), i: g.querySelector('.ll-tube-i'),
    j: g.querySelectorAll('.ll-j'), claw: g.querySelector('.ll-claw'),
  }));
  const parcel = $('.ll-parcel'), cone = $('.ll-cone');
  const n = { read: $('.ll-read'), harn: $('.ll-harn'), wall: $('.ll-wall'), gok: $('.ll-gok'), zok: $('.ll-zok') };
  const rd = [...n.read.querySelectorAll('text')], say = $('.ll-say'), zokt = $('.ll-zokt');
  const stages = [...document.querySelectorAll('#labelloop .ll-st')];
  const status = $('.ll-status'), svg = $('.ll-rsvg');
  const mq = matchMedia('(max-width: 700px)'); // phones: crop the empty table ends, notes move to the status line
  const fit = () => svg.setAttribute('viewBox', mq.matches ? '130 40 740 440' : '0 0 1000 480');
  fit(); mq.addEventListener('change', fit);

  const L1 = 150, L2 = 150, SH = { '-1': [448, 162], '1': [552, 162] };
  const REST = (s) => [500 + s * 128, 292];
  const CASES = [ // the two real event parcels: 94043 by QR to zone 1 / left arm, 90291 by OCR to zone 2 / right arm
    { side: -1, zx: 250, l1: 'QR  420/94043', l2: 'ZIP 940 → zone 1 · left arm' },
    { side: 1, zx: 748, l1: 'OCR  90291', l2: 'ZIP 902 → zone 2 · right arm' },
  ];
  const T = 10, PX = 500, PY = 372, GY = 300; // cycle seconds, parcel spot, wrist height when gripping
  const ease = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));
  const seg = (t, a, b) => ease((t - a) / (b - a));
  const lerp = (a, b, u) => a + (b - a) * u;

  function ik(s, x, y) {
    const [sx, sy] = SH[s]; let dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy);
    const k = Math.min(d, L1 + L2 - 1) / d; dx *= k; dy *= k; d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx), b = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
    const e = a + (s < 0 ? b : -b); // elbow bends outward, away from the body
    return [[sx, sy], [sx + L1 * Math.cos(e), sy + L1 * Math.sin(e)], [sx + dx, sy + dy]];
  }
  function drawArm(A, w, gap) {
    const [S, E, W] = ik(A.side, w[0], w[1]);
    const d = `M${S[0]} ${S[1]} L${E[0].toFixed(1)} ${E[1].toFixed(1)} L${W[0].toFixed(1)} ${W[1].toFixed(1)}`;
    A.o.setAttribute('d', d); A.i.setAttribute('d', d);
    A.j[0].setAttribute('cx', S[0]); A.j[0].setAttribute('cy', S[1]);
    A.j[1].setAttribute('cx', E[0].toFixed(1)); A.j[1].setAttribute('cy', E[1].toFixed(1));
    const x = W[0], y = W[1];
    A.claw.setAttribute('d', `M${x - gap - 4} ${y} L${x + gap + 4} ${y} M${x - gap} ${y} L${x - gap} ${y + 32} L${x - gap + 5} ${y + 36} M${x + gap} ${y} L${x + gap} ${y + 32} L${x + gap - 5} ${y + 36}`);
  }
  const show = (el, on) => el.classList.toggle('on', on);

  let clock = 0, lastCase = -1;
  function frame(t) {
    const ci = Math.floor(t / T) % 2, c = CASES[ci], u = t % T, s = c.side;
    if (ci !== lastCase) {
      lastCase = ci;
      rd[1].textContent = c.l1; rd[2].textContent = c.l2;
      say.textContent = `“put the box into zone ${ci + 1}”`;
      zokt.textContent = `✓ in zone ${ci + 1}, checked`; zokt.setAttribute('x', c.zx);
    }
    // wrist path for the working arm: rest → over parcel → down → grip → lift → carry → down → release → rest
    let w = REST(s);
    const over = [PX, 262], grip = [PX, GY], high = [PX, 248], above = [c.zx, 262], drop = [c.zx, GY];
    if (u >= 2.4 && u < 3.3) { const k = seg(u, 2.4, 3.3); w = [lerp(w[0], over[0], k), lerp(w[1], over[1], k)]; }
    else if (u >= 3.3 && u < 3.9) { const k = seg(u, 3.3, 3.9); w = [PX, lerp(over[1], grip[1], k)]; }
    else if (u >= 3.9 && u < 4.4) w = grip;
    else if (u >= 4.4 && u < 4.9) { const k = seg(u, 4.4, 4.9); w = [PX, lerp(GY, high[1], k)]; }
    else if (u >= 4.9 && u < 6.0) { const k = seg(u, 4.9, 6.0); w = [lerp(PX, above[0], k), lerp(high[1], above[1], k)]; }
    else if (u >= 6.0 && u < 6.6) { const k = seg(u, 6.0, 6.6); w = [c.zx, lerp(above[1], drop[1], k)]; }
    else if (u >= 6.6 && u < 7.1) w = drop;
    else if (u >= 7.1 && u < 8.4) { const k = seg(u, 7.1, 8.4), r = REST(s); w = [lerp(c.zx, r[0], k), lerp(GY, r[1], k)]; }
    const closed = u >= 3.9 && u < 6.8, gap = closed ? lerp(46, 37, seg(u, 3.9, 4.3)) : (u >= 6.8 && u < 7.3 ? lerp(37, 46, seg(u, 6.8, 7.2)) : 46);
    arms.forEach((A) => (A.side === s ? drawArm(A, w, gap) : drawArm(A, REST(A.side), 46)));

    // parcel: set down, ride the claw while gripped, sit in the zone, then cleared
    let px = PX, py = PY, op = 1;
    if (u < 0.8) { const k = seg(u, 0, 0.8); py = lerp(PY - 60, PY, k); op = k; }
    else if (u >= 4.4 && u < 6.8) { px = w[0]; py = w[1] + 72; }
    else if (u >= 6.8) { px = c.zx; py = PY; op = 1 - seg(u, 8.8, 9.6); }
    parcel.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
    parcel.style.opacity = op.toFixed(2);

    cone.style.opacity = u > 0.8 && u < 2.4 ? (0.55 + 0.35 * Math.sin(u * 9)).toFixed(2) : 0;
    show(n.read, u > 0.8 && u < 8.6); rd[1].style.opacity = rd[2].style.opacity = u > 1.5 ? 1 : 0;
    show(n.harn, u > 2.4 && u < 4.6); show(n.gok, u > 4.3 && u < 6.2);
    show(n.wall, u > 4.6 && u < 7.0); show(n.zok, u > 7.0 && u < 9.4);
    const st = u < 0.8 ? 0 : u < 1.9 ? 1 : u < 2.4 ? 2 : u < 6.6 ? 3 : u < 8.6 ? 4 : -1;
    stages.forEach((el, k) => el.classList.toggle('on', k === st));
    const msg = u < 0.8 ? 'a parcel is set down' : u < 2.4 ? `reading the label: ${c.l1}, ${c.l2}` : u < 4.6 ? 'harness: exact pick, grasp checked on camera'
      : u < 7.0 ? `WALLX gets one sentence: “put the box into zone ${ci + 1}”` : u < 9.4 ? `✓ in zone ${ci + 1}, checked on camera` : '';
    if (status.textContent !== msg) status.textContent = msg;
  }

  fig.classList.add('js');
  if (NB.reduced) { frame(5.2); return; } // a still mid-carry, notes showing
  frame(0);
  NB.loop(fig, (dt) => { clock += dt; frame(clock); });
})();
