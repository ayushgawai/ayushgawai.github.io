/* 00-core.js */
;/* Shared helpers. Every section script is concatenated after this file (alphabetical) into assets/site.js.
   Each section file must be self-contained: wrap in an IIFE, never leak globals besides window.NB. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* onVisible(el, start, stop): call start() when el scrolls into view, stop() when it leaves.
     Also toggles .is-visible (which un-pauses CSS animations inside [data-anim] and triggers .draw). */
  const watchers = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const w = watchers.get(e.target); if (!w) continue;
      e.target.classList.toggle("is-visible", e.isIntersecting);
      if (e.isIntersecting && !w.on) { w.on = true; w.start && w.start(); }
      else if (!e.isIntersecting && w.on) { w.on = false; w.stop && w.stop(); }
    }
  }, { rootMargin: "120px 0px" });
  function onVisible(el, start, stop) { if (!el) return; watchers.set(el, { start, stop, on: false }); io.observe(el); }

  /* loop(fn): rAF loop that only runs while el is visible. fn(dt seconds, t seconds). */
  function loop(el, fn) {
    let id = 0, last = 0;
    const tick = (now) => { const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; fn(dt, now / 1000); id = requestAnimationFrame(tick); };
    onVisible(el, () => { last = performance.now(); id = requestAnimationFrame(tick); }, () => cancelAnimationFrame(id));
  }

  /* jitter: deterministic pseudo-random (seeded) for hand-drawn wobble */
  function rng(seed = 1) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

  window.NB = { reduced, onVisible, loop, rng };

  document.addEventListener("DOMContentLoaded", () => {
    // auto-watch everything that wants visibility-driven animation
    document.querySelectorAll("[data-anim], .draw").forEach((el) => watchers.has(el) || onVisible(el));
    // nav tab highlighting
    const links = [...document.querySelectorAll(".tabs a")];
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const navIO = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.removeAttribute("aria-current"));
      const a = map.get(e.target.id); if (a) { a.setAttribute("aria-current", "true"); if (innerWidth < 760) a.scrollIntoView({ inline: "center", block: "nearest" }); }
    }), { rootMargin: "-45% 0px -50% 0px" });
    map.forEach((_, id) => { const s = document.getElementById(id); s && navIO.observe(s); });
  });
})();

/* click-to-load video facades: <button class="video" data-yt="ID"> or data-loom="ID" */
document.addEventListener("click", (e) => {
  const v = e.target.closest(".video[data-yt], .video[data-loom]");
  if (!v || v.classList.contains("is-playing")) return;
  const src = v.dataset.yt
    ? `https://www.youtube-nocookie.com/embed/${v.dataset.yt}?autoplay=1&rel=0`
    : `https://www.loom.com/embed/${v.dataset.loom}?autoplay=1&hide_owner=true`;
  const f = document.createElement("iframe");
  f.src = src; f.title = v.dataset.title || "Project demo video";
  f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true;
  v.classList.add("is-playing"); v.append(f);
});

