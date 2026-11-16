/* Hero cover: a hand-drawn mobile. Ink stars morph and "boil"; verlet strings hang paper tags with tool logos.
   Pointer velocity is wind; tags can be grabbed and flung; click a tag for a note on where the tool was used. */
(() => {
  const hero = document.getElementById("top");
  const canvas = hero && hero.querySelector(".hero-canvas");
  if (!canvas || !window.NB) return;
  const ctx = canvas.getContext("2d");
  const note = hero.querySelector(".hero-note");
  const noteName = note.querySelector(".hero-note-name"), noteLine = note.querySelector(".hero-note-line");
  const list = hero.querySelector(".hero-tools");
  const buttons = [...list.querySelectorAll("button")];
  const REDUCED = NB.reduced;
  const INK = "#1F2329", INK2 = "#4A5059", BLUE = "#2346B0", CARD = "#FCFBF7";
  const HAND = '"Shantell Sans", "Comic Neue", cursive';
  const TAU = Math.PI * 2;

  const tools = buttons.map((btn, i) => ({
    i, btn, slug: btn.dataset.slug, p: +btn.dataset.p || 3,
    name: btn.querySelector("b").textContent, line: btn.querySelector("span").textContent, rope: null,
  }));

  /* ---------- star shapes: radial functions sampled at NS angles (from the top tip, clockwise) ---------- */
  const NS = 120, COS = new Float32Array(NS), SIN = new Float32Array(NS);
  for (let i = 0; i < NS; i++) { const a = (i / NS) * TAU - Math.PI / 2; COS[i] = Math.cos(a); SIN[i] = Math.sin(a); }
  function polyStar(n, inner) {
    const out = new Float32Array(NS), step = Math.PI / n;
    for (let i = 0; i < NS; i++) {
      const a = (i / NS) * TAU, k = Math.floor(a / step + 1e-9), a0 = k * step, a1 = a0 + step;
      const r0 = k % 2 ? inner : 1, r1 = k % 2 ? 1 : inner;
      const px = r0 * Math.cos(a0), py = r0 * Math.sin(a0), qx = r1 * Math.cos(a1) - px, qy = r1 * Math.sin(a1) - py;
      const dx = Math.cos(a), dy = Math.sin(a);
      out[i] = (px * qy - py * qx) / (dx * qy - dy * qx);
    }
    return out;
  }
  function sparkle(p) { // 4-point sparkle with concave sides
    const out = new Float32Array(NS);
    for (let i = 0; i < NS; i++) { const a = (i / NS) * TAU; out[i] = Math.pow(Math.pow(Math.abs(Math.cos(a)), p) + Math.pow(Math.abs(Math.sin(a)), p), -1 / p); }
    return out;
  }
  const SHAPES = [sparkle(0.55), polyStar(5, 0.45), polyStar(6, 0.56), polyStar(8, 0.47), polyStar(6, 0.17)];
  const F1 = (TAU * 3) / NS, F2 = (TAU * 5) / NS, F3 = (TAU * 11) / NS;
  const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return (s - Math.floor(s)) * TAU; };
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  /* ---------- state ---------- */
  let W = 0, H = 0, dpr = 1, S = 1, FS = 14, stars = [], ropes = [], order = [];
  let X, Y, PX, PY, IM, WK;
  let T = 0, acc = 0, dropT0 = -1, tagsReady = false, logos = null, fontOK = false, awake = 2;
  let mx = -1e4, my = -1e4, wvx = 0, wvy = 0, lastMove = 0, hovered = null, focusRope = null, grab = null, down = null;
  let noteTool = null, nX = 0, nY = 0, nW = 0, nH = 0;
  const STEP = 1 / 120, G = 1500, DAMP = 0.992, ITER = 10, WIND_R = 150;

  /* ---------- layout: stars across the top, ropes in staggered depth rows, kept clear of the copy ---------- */
  function layout(intro) {
    const mobile = innerWidth < 760;
    W = hero.clientWidth; H = hero.clientHeight;
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    S = mobile ? 1.05 : 1.1;
    FS = Math.max(14, 12 * S); // tag labels never render below 14px
    const hb = hero.getBoundingClientRect();
    // desktop: each line of copy is its own obstacle (CSS shrinks them to fit-content), so strings can hang down beside the name
    const main = hero.querySelector(".hero-main");
    const obs = (mobile ? [main] : [...main.children]).map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0)
      .map((b) => ({ l: b.left - hb.left, r: b.right - hb.left, t: b.top - hb.top }));
    const mg = mobile ? 8 : 40, pad = mobile ? 44 : 16;
    const limitAt = (x0, x1) => { let L = H - 16; for (const o of obs) if (x1 > o.l - mg && x0 < o.r + mg) L = Math.min(L, o.t - pad); return L; };

    const rnd = NB.rng(11);
    const nStars = mobile ? (W < 440 ? 4 : 5) : Math.max(6, Math.min(12, Math.round((W - 80) / 118)));
    const left = mobile ? 10 : 34, right = W - (mobile ? 10 : 60), colW = (right - left) / nStars;
    const tagH = 64 * S, rowH = tagH + (mobile ? 12 : 17) * S;
    stars = [];
    for (let s = 0; s < nStars; s++) {
      const big = rnd() < 0.3;
      const R = (big ? 24 + rnd() * 10 : 12 + rnd() * 10) * (mobile ? 0.8 : 1);
      const x = left + colW * (s + 0.5) + (rnd() - 0.5) * colW * (mobile ? 0.12 : 0.34);
      const y = (mobile ? 28 : 30) + R * 0.5 + rnd() * (mobile ? 30 : 42);
      const seq = [0, 1, 2, 3, 4].sort(() => rnd() - 0.5);
      const hatch = s % 4 === 1 ? 1 : s % 4 === 3 ? 2 : 0;
      const hp = new Path2D();
      if (hatch) for (let k = -2 * R; k < 2 * R; k += 3.6) { hp.moveTo(k - R, R); hp.lineTo(k + R, -R); }
      // brick pattern: every other column starts half a row lower so neighbouring tags interleave
      const top0 = y + R + 18 * S + (s % 2 ? rowH * 0.5 : 0), x0 = x - colW / 2, x1 = x + colW / 2;
      const cap = Math.max(1, Math.min(5, Math.floor((limitAt(x0, x1) - top0 - tagH + 10 * S) / rowH) + 1));
      stars.push({ x, y, R, rot: (rnd() - 0.5) * 0.5, seq, period: 7 + rnd() * 5, phase: rnd() * 5, hatch, hp, seed: s * 7.31 + 1,
        r: new Float32Array(NS), r2: new Float32Array(NS), top0, cap, ink: 1 });
    }

    // choose tools by priority to fit capacity, keep the domain order
    const capTotal = stars.reduce((a, s) => a + s.cap, 0);
    const n = Math.min(tools.length, capTotal, mobile ? 20 : 48);
    const keep = new Set(tools.slice().sort((a, b) => a.p - b.p || a.i - b.i).slice(0, n).map((t) => t.i));
    const chosen = tools.filter((t) => keep.has(t.i));
    tools.forEach((t) => (t.rope = null));
    // share tags across stars in proportion to capacity
    const k = stars.map((s) => Math.floor((n * s.cap) / capTotal));
    let left2 = n - k.reduce((a, b) => a + b, 0);
    for (let s = 0; left2 > 0; s = (s + 1) % nStars) if (k[s] < stars[s].cap) { k[s]++; left2--; }

    // place tags so none overlap at rest: a row that would collide is skipped and the tool moves on to the next star
    ctx.font = `500 ${FS}px ${HAND}`;
    const hole0 = 10.5 * S, placed = [];
    const hits = (b) => placed.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
    ropes = [];
    let ti = 0, P = 0, carry = 0;
    stars.forEach((st, s) => {
      const want = k[s] + carry, picks = [];
      for (const row of [...Array(st.cap).keys()].sort(() => rnd() - 0.5)) {
        if (picks.length >= want || ti >= chosen.length) break;
        const tool = chosen[ti];
        const side = (picks.length + s) % 2 ? 1 : -1;
        const off = side * (0.25 + rnd() * 0.55) * (want > 1 ? 1 : 0.3) * (mobile ? 0.4 : 1);
        const holeY = st.top0 + row * rowH + (rnd() - 0.5) * (mobile ? 4 : 8) * S;
        const w = tagWidth(tool, ctx.measureText(tool.name).width + 4), cx = st.x - Math.sin(off - st.rot) * 0.6 * st.R;
        const box = [cx - w / 2 - 8, holeY - hole0 - 4, cx + w / 2 + 8, holeY - hole0 + tagH + 4];
        if (hits(box)) continue;
        placed.push(box); picks.push({ tool, off, holeY }); ti++;
      }
      carry = want - picks.length;
      picks.sort((a, b) => a.holeY - b.holeY).forEach(({ tool, off, holeY }) => {
        const L = holeY - st.y;
        const segs = Math.max(6, Math.min(14, Math.round(L / 26)));
        const r = { tool, star: st, off, L, segs, seg: L / segs, cur: L / segs, a0: P, com: P + segs + 1, d: tagH / 2 - 10 * S,
          h: tagH, hole0, w: 60 * S, delay: 0, phi: 0, om: 0, spin: rnd() < 0.5 ? -1 : 1, seed: rnd() * 100,
          lift: 0, tilt: (rnd() - 0.5) * 0.14, th: 0, c: 1, s: 0, sx: 1, img: null, hov: null, back: null, depth: holeY };
        tool.rope = r; ropes.push(r); P += segs + 2;
      });
    });
    X = new Float32Array(P); Y = new Float32Array(P); PX = new Float32Array(P); PY = new Float32Array(P);
    IM = new Float32Array(P); WK = new Float32Array(P);
    const t0 = dropT0 < 0 ? 0.3 : dropT0;
    for (const r of ropes) {
      const ax = anchorX(r), ay = anchorY(r);
      for (let j = 0; j <= r.segs + 1; j++) {
        const i = r.a0 + j, last = j === r.segs + 1;
        const y = ay + (last ? (intro ? r.seg * 0.02 * r.segs : r.L) + r.d : r.seg * j * (intro ? 0.02 : 1));
        X[i] = PX[i] = ax; Y[i] = PY[i] = y;
        IM[i] = j === 0 ? 0 : last ? 0.3 : 1;
        WK[i] = last ? 1 : 0.3 * (j / r.segs);
      }
      r.delay = t0 + ((r.tool.i % 7) / 7) * 0.12 + (ax / W) * 0.32;
      r.grow = intro; r.cur = intro ? r.seg * 0.02 : r.seg;
    }
    canvas.dataset.tags = ropes.length;
    order = ropes.slice().sort((a, b) => a.depth - b.depth);
    if (!intro) for (let i = 0; i < 240; i++) step(true);
    if (tagsReady) buildImages();
    awake = 2;
  }

  /* ---------- stars ---------- */
  function shapeStar(st, still) {
    let a = SHAPES[st.seq[0]], b = a, e = 0;
    if (!still) {
      const tt = T / st.period + st.phase, k = Math.floor(tt);
      a = SHAPES[st.seq[k % 5]]; b = SHAPES[st.seq[(k + 1) % 5]]; e = smooth((tt - k - 0.55) / 0.45);
    }
    const bf = still ? 3 : Math.floor(T * 8);
    const p1 = hash(st.seed + bf), p2 = hash(st.seed * 2.1 + bf), p3 = hash(st.seed * 3.7 + bf), q = hash(st.seed * 5.3 + bf);
    const amp = 0.012 + 0.6 / st.R;
    for (let i = 0; i < NS; i++) {
      const base = st.R * (a[i] + (b[i] - a[i]) * e);
      st.r[i] = base * (1 + amp * (Math.sin(i * F1 + p1) + 0.6 * Math.sin(i * F2 + p2) + 0.35 * Math.sin(i * F3 + p3)));
      st.r2[i] = base * (1 + amp * 1.3 * Math.sin(i * F2 + q) + 0.03);
    }
  }
  const STRING_ANGLE = Math.PI; // attach toward the bottom of the star
  function anchorIdx(r) { let a = (STRING_ANGLE + r.off - r.star.rot) / TAU; a -= Math.floor(a); return Math.round(a * NS) % NS; }
  function anchorX(r) { const st = r.star, i = anchorIdx(r), rr = 0.35 * st.R + 0.4 * (st.r[i] || st.R * 0.5); return st.x + rr * (COS[i] * Math.cos(st.rot) - SIN[i] * Math.sin(st.rot)); }
  function anchorY(r) { const st = r.star, i = anchorIdx(r), rr = 0.35 * st.R + 0.4 * (st.r[i] || st.R * 0.5); return st.y + rr * (COS[i] * Math.sin(st.rot) + SIN[i] * Math.cos(st.rot)); }

  function drawStar(st) {
    const c = Math.cos(st.rot), s = Math.sin(st.rot);
    ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * st.x, dpr * st.y);
    const prog = REDUCED ? 1 : smooth((T - 0.05 - (st.x / W) * 0.25) / 0.42);
    if (prog <= 0) return;
    const R = st.r, count = Math.floor(prog * (NS + 5));
    if (st.hatch && prog >= 1) {
      ctx.save(); ctx.beginPath();
      for (let i = 0; i < NS; i++) i ? ctx.lineTo(COS[i] * R[i], SIN[i] * R[i]) : ctx.moveTo(COS[i] * R[i], SIN[i] * R[i]);
      ctx.clip();
      ctx.lineWidth = 1; ctx.strokeStyle = st.hatch === 2 ? "rgba(35,70,176,.6)" : "rgba(31,35,41,.42)";
      ctx.stroke(st.hp); ctx.restore();
    }
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
      const k = i % NS, o = i >= NS ? 1 + 0.035 * (i - NS) : 1; // overshoot the closing stroke like a pen
      i ? ctx.lineTo(COS[k] * R[k] * o, SIN[k] * R[k] * o) : ctx.moveTo(COS[k] * R[k], SIN[k] * R[k]);
    }
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    if (prog >= 1) {
      const R2 = st.r2; ctx.beginPath();
      for (let i = 0; i < NS; i++) i ? ctx.lineTo(COS[i] * R2[i], SIN[i] * R2[i]) : ctx.moveTo(COS[i] * R2[i], SIN[i] * R2[i]);
      ctx.closePath(); ctx.lineWidth = 0.9; ctx.strokeStyle = "rgba(31,35,41,.32)"; ctx.stroke();
    }
  }

  /* ---------- physics ---------- */
  function step(still) {
    const dt2 = STEP * STEP, windOn = !still && (Math.abs(wvx) + Math.abs(wvy) > 15), R2 = WIND_R * WIND_R;
    const breeze = still || REDUCED ? 0 : 1;
    for (const r of ropes) {
      const a = r.a0, n = r.segs;
      X[a] = anchorX(r); Y[a] = anchorY(r);
      if (r.grow) { // intro: the string pays out with a little overshoot, so the tag drops and bounces
        const f = dropT0 < 0 ? 0 : Math.min(1, Math.max(0, (T - r.delay) / 0.62)), u = f - 1;
        r.cur = r.seg * Math.max(0.02, 1 + 2.4 * u * u * u + 1.4 * u * u);
        if (f >= 1) { r.cur = r.seg; r.grow = false; }
        X[r.com] = PX[r.com] = X[r.com - 1]; // drop straight down: no spin until it lands
      }
      const ci = r.com;
      const bx = breeze * 34 * (0.6 * Math.sin(T * 0.53 + X[ci] * 0.0031) + 0.32 * Math.sin(T * 1.41 + X[ci] * 0.009 + r.seed) + 0.3 * Math.sin(T * 0.19 + r.seed * 0.3));
      const by = breeze * 8 * Math.sin(T * 0.83 + r.seed);
      for (let i = a + 1; i <= ci; i++) {
        if (IM[i] === 0) continue;
        let vx = (X[i] - PX[i]) * DAMP, vy = (Y[i] - PY[i]) * DAMP;
        const dep = WK[i];
        let ax = r.grow ? 0 : bx * (0.25 + dep), ay = G + by * dep;
        if (windOn) {
          const dx = X[i] - mx, dy = Y[i] - my, d2 = dx * dx + dy * dy;
          if (d2 < R2) { let f = 1 - d2 / R2; f *= f * 6 * dep; ax += (wvx - vx / STEP) * f; ay += (wvy - vy / STEP) * f; }
        }
        PX[i] = X[i]; PY[i] = Y[i];
        X[i] += vx + ax * dt2; Y[i] += vy + ay * dt2;
      }
      // twist about the string: torsion spring, driven by wind across the tag
      let tq = bx * 0.012 * r.spin;
      if (windOn) { const dx = X[ci] - mx, dy = Y[ci] - my, d2 = dx * dx + dy * dy; if (d2 < R2) { const f = 1 - d2 / R2; tq += wvx * 0.022 * f * f * r.spin; } }
      r.om += (-7 * r.phi - 1.5 * r.om + tq) * STEP;
      r.om = Math.max(-26, Math.min(26, r.om)); r.phi += r.om * STEP;
    }
    if (grab) {
      const i = grab.com, ax = X[grab.a0], ay = Y[grab.a0];
      let tx = mx + grab.gx, ty = my + grab.gy;
      const dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy), max = grab.L + grab.d;
      if (d > max) { tx = ax + (dx / d) * max; ty = ay + (dy / d) * max; }
      PX[i] = X[i]; PY[i] = Y[i];
      X[i] += (tx - X[i]) * 0.3; Y[i] += (ty - Y[i]) * 0.3;
    }
    for (let it = 0; it < ITER; it++) {
      for (const r of ropes) {
        const a = r.a0, end = a + r.segs;
        for (let i = a; i <= end; i++) {
          const k = i + 1, L = k === r.com ? r.d : r.cur;
          const dx = X[k] - X[i], dy = Y[k] - Y[i], d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
          const wi = IM[i], wk = IM[k], ws = wi + wk;
          if (ws === 0) continue;
          const f = (d - L) / d / ws;
          X[i] += dx * f * wi; Y[i] += dy * f * wi; X[k] -= dx * f * wk; Y[k] -= dy * f * wk;
        }
      }
    }
    wvx *= 0.94; wvy *= 0.94;
  }

  /* ---------- tags: pre-rendered paper luggage tags ---------- */
  const paths = new Map();
  function tagPath(w, h, k, rnd) {
    const j = () => (rnd() - 0.5) * 1.1, p = new Path2D(), pts = [[k, 0], [w - k, 0], [w, k], [w, h], [0, h], [0, k]];
    const q = pts.map(([x, y]) => [x + j(), y + j()]);
    p.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i <= q.length; i++) {
      const a = q[i - 1], b = q[i % q.length];
      p.quadraticCurveTo((a[0] + b[0]) / 2 + j() * 1.2, (a[1] + b[1]) / 2 + j() * 1.2, b[0], b[1]);
    }
    return p;
  }
  function tagImage(r, mode) {
    const t = r.tool, w = r.w, h = r.h, pad = 16, cw = w + pad * 2, ch = h + pad * 2 + 6;
    const c = document.createElement("canvas"); c.width = Math.ceil(cw * dpr); c.height = Math.ceil(ch * dpr);
    const g = c.getContext("2d"); g.scale(dpr, dpr); g.translate(pad, pad);
    const rnd = NB.rng(t.i * 97 + 13), k = Math.min(11 * S, w * 0.2), body = tagPath(w, h, k, rnd), line2 = tagPath(w, h, k, rnd);
    g.shadowColor = mode === 1 ? "rgba(31,35,41,.24)" : "rgba(31,35,41,.15)";
    g.shadowBlur = mode === 1 ? 14 : 6; g.shadowOffsetY = mode === 1 ? 6 : 2;
    g.fillStyle = CARD; g.fill(body);
    g.shadowColor = "transparent";
    g.lineJoin = g.lineCap = "round";
    g.strokeStyle = "rgba(31,35,41,.8)"; g.lineWidth = 1.15; g.stroke(body);
    g.strokeStyle = "rgba(31,35,41,.2)"; g.lineWidth = 0.8; g.stroke(line2);
    const hx = w / 2, hy = r.hole0;
    g.beginPath(); g.arc(hx, hy, 5.8 * S, 0, TAU); g.fillStyle = "rgba(236,220,168,.95)"; g.fill();
    g.lineWidth = 0.8; g.strokeStyle = "rgba(31,35,41,.45)"; g.stroke();
    g.globalCompositeOperation = "destination-out"; g.beginPath(); g.arc(hx, hy, 2.5 * S, 0, TAU); g.fill();
    g.globalCompositeOperation = "source-over"; g.strokeStyle = "rgba(31,35,41,.55)"; g.stroke();
    const col = mode === 1 ? BLUE : INK, path = logos && logos.get(t.slug);
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    if (mode === 2) {
      g.strokeStyle = "rgba(124,130,140,.55)"; g.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const y = h * (0.5 + i * 0.15); g.beginPath(); g.moveTo(9 * S, y); g.lineTo(w - 9 * S - rnd() * 8, y + (rnd() - 0.5)); g.stroke(); }
    } else if (path) {
      const L = 23 * S, ly = hy + (h - hy) * 0.37;
      g.save(); g.translate(hx - L / 2, ly - L / 2); g.scale(L / 24, L / 24); g.fillStyle = col; g.fill(path); g.restore();
      g.font = `500 ${FS}px ${HAND}`; g.fillStyle = mode === 1 ? BLUE : INK2; g.fillText(t.name, hx, h - 8 * S);
    } else {
      g.font = `700 ${t.name.length > 5 ? 15 * S : 19 * S}px ${HAND}`; g.fillStyle = col; g.fillText(t.name, hx, hy + (h - hy) * 0.6);
    }
    return { c, ox: pad + hx, oy: pad + hy, cw, ch };
  }
  function tagWidth(t, tw) {
    if (!(logos ? logos.get(t.slug) : t.slug)) tw *= t.name.length > 5 ? 1.15 : 1.5; // text-only tags use a bigger word
    return Math.min(innerWidth < 760 ? 100 : 128, Math.max(54 * S, tw + 16 * S));
  }
  function buildImages() {
    fontOK = !document.fonts || document.fonts.check(`500 12px ${HAND}`);
    for (const r of ropes) {
      const t = r.tool, path = logos && logos.get(t.slug);
      ctx.font = `500 ${FS}px ${HAND}`;
      const tw = ctx.measureText(t.name).width;
      r.w = tagWidth(t, tw);
      r.img = tagImage(r, 0); r.back = tagImage(r, 2); r.hov = null;
    }
  }

  function drawTag(r, hi) {
    const hx = X[r.com - 1], hy = Y[r.com - 1], cx = X[r.com], cy = Y[r.com];
    const th = Math.atan2(-(cx - hx), cy - hy) + r.tilt, c = Math.cos(th), s = Math.sin(th);
    r.c = c; r.s = s; r.sx = Math.cos(r.phi);
    r.lift += ((hi ? 1 : 0) - r.lift) * 0.22;
    if (Math.abs(r.sx) < 0.04) return;
    const sc = 1 + 0.05 * r.lift, sx = r.sx * sc, im = r.sx < 0 ? r.back : hi ? (r.hov || (r.hov = tagImage(r, 1))) : r.img;
    ctx.setTransform(dpr * c * sx, dpr * s * sx, -dpr * s * sc, dpr * c * sc, dpr * (hx + s * 2.5 * r.lift), dpr * (hy - c * 2.5 * r.lift));
    ctx.drawImage(im.c, -im.ox, -im.oy, im.cw, im.ch);
    const top = -r.hole0 - 0.5; // the string loops through the hole and over the top edge
    ctx.beginPath(); ctx.moveTo(-0.6, top); ctx.quadraticCurveTo(-3.2 * S, top * 0.45, 0, 0.6); ctx.quadraticCurveTo(3 * S, top * 0.5, 0.7, top);
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(31,35,41,.75)"; ctx.stroke();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = ctx.lineJoin = "round";
    if (tagsReady) {
      ctx.beginPath();
      for (const r of ropes) {
        if (r.cur <= r.seg * 0.03) continue;
        const a = r.a0, end = a + r.segs;
        ctx.moveTo(X[a], Y[a]);
        for (let i = a + 1; i < end; i++) ctx.quadraticCurveTo(X[i], Y[i], (X[i] + X[i + 1]) / 2, (Y[i] + Y[i + 1]) / 2);
        ctx.lineTo(X[end], Y[end]);
      }
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(31,35,41,.55)"; ctx.stroke();
    }
    for (const st of stars) drawStar(st);
    if (tagsReady) {
      const hi = hovered || focusRope;
      for (const r of order) if (r !== hi && r.img && r.cur > r.seg * 0.03) drawTag(r, false);
      if (hi && hi.img) drawTag(hi, true);
    }
    if (noteTool) placeNote(false);
  }

  /* ---------- main loop ---------- */
  function frame(dt) {
    T += dt;
    if (REDUCED && !grab && awake <= 0) return;
    for (const st of stars) shapeStar(st, REDUCED);
    acc += dt; let n = 0;
    while (acc >= STEP && n < 6) { step(false); acc -= STEP; n++; }
    if (n === 6) acc = 0;
    render();
    if (REDUCED) { // sleep once settled; any interaction wakes it
      let e = 0; for (const r of ropes) e = Math.max(e, Math.abs(X[r.com] - PX[r.com]) + Math.abs(Y[r.com] - PY[r.com]) + Math.abs(r.om) * 0.05);
      awake = e > 0.02 ? 2 : awake - dt;
    }
  }

  /* ---------- interaction ---------- */
  function hit(px, py) {
    if (!tagsReady) return null;
    for (let k = order.length; k >= 0; k--) {
      const r = k === order.length ? hovered : order[k];
      if (!r || !r.img) continue;
      const dx = px - X[r.com - 1], dy = py - Y[r.com - 1];
      const lx = (r.c * dx + r.s * dy) / Math.max(0.3, Math.abs(r.sx)), ly = -r.s * dx + r.c * dy;
      if (lx > -r.w / 2 - 3 && lx < r.w / 2 + 3 && ly > -r.hole0 - 3 && ly < r.h - r.hole0 + 3) return r;
    }
    return null;
  }
  const local = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  hero.addEventListener("pointermove", (e) => {
    const [x, y] = local(e), dtm = e.timeStamp - lastMove;
    if (lastMove && dtm < 120 && mx > -1e3) {
      const k = 1000 / Math.max(8, dtm), vx = Math.max(-1800, Math.min(1800, (x - mx) * k)), vy = Math.max(-1800, Math.min(1800, (y - my) * k));
      wvx = wvx * 0.35 + vx * 0.65; wvy = wvy * 0.35 + vy * 0.65;
    }
    mx = x; my = y; lastMove = e.timeStamp; awake = 2;
    if (down && Math.hypot(x - down.x, y - down.y) > 6) down.moved = true;
    if (!grab && e.pointerType === "mouse") {
      const h = e.target === canvas ? hit(x, y) : null;
      if (h !== hovered) { hovered = h; canvas.style.cursor = h ? "pointer" : ""; }
    }
  }, { passive: true });
  hero.addEventListener("pointerleave", () => { mx = my = -1e4; lastMove = 0; if (!grab) { hovered = null; canvas.style.cursor = ""; } });
  canvas.addEventListener("pointerdown", (e) => {
    const [x, y] = local(e), r = hit(x, y);
    mx = x; my = y; lastMove = 0; awake = 2;
    if (!r) { closeNote(); return; }
    grab = r; r.gx = X[r.com] - x; r.gy = Y[r.com] - y; IM[r.com] = 0;
    down = { x, y, r, moved: false };
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing";
  });
  const release = (e) => {
    if (!grab) return;
    const r = grab, i = r.com;
    IM[i] = 0.3; grab = null;
    const vx = X[i] - PX[i], vy = Y[i] - PY[i], v = Math.hypot(vx, vy), max = 24;
    if (v > max) { PX[i] = X[i] - (vx / v) * max; PY[i] = Y[i] - (vy / v) * max; }
    r.om += vx * 0.6 * r.spin;
    canvas.style.cursor = e.pointerType === "mouse" ? "pointer" : "";
    if (e.type === "pointerup" && down && !down.moved) openNote(r.tool);
    down = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  // touch: block page scroll only when the finger lands on a tag
  canvas.addEventListener("touchstart", (e) => { const t = e.touches[0], [x, y] = local(t); if (hit(x, y)) e.preventDefault(); }, { passive: false });

  /* ---------- the note card ---------- */
  function openNote(tool) {
    noteTool = tool;
    noteName.textContent = tool.name;
    noteLine.textContent = tool.line.charAt(0).toUpperCase() + tool.line.slice(1);
    note.hidden = false; nW = note.offsetWidth; nH = note.offsetHeight;
    placeNote(true); awake = 2;
    if (REDUCED) render();
  }
  function closeNote() { noteTool = null; note.hidden = true; }
  function placeNote(snap) {
    const r = noteTool.rope;
    let tx, ty;
    if (r && r.img) {
      const hx = X[r.com - 1], hy = Y[r.com - 1], m = r.h / 2 - r.hole0;
      const cx = hx - r.s * m, cy = hy + r.c * m;
      tx = cx + r.w / 2 + 14; if (tx + nW > W - 12) tx = cx - r.w / 2 - 14 - nW;
      ty = cy - nH * 0.4;
    } else { tx = (W - nW) / 2; ty = Math.min(H * 0.25, 160); }
    tx = Math.max(10, Math.min(W - nW - 10, tx)); ty = Math.max(10, Math.min(H - nH - 10, ty));
    if (snap) { nX = tx; nY = ty; } else { nX += (tx - nX) * 0.18; nY += (ty - nY) * 0.18; }
    note.style.transform = `translate3d(${nX.toFixed(1)}px,${nY.toFixed(1)}px,0) rotate(-1.2deg)`;
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && noteTool) closeNote(); });
  document.addEventListener("pointerdown", (e) => { if (noteTool && !hero.contains(e.target)) closeNote(); });

  // keyboard: one tab stop, arrow keys walk the tools; focus shows the tag and its note
  buttons.forEach((b, i) => {
    b.tabIndex = i ? -1 : 0;
    b.addEventListener("focus", () => {
      buttons.forEach((o) => (o.tabIndex = o === b ? 0 : -1));
      focusRope = tools[i].rope; openNote(tools[i]);
    });
    b.addEventListener("click", () => openNote(tools[i]));
  });
  list.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(document.activeElement); if (i < 0) return;
    const n = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault(); buttons[(n + buttons.length) % buttons.length].focus();
  });
  list.addEventListener("focusout", (e) => { if (!list.contains(e.relatedTarget)) { focusRope = null; closeNote(); } });

  /* ---------- boot ---------- */
  layout(!REDUCED);
  for (const st of stars) shapeStar(st, REDUCED);
  render();
  NB.loop(hero, frame);
  const fontReady = Promise.race([document.fonts ? document.fonts.load(`500 12px ${HAND}`).catch(() => {}) : null, new Promise((r) => setTimeout(r, 900))]);
  const logosReady = new Promise((res) => requestAnimationFrame(() =>
    fetch("assets/logos/logos.json").then((r) => r.json())
      .then((a) => { logos = new Map(a.map((o) => [o.slug, new Path2D(o.path)])); }).catch(() => {}).finally(res)));
  Promise.all([fontReady, logosReady]).then(() => {
    buildImages(); tagsReady = true; dropT0 = Math.max(T, 0.3);
    const copy = hero.querySelector(".hero-copy"); // the name lands just after the tags
    if (copy && !REDUCED) copy.style.animationDelay = (performance.now() / 1000 - T + dropT0 + 0.7).toFixed(2) + "s";
    for (const r of ropes) r.delay += dropT0 - 0.3;
    awake = 2;
    if (REDUCED) render();
    if (!fontOK && document.fonts) document.fonts.ready.then(() => { buildImages(); awake = 2; });
  });

  let rt = 0, lastW = innerWidth, lastH = innerHeight;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 140 && Math.min(2, devicePixelRatio || 1) === dpr) return;
      lastW = innerWidth; lastH = innerHeight; closeNote(); hovered = focusRope = null;
      layout(false); for (const st of stars) shapeStar(st, REDUCED); render();
    }, 180);
  });
})();