/* 10-hero.js */
;/* Hero cover: a hand-drawn mobile. Ink stars morph and "boil"; verlet strings hang paper tags with tool logos.
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
    const obs = [...hero.querySelectorAll("[data-clear]")].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0)
      .map((b) => ({ l: b.left - hb.left, r: b.right - hb.left, t: b.top - hb.top }));
    const mg = mobile ? 8 : 64, pad = mobile ? 44 : 16;
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

    ropes = [];
    let ti = 0, P = 0;
    stars.forEach((st, s) => {
      const rows = [...Array(st.cap).keys()].sort(() => rnd() - 0.5).slice(0, k[s]).sort((a, b) => a - b);
      rows.forEach((row, j) => {
        const tool = chosen[ti++];
        const side = (j + s) % 2 ? 1 : -1;
        const off = side * (0.25 + rnd() * 0.55) * (k[s] > 1 ? 1 : 0.3) * (mobile ? 0.4 : 1);
        const holeY = st.top0 + row * rowH + (rnd() - 0.5) * 10 * S;
        const L = holeY - st.y;
        const segs = Math.max(6, Math.min(14, Math.round(L / 26)));
        const r = { tool, star: st, off, L, segs, seg: L / segs, cur: L / segs, a0: P, com: P + segs + 1, d: tagH / 2 - 10 * S,
          h: tagH, hole0: 10.5 * S, w: 60 * S, delay: 0, phi: 0, om: 0, spin: rnd() < 0.5 ? -1 : 1, seed: rnd() * 100,
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
  function anchorX(r) { const st = r.star, i = anchorIdx(r), rr = (st.r[i] || st.R * 0.5) * 0.82; return st.x + rr * (COS[i] * Math.cos(st.rot) - SIN[i] * Math.sin(st.rot)); }
  function anchorY(r) { const st = r.star, i = anchorIdx(r), rr = (st.r[i] || st.R * 0.5) * 0.82; return st.y + rr * (COS[i] * Math.sin(st.rot) + SIN[i] * Math.cos(st.rot)); }

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
  function buildImages() {
    fontOK = !document.fonts || document.fonts.check(`500 12px ${HAND}`);
    for (const r of ropes) {
      const t = r.tool, path = logos && logos.get(t.slug);
      ctx.font = path ? `500 ${FS}px ${HAND}` : `700 ${(t.name.length > 5 ? 15 : 19) * S}px ${HAND}`;
      const tw = ctx.measureText(t.name).width;
      r.w = Math.min(innerWidth < 760 ? 100 : 128, Math.max(54 * S, tw + 16 * S));
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

/* 20-av.js */
;/* Autonomy chapter: robotaxi street loop, red-pencil catches, event cards into the validation pipeline. */
(() => {
  const root = document.getElementById("av");
  if (!root || !window.NB) return;
  const svg = root.querySelector(".av-street");
  const stage = root.querySelector(".av-stage");
  const far = svg.querySelector(".av-far"), near = svg.querySelector(".av-near");
  const stages = [...root.querySelectorAll(".av-st")];
  const loopSt = root.querySelector(".av-st-loop");
  const chips = [...root.querySelectorAll(".av-chip")];
  const inbox = root.querySelector(".av-st.av-in .av-box");

  // phones see a crop around the car and the detection zone so the hand lettering stays legible
  const mq = matchMedia("(max-width: 700px)");
  let DET = 860; // sweep reach (screen x); shorter on the phone crop so catches happen in view
  const fit = () => { svg.setAttribute("viewBox", mq.matches ? "150 40 640 410" : "0 40 1200 420"); DET = mq.matches ? 740 : 860; };
  fit(); mq.addEventListener("change", fit);

  const L = 2800, V = 130, PAST = 540; // loop length, road speed (units/s), sweep reach and car front (screen x)
  const objs = [...svg.querySelectorAll(".av-obj")].map((g) => {
    const b = g.querySelector(".av-ring").getBBox(); // judge catches by where the red ring sits, not the object origin
    return { g, x0: +g.dataset.x, rc: b.x + b.width / 2, hit: false, last: Infinity };
  });
  const place = (off) => {
    far.setAttribute("transform", `translate(${(-(off * 0.4) % 1200).toFixed(1)} 0)`);
    near.setAttribute("transform", `translate(${(-off % 1200).toFixed(1)} 0)`);
    for (const o of objs) {
      const x = (((o.x0 - off + 300) % L) + L) % L - 300;
      if (x > o.last) { o.hit = false; o.g.classList.remove("hit", "past"); } // wrapped round to the right again
      o.last = x;
      if (x + o.rc < PAST) o.g.classList.add("past"); // slipping behind the car: let the pencil marks fade
      o.g.setAttribute("transform", `translate(${x.toFixed(1)} 0)`);
      if (!o.hit && x + o.rc < DET) { o.hit = true; o.g.classList.add("hit"); if (off > 0) setTimeout(() => fly(o), 650); }
    }
  };

  // pipeline highlight: one stage "on" at a time, unless the reader is pointing at one
  let user = false, timers = [], runs = 0;
  const on = (i) => { if (!user) stages.forEach((s, k) => s.classList.toggle("on", k === i)); };
  const chip = (i, st) => chips.forEach((c, k) => { c.classList.toggle("on", k === i); c.classList.toggle("ok", k === 2 && st === "ok"); c.classList.toggle("no", k === 2 && st === "no"); });
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  function run() {
    timers.forEach(clearTimeout); timers = [];
    const retry = runs++ % 2 === 1; // every other event shows a failed draft going round again
    let t = 0;
    on(1); later((t += 700), () => on(2)); later((t += 700), () => on(3));
    later((t += 700), () => { on(4); chip(0); });
    later((t += 450), () => chip(1));
    if (retry) {
      later((t += 450), () => { chip(2, "no"); loopSt.classList.add("retry"); });
      later((t += 650), () => { chip(0); loopSt.classList.remove("retry"); });
      later((t += 450), () => chip(1));
    }
    later((t += 450), () => chip(2, "ok"));
    later((t += 700), () => on(5)); later((t += 800), () => on(6));
  }

  // an event card peels off the caught object and drops into the "Miners" box
  function fly(o) {
    const ring = o.g.querySelector(".av-ring"); if (!ring) return;
    const W = stage.getBoundingClientRect(), a = ring.getBoundingClientRect(), b = inbox.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    if (a.right < sr.left || a.left > sr.right || a.bottom < 0 || a.top > innerHeight) return;
    const ok = b.top < innerHeight - 40 && b.bottom > 0;
    const c = document.createElement("div");
    c.className = "av-card"; c.setAttribute("aria-hidden", "true");
    c.innerHTML = `<b>mined event</b>${o.g.dataset.tag}`;
    stage.appendChild(c);
    const x0 = a.left + a.width / 2 - W.left - 64, y0 = a.top + a.height / 2 - W.top - 24;
    const x1 = ok ? b.left + b.width / 2 - W.left - 64 : x0 - 40, y1 = ok ? b.top + b.height / 2 - W.top - 24 : sr.bottom - W.top - 30;
    const T = (x, y, s, r) => `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;
    c.animate([
      { transform: T(x0, y0, 0.3, 0), opacity: 0 },
      { transform: T(x0 - 24, y0 - 34, 1, -7), opacity: 1, offset: 0.22 },
      { transform: T((x0 + x1) / 2 - 30, (y0 + y1) / 2, 0.95, 4), opacity: 1, offset: 0.6 },
      { transform: T(x1, y1, 0.5, 2), opacity: ok ? 0.9 : 0 },
    ], { duration: ok ? 2000 : 1300, easing: "cubic-bezier(.4,.1,.3,1)" }).onfinish = () => {
      c.remove();
      if (!ok) return;
      const st = stages[1]; st.classList.remove("pulse"); void st.offsetWidth; st.classList.add("pulse");
      run();
    };
  }

  stages.forEach((s, i) => {
    const enter = () => { user = true; stages.forEach((x, k) => x.classList.toggle("on", k === i)); };
    const leave = () => { user = false; };
    s.addEventListener("pointerenter", enter); s.addEventListener("pointerleave", leave);
    s.addEventListener("focusin", enter); s.addEventListener("focusout", leave);
  });

  if (NB.reduced) { // finished static frame: two catches circled, the loop verified
    place(200); objs.forEach((o) => o.g.classList.add("hit")); chip(2, "ok"); on(4);
    return;
  }
  let off = 0;
  place(0);
  NB.loop(svg, (dt) => { off += V * dt; place(off); });
})();

/* 30-robots.js */
;/* robots chapter: leader/follower SO-101 arms (2-link IK, wrist kept pointing down), cube pick-and-place,
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

/* 35-research.js */
;/* research chapter: gaze scanpath cycling + wheelchair alert loop */
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

/* 40-ai.js */
;/* #ai — generate → execute → verify → store loop. A slip travels the track; pass 1 fails and goes back
   round with the evidence, pass 2 passes and is filed, then the LLM steps out of the loop. */
(() => {
  const svg = document.getElementById("ai-loop");
  if (!svg || !window.NB) return;
  const $ = (id) => document.getElementById(id);
  const track = $("ai-track"), exit = $("ai-exit"), slip = $("ai-slip"), llm = $("ai-llm");
  const pass = $("ai-pass"), pred = $("ai-pred"), result = $("ai-result");
  const L = track.getTotalLength(), LE = exit.getTotalLength();

  const near = (x, y) => { // track length closest to a point
    let best = 0, bd = Infinity;
    for (let s = 0; s < L; s += 2) { const p = track.getPointAtLength(s), d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
    return best;
  };
  const EXE = near(460, 244), VER = near(280, 384);

  const CARDS = [
    ["pass 1 · first draft", "  = 'REVERSE'", "0 rows: not an observed label", "is-bad"],
    ["pass 2 · redrafted with evidence", "  LIKE '%LIGHTS_REVERSE%'", "counts match the vocabulary ✓", "is-good"],
    ["filed · canonical SQL", "  LIKE '%LIGHTS_REVERSE%'", "scoring reruns it, no LLM", "is-filed"],
  ];
  let card = 0;
  const setCard = (i) => { card = i; pass.textContent = CARDS[i][0]; pred.textContent = CARDS[i][1]; result.textContent = " "; result.setAttribute("class", "svg-hand ai-result"); };
  const showResult = () => { result.textContent = CARDS[card][2]; result.classList.add(CARDS[card][3]); };
  const cls = (name, on) => svg.classList.toggle(name, on);
  const put = (p, r = 0) => slip.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${r.toFixed(1)})`);
  const at = (s) => track.getPointAtLength(((s % L) + L) % L);
  const llmAt = (k) => llm.setAttribute("transform", k ? `translate(${(206 * k).toFixed(1)} ${(-8 * k - 26 * Math.sin(Math.PI * k)).toFixed(1)})` : "");

  const finish = () => { setCard(2); showResult(); ["is-ok", "is-filed", "is-out"].forEach((c) => cls(c, true)); slip.classList.add("is-gone"); llmAt(1); };
  if (NB.reduced) { finish(); return; }

  const pause = (d, on) => ({ d, on });
  const move = (d, a, b, on) => ({ d, on, f: (k) => put(at(a + (b - a) * k), Math.sin(k * Math.PI) * -6) });
  const T = [
    pause(1.4, () => setCard(0)),
    move(1.3, 0, EXE),
    pause(0.9, () => cls("at-exe", true)),
    move(1.1, EXE, VER, () => cls("at-exe", false)),
    pause(1.6, () => { cls("is-x", true); showResult(); }),
    move(1.9, VER, L, () => cls("is-retry", true)),
    pause(0.5, () => cls("is-x", false)),
    pause(1.3, () => { cls("is-retry", false); setCard(1); }),
    move(1.3, 0, EXE),
    pause(0.9, () => cls("at-exe", true)),
    move(1.1, EXE, VER, () => cls("at-exe", false)),
    pause(1.4, () => { cls("is-ok", true); showResult(); }),
    { d: 1.1, f: (k) => put(exit.getPointAtLength(LE * k), k * -14) },
    pause(0.5, () => { cls("is-filed", true); slip.classList.add("is-gone"); }),
    { d: 1.4, on: () => cls("is-out", true), f: llmAt },
    pause(5, () => { setCard(2); showResult(); cls("is-ok", false); }),
  ];
  const reset = () => {
    ["is-x", "is-ok", "is-filed", "is-out", "is-retry", "at-exe"].forEach((c) => cls(c, false));
    slip.classList.remove("is-gone"); llmAt(0); put(at(0));
  };

  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let i = 0, t = 0, started = false;
  reset();
  NB.loop(svg, (dt) => {
    const s = T[i];
    if (!started) { started = true; s.on && s.on(); }
    t += dt;
    s.f && s.f(ease(Math.min(1, t / s.d)));
    if (t >= s.d) {
      t = 0; started = false; i++;
      if (i >= T.length) { i = 0; reset(); }
    }
  });
})();

/* 45-data.js */
;/* #data: a hand-inked pipeline drawn from config. Tabs re-route it between three real pipelines;
   packets flow through, and one failing packet per cycle is hooked out into quarantine. */
(() => {
  const fig = document.querySelector("#data .data-sketch");
  if (!fig) return;
  const svg = fig.querySelector(".data-svg"), canvas = svg.querySelector(".data-canvas");
  const board = fig.querySelector(".data-board"), noteEl = fig.querySelector(".data-note");
  const panel = document.getElementById("data-panel"), bodies = [...panel.querySelectorAll(".data-pb")];
  const tabs = [...fig.querySelectorAll(".tab")];
  const HINT = noteEl.innerHTML;

  const PIPES = {
    transit: {
      speed: 150, gap: 72, pkt: "row",
      st: [
        { k: "antenna", name: "GTFS feeds", sub: ["BART + VTA", "static + real-time"], note: "Static schedules and real-time vehicle feeds from two operators, BART and VTA." },
        { k: "log", name: "Kafka", sub: ["producer → consumer"], note: "A Kafka producer and consumer carry near-real-time vehicle events, with dedup and replay." },
        { k: "valve", name: "Airflow", sub: ["3 DAGs on AWS MWAA"], note: "Three DAGs: GTFS incremental ingestion, streaming ingestion and ML forecasting." },
        { k: "gate", name: "checks", sub: ["late · malformed · dupes"], note: "Live events are aligned to static stop IDs; late or malformed location samples and duplicates are pulled aside." },
        { k: "wh", name: "Snowflake + dbt", sub: ["landing → analytics"], note: "Snowflake landing and analytics schemas; dbt builds route-level performance aggregates." },
        { k: "screen", name: "FastAPI + React", sub: ["operator dashboard"], note: "FastAPI serves a React/TypeScript operator dashboard with maps and metrics; heavy ETL and training stay off this path." }
      ],
      ann: [[0, ["stop IDs ≠ live events:", "align them first"]], [2, ["ingest, stream,", "forecast"]], [5, ["+ Azure Databricks", "& Power BI KPIs"]]]
    },
    zscaler: {
      speed: 120, gap: 150, pkt: "delta",
      st: [
        { k: "tank", name: "Salesforce", sub: ["formula fields"], note: "Formula fields recalculate in real time but never update LastModified, so incremental loads missed them and pipelines fell back to full refreshes." },
        { k: "funnel", name: "formula compiler", sub: ["metadata → SQL"], note: "Pulls formula definitions from the Salesforce API, walks every field dependency depth-first, and an LLM drafts SQL from that structured context." },
        { k: "valve", name: "Matillion", sub: ["incremental upserts"], note: "Change detection and incremental upserts replace full-table refreshes." },
        { k: "wh", name: "Snowflake + dbt", sub: ["versioned, clustered"], note: "Generated SQL lives in version-controlled dbt models; partitioning and Snowflake clustering cut scan volume." },
        { k: "gate", name: "reconcile", sub: ["samples vs live CRM"], note: "Automated samples of warehouse output are compared with the live CRM; any mismatch is flagged before deployment." },
        { k: "screen", name: "dashboards", sub: ["for leadership"], note: "Leadership and go-to-market dashboards read numbers that were verified, not assumed." }
      ],
      ann: [[0, ["formulas never bump", "LastModified"], 1], [2, ["only changed rows,", "no full refresh"]], [5, ["~80% lower latency", "~35% faster queries"]]]
    },
    latentview: {
      speed: 72, gap: 140, pkt: "slab",
      st: [
        { k: "tank", name: "HDFS", sub: ["~800 TB"], note: "Roughly 800 TB of enterprise data on HDFS, moving to AWS S3." },
        { k: "pump", name: "DataSync", sub: ["+ bash tracking"], note: "AWS DataSync moves the data; bash scripts copy, track each batch and keep a record of what moved." },
        { k: "bucket", name: "S3", sub: ["data lake"], note: "S3 becomes the data lake; Spark and Snowflake carry the transformation layer, re-tuned until one model ran in 6 min instead of 18." },
        { k: "gate", name: "pytest checks", sub: ["99.6% accuracy"], note: "Python and pytest-style checks compare source and destination: row mismatches, null anomalies and type drift are flagged before go-live." },
        { k: "valve", name: "Airflow → MWAA", sub: ["modular DAGs"], note: "Legacy Airflow moved to managed MWAA patterns: containerized operators, modular DAGs, isolated tests, better retries." },
        { k: "bell", name: "SLA alerts", sub: ["CloudWatch · SNS", "· Lambda"], note: "CloudWatch metrics, SNS alerts and Lambda triggers catch SLA breaches and job failures before the client does." }
      ],
      ann: [[0, ["moved in tracked", "batches"]], [4, ["containerized", "operators"]], [5, ["~45% fewer client", "escalations"]]]
    }
  };

  /* ---------- hand-drawn primitives (seeded jitter, so a drawing is stable per tab) ---------- */
  const f = (n) => Math.round(n * 10) / 10;
  let R = NB.rng(7);
  const jit = (a) => (R() - 0.5) * 2 * a;
  function smooth(p) {
    let d = `M${f(p[0][0])} ${f(p[0][1])}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
    }
    return d;
  }
  const P = (d, cls = "ink") => `<path class="${cls}" d="${d}" pathLength="1"/>`;
  function ln(x1, y1, x2, y2, cls = "ink", a = 1.1) {
    const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(L / 55)), nx = -(y2 - y1) / L, ny = (x2 - x1) / L, o = 1.5;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = i && i < n ? jit(a) : jit(.5);
      pts.push([x1 + (x2 - x1) * t + nx * w, y1 + (y2 - y1) * t + ny * w]);
    }
    pts[0] = [pts[0][0] - (x2 - x1) / L * o, pts[0][1] - (y2 - y1) / L * o];
    return P(smooth(pts), cls);
  }
  function ell(cx, cy, rx, ry, cls = "ink") {
    const a0 = R() * 6.28, pts = [];
    for (let i = 0; i <= 15; i++) { const a = a0 + (i / 14) * 6.5, k = 1 + jit(.03); pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    return P(smooth(pts), cls);
  }
  const box = (x, y, w, h, cls = "ink") => ln(x, y, x + w, y, cls) + ln(x + w, y, x + w, y + h, cls) + ln(x + w, y + h, x, y + h, cls) + ln(x, y + h, x, y, cls);
  const fill = (d) => `<path class="body" d="${d}"/>`;
  const rf = (x, y, w, h) => fill(`M${x} ${y}h${w}v${h}h${-w}z`);

  /* ---------- station glyphs, centred on the pipe at (0,0) ---------- */
  const G = {
    tank: (wh) => fill("M-32 -30 L-32 30 Q0 44 32 30 L32 -30 Q0 -44 -32 -30Z") +
      `<path class="liq" d="M-31 ${wh ? 18 : 4} q8 -5 15.5 0 t15.5 0 t15.5 0 t15.5 0 L31 30 Q0 43 -31 30Z"/>` +
      P(`M-31 ${wh ? 18 : 4} q8 -5 15.5 0 t15.5 0 t15.5 0 t15.5 0`, "ink-blue thin") +
      ln(-32, -30, -32, 30) + ln(32, -30, 32, 30) + P("M-32 30 Q0 44 32 30") + ell(0, -30, 32, 9) +
      (wh ? P("M-32 -10 Q0 4 32 -10", "ink-thin") + P("M-32 7 Q0 21 32 7", "ink-thin") : ""),
    bucket: () => fill("M-36 -28 L-25 30 Q0 40 25 30 L36 -28 Q0 -40 -36 -28Z") +
      `<path class="liq" d="M-33 -4 q9 -5 16.5 0 t16.5 0 t16.5 0 t16.5 0 L25 30 Q0 39 -25 30Z"/>` +
      ln(-36, -28, -25, 30) + ln(36, -28, 25, 30) + P("M-25 30 Q0 40 25 30") + ell(0, -28, 36, 9),
    antenna: () => rf(-30, -4, 60, 36) + box(-30, -4, 60, 36) + ln(-22, 8, 22, 8, "ink-thin") + ln(-22, 20, 14, 20, "ink-thin") +
      ln(-13, -4, 0, -42) + ln(13, -4, 0, -42) + ln(-8, -18, 8, -18, "ink-thin") +
      `<g class="sig">${P("M-10 -51 q-7 9 0 18", "ink-blue")}${P("M10 -51 q7 9 0 18", "ink-blue")}${P("M-18 -57 q-12 15 0 30", "ink-blue")}${P("M18 -57 q12 15 0 30", "ink-blue")}</g>`,
    log: () => rf(-44, -19, 88, 38) + box(-44, -19, 88, 38) +
      [-27, -10, 7, 24].map((x) => ln(x, -19, x, 19, "ink-thin", .5)).join("") +
      [-44, -27, -10, 7, 24].map((x, i) => `<rect class="cell" style="--c:${i}" x="${x + 2}" y="-16" width="${i === 4 ? 17 : 13}" height="32"/>`).join(""),
    valve: () => rf(-24, -15, 48, 30) + box(-24, -15, 48, 30) + ln(-27, -20, -27, 20) + ln(27, -20, 27, 20) + ln(0, -15, 0, -32) +
      `<g class="spin">${ell(0, -44, 14, 14)}${ln(-14, -44, 14, -44, "ink-thin")}${ln(0, -58, 0, -30, "ink-thin")}</g>`,
    funnel: () => fill("M-38 -52 L38 -52 L10 -22 L10 -16 L-10 -16 L-10 -22Z") + ln(-38, -52, 38, -52) + ln(-38, -52, -10, -22) + ln(38, -52, 10, -22) +
      `<text class="svg-hand glyph-t" x="0" y="-33" text-anchor="middle">f(x)</text>` +
      rf(-28, -16, 56, 36) + box(-28, -16, 56, 36) + ln(-18, -4, 18, -4, "ink-blue thin") + ln(-18, 4, 10, 4, "ink-blue thin") + ln(-18, 12, 16, 12, "ink-blue thin"),
    gate: () => ln(-21, -42, -21, 30) + ln(21, -42, 21, 30) + ln(-28, -42, 28, -42) + ln(-30, 30, -13, 30) + ln(13, 30, 30, 30) +
      [-12, -4, 4, 12].map((x) => ln(x, -17, x, 17, "ink-thin", .4)).join("") + [-8, 0, 8].map((y) => ln(-21, y, 21, y, "ink-thin", .4)).join("") +
      `<path class="ok" d="M-9 -55 l6 7 l13 -16"/><path class="nok" d="M-8 -64 l16 16 M8 -64 l-16 16"/>`,
    screen: () => rf(-42, -36, 84, 56) + box(-42, -36, 84, 56) + P("M-32 10 L-18 -2 L-6 4 L8 -14 L30 -22", "ink-blue") +
      ln(-32, 14, 32, 14, "ink-thin", .4) + ln(0, 20, 0, 32) + ln(-18, 33, 18, 33),
    pump: () => fill("M0 -30 A30 30 0 1 1 0 30 A30 30 0 1 1 0 -30Z") + ell(0, 0, 30, 30) +
      `<g class="spin fast">${[0, 120, 240].map((r) => `<path class="ink-blue" d="M0 0 q12 -4 16 -20" transform="rotate(${r})"/>`).join("")}<circle r="4" class="ink-thin"/></g>`,
    bell: () => `<g class="swing">${fill("M-26 16 Q-20 10 -20 -6 Q-20 -32 0 -34 Q20 -32 20 -6 Q20 10 26 16Z")}${P("M-26 16 Q-20 10 -20 -6 Q-20 -32 0 -34 Q20 -32 20 -6 Q20 10 26 16")}${ln(-30, 17, 30, 17)}${ell(0, 24, 5, 5, "ink-thin")}${ell(0, -38, 4, 4, "ink-thin")}</g>` +
      `<g class="ring">${P("M30 -24 q10 8 8 22", "ink-red")}${P("M-30 -24 q-10 8 -8 22", "ink-red")}</g>`
  };
  G.wh = () => G.tank(true);

  const PK = {
    row: '<rect x="-8" y="-7" width="16" height="14" rx="2" class="ink-blue"/><path d="M-4 -2h8M-4 3h6" class="ink-blue thin"/>',
    delta: '<rect x="-9" y="-8" width="18" height="16" rx="2" class="ink-blue"/><path d="M-4.5 4.5 L0 -4.5 L4.5 4.5Z" class="ink-blue thin"/>',
    slab: '<rect x="-15" y="-8" width="30" height="16" rx="2" class="ink"/><rect x="-15" y="-8" width="30" height="16" class="hatch-b"/>'
  };
  const BAD = '<rect x="-8" y="-7" width="16" height="14" rx="2" class="ink-red"/><path d="M-4 -3.5l8 7M4 -3.5l-8 7" class="ink-red thin"/>';

  /* ---------- layout ---------- */
  let mode = "transit", vert = false, S = null;
  function geo(n, gi) {
    if (!vert) {
      const y = 206, xs = [...Array(n)].map((_, i) => 95 + i * 182);
      return { W: 1100, H: 440, s: 1, pts: xs.map((x) => [x, y]), bin: [xs[gi], 334], pivot: [xs[gi] + 88, 284] };
    }
    const gap = 118, y0 = 76, ys = [...Array(n)].map((_, i) => y0 + i * gap);
    return { W: 380, H: y0 + (n - 1) * gap + 70, s: .8, pts: ys.map((y) => [118, y]), bin: [46, ys[gi] + 46], pivot: [40, ys[gi] - 26] };
  }

  function render() {
    const c = PIPES[mode], n = c.st.length, gi = c.st.findIndex((s) => s.k === "gate");
    R = NB.rng(mode.length * 31 + (vert ? 5 : 0));
    const g = geo(n, gi), [x0, y0] = g.pts[0], [x1, y1] = g.pts[n - 1];
    svg.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`);
    let h = "";
    /* pipe: two wobbly walls + flange ticks between stations */
    h += '<g class="boil pipe">';
    if (!vert) {
      h += ln(x0, y0 - 11, x1, y1 - 11, "ink", 1.4) + ln(x0, y0 + 11, x1, y1 + 11, "ink", 1.4);
      for (let i = 0; i < n - 1; i++) { const m = (g.pts[i][0] + g.pts[i + 1][0]) / 2; h += ln(m - 4, y0 - 16, m - 4, y0 + 16, "ink-thin") + ln(m + 4, y0 - 16, m + 4, y0 + 16, "ink-thin"); }
    } else {
      h += ln(x0 - 11, y0, x1 - 11, y1, "ink", 1.4) + ln(x0 + 11, y0, x1 + 11, y1, "ink", 1.4);
      for (let i = 0; i < n - 1; i++) { const m = (g.pts[i][1] + g.pts[i + 1][1]) / 2; h += ln(x0 - 16, m - 4, x0 + 16, m - 4, "ink-thin") + ln(x0 - 16, m + 4, x0 + 16, m + 4, "ink-thin"); }
    }
    h += "</g>";
    /* packets */
    const L = vert ? y1 - y0 : x1 - x0, np = Math.ceil(L / c.gap) + 1;
    h += `<g class="pk">${`<g class="p">${PK[c.pkt]}</g>`.repeat(np)}<g class="pf">${BAD}</g></g>`;
    /* stations */
    c.st.forEach((s, i) => {
      const [x, y] = g.pts[i], gate = s.k === "gate";
      const lx = vert ? 172 : x, anchor = vert ? "start" : "middle";
      const ly = vert ? y - 4 : gate ? y - 94 : y + 76;
      let lab = `<text class="svg-hand lbl" x="${lx}" y="${ly}" text-anchor="${anchor}">${s.name}</text>`;
      s.sub.forEach((t, k) => { lab += `<text class="svg-print sub" x="${lx}" y="${ly + (vert ? 20 : 22) + k * 18}" text-anchor="${anchor}">${t}</text>`; });
      h += `<g class="st${gate ? " gate" : ""}" data-i="${i}" style="--i:${i}" tabindex="0" role="button" aria-label="${s.name}: ${s.note}">` +
        `<rect class="hit" x="${vert ? x - 50 : x - 88}" y="${vert ? y - 56 : y - 70}" width="${vert ? 300 : 176}" height="${vert ? 112 : 190}"/>` +
        `<g class="boil"><g transform="translate(${x} ${y}) scale(${g.s})">${G[s.k]()}</g></g>${lab}</g>`;
    });
    /* quarantine bin, stacked rejects, hook arm */
    const [bx, by] = g.bin, bw = vert ? 30 : 42, bh = vert ? 46 : 56;
    h += `<g class="bin rough">${ln(bx - bw, by, bx - bw + 9, by + bh)}${ln(bx - bw + 9, by + bh, bx + bw - 9, by + bh)}${ln(bx + bw - 9, by + bh, bx + bw, by)}${ln(bx - bw - 5, by, bx + bw + 5, by)}</g>`;
    h += `<text class="svg-hand qlbl" x="${bx}" y="${by + bh + (vert ? 20 : 26)}" text-anchor="middle">quarantine</text>`;
    const slots = vert ? [[-12, 36], [8, 37], [-2, 22]] : [[-17, 46], [5, 47], [-6, 30]];
    h += slots.map(([dx, dy], i) => `<g class="stk" data-k="${i}" transform="translate(${bx + dx} ${by + dy}) rotate(${(i - 1) * 9})">${BAD}</g>`).join("");
    h += `<g class="arm"><path class="ink-red arm-l"/><circle class="pivot" cx="${g.pivot[0]}" cy="${g.pivot[1]}" r="4"/></g>`;
    /* annotations (desktop only; mobile reads the result line) */
    if (!vert) c.ann.forEach(([i, lines, red]) => {
      const x = g.pts[i][0], cls = red ? "ink-red" : "ink-blue";
      h += `<g class="ann${red ? " red" : ""}">${lines.map((t, k) => `<text class="svg-hand" x="${x}" y="${48 + k * 22}" text-anchor="middle">${t}</text>`).join("")}` +
        `<path class="${cls} thin" d="M${x + 6} ${84} q16 24 2 ${y0 - 150}" marker-end="url(#arrowhead)"/></g>`;
    });
    canvas.innerHTML = h;
    canvas.classList.remove("fresh"); void canvas.getBBox(); canvas.classList.add("fresh");

    const ang = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]), dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
    const gp = g.pts[gi], mouth = [bx, by + 6];
    let tb = ang(g.pivot, mouth); const tg = ang(g.pivot, gp);
    if (tb - tg > Math.PI) tb -= 2 * Math.PI; if (tg - tb > Math.PI) tb += 2 * Math.PI;
    const gd = vert ? gp[1] - y0 : gp[0] - x0;
    const cyc = Math.ceil((gd / c.speed + 2.4) / (c.gap / c.speed)) * (c.gap / c.speed);
    S = { c, g, L, gd, cyc, tg, tb, lg: dist(g.pivot, gp), lb: dist(g.pivot, mouth), mouth, slots, caught: 0, lastCyc: -1,
      p: [...canvas.querySelectorAll(".p")], pf: canvas.querySelector(".pf"), arm: canvas.querySelector(".arm-l"),
      stk: [...canvas.querySelectorAll(".stk")], gate: canvas.querySelector(".st.gate"), bell: canvas.querySelector(".st-bell") };
    canvas.querySelectorAll(".st").forEach((el) => {
      const show = () => { canvas.querySelectorAll(".st.on").forEach((o) => o.classList.remove("on")); el.classList.add("on"); const s = c.st[+el.dataset.i]; noteEl.innerHTML = `<b>${s.name}</b> ${s.note}`; };
      el.addEventListener("mouseenter", show); el.addEventListener("focus", show); el.addEventListener("click", show);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(); } });
    });
    if (NB.reduced) frame(S.cyc * 0 + S.gd / c.speed + 1.6, true);
  }

  /* ---------- motion ---------- */
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const at = (s) => { const [x0, y0] = S.g.pts[0]; return vert ? [x0, y0 + s] : [x0 + s, y0]; };
  const mv = (el, x, y, o = 1, r = 0) => { el.setAttribute("transform", `translate(${f(x)} ${f(y)})${r ? ` rotate(${f(r)})` : ""}`); el.style.opacity = o; };
  function frame(t, still) {
    const { c, L, gd, cyc } = S;
    S.p.forEach((el, k) => {
      const s = still ? (k + .5) * c.gap : (t * c.speed + k * c.gap) % (S.p.length * c.gap);
      const [x, y] = at(Math.min(s, L)); mv(el, x, y, s > L ? 0 : 1);
    });
    const ci = Math.floor(t / cyc), ph = t - ci * cyc, ta = gd / c.speed;
    const tip = (th, l) => [S.g.pivot[0] + Math.cos(th) * l, S.g.pivot[1] + Math.sin(th) * l];
    let th = S.tb, l = S.lb * .5, px, py, po = 1, pr = 0;
    const s = ph * c.speed - c.gap / 2;
    if (ph < ta - .45) { [px, py] = at(Math.max(s, 0)); po = s < 0 ? 0 : 1; }
    else if (ph < ta) { [px, py] = at(Math.max(s, 0)); const q = ease((ph - ta + .45) / .45); th = S.tb + (S.tg - S.tb) * q; l = S.lb * .5 + (S.lg - S.lb * .5) * q; }
    else if (ph < ta + .2) { th = S.tg; l = S.lg; [px, py] = at(gd - c.gap / 2 + Math.min(ph - ta, .1) * c.speed * .5); }
    else if (ph < ta + 1.05) { const q = ease((ph - ta - .2) / .85); th = S.tg + (S.tb - S.tg) * q; l = S.lg + (S.lb - S.lg) * q; [px, py] = tip(th, l); pr = q * 25; }
    else if (ph < ta + 1.35) { th = S.tb; l = S.lb; const q = (ph - ta - 1.05) / .3, sl = S.slots[S.caught % 3]; px = S.mouth[0] + sl[0] * q; py = S.mouth[1] + (sl[1] - 6) * q * q; po = 1 - q * .2; }
    else { const q = ease((ph - ta - 1.35) / .5); th = S.tb; l = S.lb + (S.lb * .5 - S.lb) * q; po = 0; [px, py] = S.mouth; }
    if (!(ph < ta - .45) && ph < ta + .2 && ph >= ta) { /* grabbed: sits at the gate */ }
    mv(S.pf, px, py, po, pr);
    /* arm: pivot → tip with a J hook */
    const [tx, ty] = tip(th, l), dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
    S.arm.setAttribute("d", `M${f(S.g.pivot[0])} ${f(S.g.pivot[1])}L${f(tx)} ${f(ty)}C${f(tx + dx * 9)} ${f(ty + dy * 9)} ${f(tx + dx * 9 - nx * 11)} ${f(ty + dy * 9 - ny * 11)} ${f(tx - nx * 10)} ${f(ty - ny * 10)}`);
    const catching = ph >= ta - .1 && ph < ta + .9;
    if (S.gate) S.gate.classList.toggle("catch", catching);
    if (S.bell) S.bell.classList.toggle("catch", catching);
    /* bin stack: one more reject per completed drop, cleared after three */
    if (still) S.caught = 1;
    else if (ci !== S.lastCyc) { S.lastCyc = ci; }
    const shown = still ? 1 : (ci % 4) + (ph > ta + 1.35 ? 1 : 0);
    if (!still) S.caught = ci % 4 === 3 && ph > ta + 1.35 ? 0 : ci % 4;
    S.stk.forEach((el, k) => { el.style.opacity = k < (shown > 3 ? 0 : shown) ? 1 : 0; });
  }

  /* ---------- tabs ---------- */
  function setMode(m, focus) {
    mode = m;
    tabs.forEach((b) => { const on = b.dataset.pipe === m; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    panel.setAttribute("aria-labelledby", `data-tab-${m}`);
    bodies.forEach((b) => { b.hidden = b.dataset.pipe !== m; });
    noteEl.innerHTML = HINT;
    render();
  }
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => setMode(b.dataset.pipe));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); setMode(tabs[(i + d + tabs.length) % tabs.length].dataset.pipe, true); }
    });
  });

  const check = () => { const v = board.clientWidth < 900; if (v !== vert || !S) { vert = v; render(); } };
  new ResizeObserver(check).observe(board);
  check();
  if (!NB.reduced) NB.loop(fig, (dt, t) => S && frame(t));
})();

/* 55-automation.js */
;/* #automation — hover/focus a mechanism card to show which pattern it demonstrates.
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

/* 60-security.js */
;/* 60 — security: hover/focus a guardrail to spotlight it in the sketch (motion itself is CSS) */
(() => {
  "use strict";
  const sec = document.getElementById("security");
  if (!sec) return;
  const svg = sec.querySelector(".sec-svg");
  const items = [...sec.querySelectorAll(".sec-li")];
  if (!svg) return;

  const set = (li) => {
    const part = li && li.dataset.part;
    svg.classList.toggle("is-focus", !!part);
    if (part) svg.dataset.part = part; else delete svg.dataset.part;
    items.forEach((o) => o.classList.toggle("is-on", o === li));
    svg.querySelectorAll(".sec-p").forEach((g) => g.classList.toggle("is-on", !!part && g.classList.contains("p-" + part)));
  };
  items.forEach((li) => {
    li.addEventListener("mouseenter", () => set(li));
    li.addEventListener("focus", () => set(li));
    li.addEventListener("mouseleave", () => { if (document.activeElement !== li) set(null); });
    li.addEventListener("blur", () => set(null));
  });
})();

/* 65-systems.js */
;/* 65 — systems: tabbed sketches (LSM write/read, query pushdown, roofline climb) */
(() => {
  "use strict";
  if (!window.NB) return;
  const sec = document.getElementById("systems");
  if (!sec) return;

  const reduced = NB.reduced;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeIO = (p) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const $ = (sel, root) => (root || sec).querySelector(sel);

  /* ---------- tabs ---------- */
  const tabs = [...sec.querySelectorAll(".sys-tab")];
  const panes = [...sec.querySelectorAll(".sys-pane")];

  function setTab(i, focus) {
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", String(k === i));
      t.tabIndex = k === i ? 0 : -1;
    });
    panes.forEach((p, k) => {
      p.hidden = k !== i;
      p.classList.toggle("is-open", k === i);
    });
    if (focus) tabs[i].focus();
  }

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => setTab(i));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const d = e.key === "ArrowRight" ? 1 : -1;
        setTab((i + d + tabs.length) % tabs.length, true);
      }
    });
  });
  setTab(0);

  /* ---------- per-pane animations ---------- */
  const lsm = $(".sys-lsm", sec);
  const qe = $(".sys-qe", sec);
  const roof = $(".sys-roof", sec);

  /* LSM: a key is written (dot along WAL → memtable → SSTable), then a read
     walks memtable → SST new → SST old → bloom "no"/"maybe" hit box. */
  if (lsm) {
    const wdot = $(".sys-wdot", lsm);
    const rdot = $(".sys-rdot", lsm);
    const maybe = $(".sys-maybe", lsm);
    const no = $(".sys-no", lsm);
    const hitbox = $(".sys-hitbox", lsm);
    const hitcheck = $(".sys-hitcheck", lsm);
    const getk = $(".sys-getk", lsm);
    const cp = $(".sys-cp", lsm);
    const cplab = $(".sys-cplab", lsm);

    // write path: WAL(84,64) → mem(234,64) → sst new(454,62)
    const wpath = [
      [84, 64, 120],   // t 0–0.3 hold at WAL
      [234, 64],       // t 0.3–0.6 to memtable
      [234, 64, 150],  // hold
      [454, 62]        // t 0.75–1.0 flush to newest SSTable
    ];
    // read path: mem(84,338) → sst new(244,338) → sst old(404,338) → hit(526,338)
    const rpath = [
      [44, 338, 160],
      [84, 338],
      [84, 338, 140],
      [244, 338],
      [244, 338, 140],
      [404, 338],
      [404, 338, 140],
      [520, 338]
    ];

    const sample = (path, p) => {
      let acc = 0;
      let x = path[0][0], y = path[0][1];
      for (let i = 0; i < path.length; i++) {
        const seg = path[i];
        const dur = seg.length > 2 ? seg[2] : 200;
        if (i < path.length - 1 && p * 1000 < acc + dur) {
          const lp = clamp01((p * 1000 - acc) / dur);
          const nx = path[i + 1][0], ny = path[i + 1][1];
          return [x + (nx - x) * lp, y + (ny - y) * lp];
        }
        acc += dur;
        if (i < path.length - 1) { x = path[i + 1][0]; y = path[i + 1][1]; }
      }
      return [x, y];
    };

    const LSM_T = 9;
    if (reduced) {
      wdot.setAttribute("cx", "84"); wdot.setAttribute("cy", "64");
      rdot.setAttribute("cx", "520"); rdot.setAttribute("cy", "338");
      hitbox.style.stroke = "var(--green)";
      hitcheck.style.opacity = "1";
      getk.style.opacity = "0";
      cplab.style.opacity = "1";
    } else {
      NB.loop(lsm, (_dt, t) => {
        const c = (t % LSM_T);
        // write half: 0–3.5 s
        const w = c < 3.2 ? sample(wpath, clamp01(c / 3.0)) : null;
        // read half: 4–8 s
        const r = c >= 4 && c < 8 ? sample(rpath, clamp01((c - 4) / 3.6)) : null;
        // compaction pulse near end
        const cpP = c >= 7.6 && c < 9 ? clamp01((c - 7.6) / 0.4) : 0;

        if (w) {
          wdot.setAttribute("cx", w[0].toFixed(1));
          wdot.setAttribute("cy", w[1].toFixed(1));
          wdot.style.opacity = "1";
        } else wdot.style.opacity = "0";

        if (r) {
          rdot.setAttribute("cx", r[0].toFixed(1));
          rdot.setAttribute("cy", r[1].toFixed(1));
          rdot.style.opacity = "1";
          // bloom verdicts appear as the dot reaches each table
          no.style.opacity = r[0] > 160 && r[0] < 244 ? "1" : "0";
          maybe.style.opacity = r[0] > 320 && r[0] < 404 ? "1" : "0";
          const hit = r[0] > 480;
          hitbox.style.stroke = hit ? "var(--green)" : "";
          hitcheck.style.opacity = hit ? "1" : "0";
          getk.style.opacity = "0";
        } else {
          rdot.style.opacity = "0";
          no.style.opacity = "0";
          maybe.style.opacity = "0";
          getk.style.opacity = c < 4 ? "1" : "0";
        }

        if (cplab) cplab.style.opacity = cpP ? "1" : "0";
        if (cp) cp.style.opacity = cpP ? "0.9" : "0";
      });
    }
  }

  /* Query engine: Filter node slides down into the Scan; the row group
     whose min/max exclude the predicate gets crossed out, then the plan
     settles and the annotation fades in. */
  if (qe) {
    const filt = $(".sys-filter", qe);
    const arrow = $(".sys-pd-arrow", qe);
    const flab = $(".sys-filterq", qe);
    const skip = $(".sys-skip", qe);
    const skipX = skip ? skip.querySelectorAll("[style]") : [];
    const skipLab = skip && skip.querySelector(".sys-lab.red");
    const rgNote = $(".sys-rg-note", qe);

    const QE_T = 8;
    if (reduced) {
      filt.setAttribute("transform", "translate(0,104)");
      arrow.style.opacity = "0";
      flab.style.opacity = "1";
      if (skipX.length) skipX.forEach((n) => (n.style.opacity = "1"));
      if (skipLab) skipLab.style.opacity = "1";
      if (rgNote) rgNote.style.opacity = "1";
    } else {
      NB.loop(qe, (_dt, t) => {
        const c = t % QE_T;
        const slideP = easeIO(clamp01((c - 0.6) / 1.6));   // slide 0.6–2.2
        const skipP = clamp01((c - 3.0) / 0.5);             // cross-out
        const noteP = clamp01((c - 3.8) / 0.5);
        const resetP = c > QE_T - 0.8;

        if (!resetP) {
          filt.setAttribute("transform", `translate(${0}px, ${slideP * 104}px)`);
          arrow.style.opacity = slideP > 0.05 && slideP < 0.9 ? "1" : "0";
          flab.style.opacity = slideP > 0.9 ? "1" : "0";
          skipX.forEach((n) => (n.style.opacity = String(skipP)));
          if (skipLab) skipLab.style.opacity = String(skipP);
          if (rgNote) rgNote.style.opacity = String(noteP);
        } else {
          const rp = easeIO((c - (QE_T - 0.8)) / 0.8);
          filt.setAttribute("transform", `translate(0, ${104 * (1 - rp)}px)`);
          flab.style.opacity = String(1 - rp);
          skipX.forEach((n) => (n.style.opacity = String(1 - rp)));
          if (skipLab) skipLab.style.opacity = String(1 - rp);
          if (rgNote) rgNote.style.opacity = String(1 - rp);
        }
      });
    }
  }

  /* Roofline: the SGEMM point climbs 1.27 → 13.17 → 36.11 GFLOP/s,
     arcs drawn between states, red pencil circle on the final point. */
  if (roof) {
    const p1 = $(".sys-rp1", roof);
    const p2 = $(".sys-rp2", roof);
    const a1 = $(".sys-roofarc1", roof);
    const a2 = $(".sys-roofarc2", roof);
    const ring = $(".sys-roofring", roof);

    const RF_T = 7;
    if (reduced) {
      [p1, p2, a1, a2, ring].forEach((el) => el && (el.style.opacity = "1"));
    } else {
      NB.loop(roof, (_dt, t) => {
        const c = t % RF_T;
        const s1 = easeIO(clamp01((c - 0.4) / 1.2));   // state 1 in
        const s2 = easeIO(clamp01((c - 3.2) / 1.2));   // state 2 in
        const resetP = c > RF_T - 1.0;
        const fade = resetP ? 1 - easeIO((c - (RF_T - 1.0)) / 1.0) : 1;
        p1.style.opacity = String(s1 * fade);
        p2.style.opacity = String(s2 * fade);
        a1.style.opacity = s1 > 0.4 && s2 < 0.4 ? String(0.9 * fade) : "0";
        a2.style.opacity = s2 > 0.6 ? String(0.9 * fade) : "0";
        ring.style.opacity = s2 > 0.9 ? String(fade) : "0";
      });
    }
  }
})();

/* 70-demos.js */
;/* demos: click-to-load video facades + CarbonShift slide flipper. No iframes exist until a visitor presses play. */
(() => {
  const root = document.getElementById("demos");
  if (!root) return;

  root.addEventListener("click", (e) => {
    const play = e.target.closest(".dm-play");
    if (play) {
      const f = document.createElement("iframe");
      f.src = play.dataset.embed;
      f.title = play.dataset.title;
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      f.referrerPolicy = "strict-origin-when-cross-origin";
      f.loading = "lazy";
      play.replaceWith(f);
      f.focus();
      return;
    }
    const s = e.target.closest(".dm-slides");
    if (s) {
      const srcs = s.dataset.slides.split("|"), alts = s.dataset.alts.split("|");
      const i = ((+s.dataset.i || 0) + 1) % srcs.length;
      s.dataset.i = i;
      const img = s.querySelector("img");
      img.src = srcs[i]; img.alt = alts[i];
      s.querySelector(".dm-slide-count b").textContent = i + 1;
      s.setAttribute("aria-label", `Show next CarbonShift slide (${i + 1} of ${srcs.length})`);
    }
  });
})();

/* 75-path.js */
;/* path: draws the route through the stop dots (rebuilt on resize), reveals it with scroll progress, toggles stop notes. */
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

/* 80-gallery.js */
;/* gallery: native <dialog> lightbox for the scrapbook photos */
(() => {
  const root = document.getElementById("gallery");
  const dlg = root && root.querySelector(".lightbox");
  if (!dlg || !dlg.showModal) return;
  const shots = [...root.querySelectorAll(".snap-open")];
  const img = dlg.querySelector("img");
  const cap = dlg.querySelector("figcaption");
  const count = dlg.querySelector(".lb-count");
  let i = 0, opener = null;

  function show(n) {
    i = (n + shots.length) % shots.length;
    const b = shots[i];
    img.width = +b.dataset.w; img.height = +b.dataset.h;
    img.src = b.dataset.full;
    img.alt = b.querySelector("img").alt;
    cap.textContent = b.dataset.caption;
    count.textContent = `${i + 1} of ${shots.length}`;
  }

  shots.forEach((b, n) => b.addEventListener("click", () => { opener = b; show(n); dlg.showModal(); }));
  dlg.querySelector(".lb-prev").addEventListener("click", () => show(i - 1));
  dlg.querySelector(".lb-next").addEventListener("click", () => show(i + 1));
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); show(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); show(i + 1); }
  });
  // click on the backdrop (outside the paper) closes
  dlg.addEventListener("click", (e) => {
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
  dlg.addEventListener("close", () => { opener && opener.focus(); });
})();

/* 85-resume.js */
;/* resume: track tabs swap the PDF; the preview iframe only loads once the section is near the viewport (desktop only). */
(() => {
  const root = document.getElementById("resume");
  if (!root) return;
  const frame = root.querySelector(".rs-frame");
  const tabs = [...root.querySelectorAll(".rs-tab")];
  const dl = root.querySelector(".rs-download"), open = root.querySelector(".rs-open");
  const mob = root.querySelector(".rs-mobile"), mobSub = root.querySelector(".rs-mobile-sub");
  const cur = root.querySelector(".rs-current b"), prev = root.querySelector(".rs-preview");
  const wide = matchMedia("(min-width: 761px)");
  let pdf = frame.dataset.src, loaded = false, near = false;

  const load = () => { if (!wide.matches) return; frame.classList.remove("is-ready"); frame.src = pdf + "#view=FitH"; loaded = true; };
  frame.addEventListener("load", () => frame.classList.add("is-ready"));

  // start loading about a screen early so the preview is ready on arrival
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); near = true; load(); } }, { rootMargin: "600px 0px" });
  io.observe(root);
  wide.addEventListener("change", () => { if (near && !loaded) load(); });

  root.addEventListener("click", (e) => {
    const t = e.target.closest(".rs-tab"); if (!t) return;
    tabs.forEach((b) => b.setAttribute("aria-pressed", b === t));
    pdf = t.dataset.pdf;
    dl.href = open.href = mob.href = pdf;
    prev.src = pdf.replace(/\.pdf$/, ".webp");
    mobSub.textContent = cur.textContent = t.dataset.label;
    frame.title = "Résumé preview: " + t.dataset.label;
    if (near) load();
  });
})();
