/* 00-core.js */
try {
/* Shared helpers. Every section script is concatenated after this file (alphabetical) into assets/site.js.
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

} catch (e) { console.error('[00-core.js]', e); }
/* 10-hero.js */
try {
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

} catch (e) { console.error('[10-hero.js]', e); }
/* 20-av.js */
try {
/* Autonomy chapter: robotaxi street loop, red-pencil catches, event cards into the validation pipeline. */
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
  const fit = () => { svg.setAttribute("viewBox", mq.matches ? "160 50 580 400" : "0 40 1200 420"); DET = mq.matches ? 715 : 860; };
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
    const x0 = a.left + a.width / 2 - W.left - 78, y0 = a.top + a.height / 2 - W.top - 24;
    const x1 = ok ? b.left + b.width / 2 - W.left - 78 : x0 - 40, y1 = ok ? b.top + b.height / 2 - W.top - 24 : sr.bottom - W.top - 30;
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

} catch (e) { console.error('[20-av.js]', e); }
/* 30-robots.js */
try {
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

} catch (e) { console.error('[30-robots.js]', e); }
/* 35-research.js */
try {
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

} catch (e) { console.error('[35-research.js]', e); }
/* 40-ai.js */
try {
/* #ai — (1) generate → execute → verify → store loop: a slip travels the track; pass 1 fails and goes back
   round with the evidence, pass 2 passes and is filed, then the LLM steps out of the loop.
   (2) tiny stepper for [data-stepper] sketches: adds .on to [data-s] elements in order, holds, resets. */
(() => {
  if (!window.NB) return;
  const $ = (id) => document.getElementById(id);

  /* ---------- the loop machine ---------- */
  const svg = $("ai-loop");
  if (svg) {
    const track = $("ai-track"), exit = $("ai-exit"), slip = $("ai-slip"), llm = $("ai-llm");
    const pass = $("ai-pass"), pred = $("ai-pred"), result = $("ai-result");
    const CARDS = [
      ["pass 1 · first draft", "= 'REVERSE'", "✗ 0 rows: not an observed label", "is-bad"],
      ["pass 2 · with the evidence", "LIKE '%LIGHTS_REVERSE%'", "✓ counts match the vocabulary", "is-good"],
      ["filed · canonical SQL", "LIKE '%LIGHTS_REVERSE%'", "scoring reruns it, no LLM", "is-filed"],
    ];
    let card = 0;
    const setCard = (i) => { card = i; pass.textContent = CARDS[i][0]; pred.textContent = CARDS[i][1]; result.innerHTML = "&nbsp;"; result.className = "ai-result hand"; };
    const showResult = () => { result.textContent = CARDS[card][2]; result.classList.add(CARDS[card][3]); };
    const cls = (name, on) => svg.classList.toggle(name, on);
    const llmAt = (k) => llm.setAttribute("transform", k ? `translate(${(380 * k).toFixed(1)} ${(-14 * k - 40 * Math.sin(Math.PI * k)).toFixed(1)})` : "");
    const finish = () => { setCard(2); showResult(); ["is-ok", "is-filed", "is-out"].forEach((c) => cls(c, true)); slip.classList.add("is-gone"); llmAt(1); };

    // Geometry is read lazily (first visible frame): getTotalLength can throw on a path that has never been laid out.
    let geo = null;
    const measure = () => {
      try {
        const L = track.getTotalLength(), LE = exit.getTotalLength();
        if (!(L > 0 && LE > 0)) return null;
        const near = (x, y) => { let best = 0, bd = Infinity; for (let s = 0; s < L; s += 2) { const p = track.getPointAtLength(s), d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = s; } } return best; };
        return { L, LE, EXE: near(470, 250), VER: near(330, 410) };
      } catch (e) { return null; }
    };

    if (NB.reduced) finish();
    else {
      const put = (p, r = 0) => slip.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${r.toFixed(1)})`);
      const at = (s) => track.getPointAtLength(((s % geo.L) + geo.L) % geo.L);
      const pause = (d, on) => ({ d, on });
      const move = (d, a, b, on) => ({ d, on, f: (k) => { const A = a(), B = b(); put(at(A + (B - A) * k), Math.sin(k * Math.PI) * -6); } });
      const g = (key) => () => (key === 0 ? 0 : geo[key]);
      const T = [
        pause(1.4, () => setCard(0)),
        move(1.3, g(0), g("EXE")),
        pause(0.9, () => cls("at-exe", true)),
        move(1.1, g("EXE"), g("VER"), () => cls("at-exe", false)),
        pause(1.8, () => { cls("is-x", true); showResult(); }),
        move(1.9, g("VER"), g("L"), () => cls("is-retry", true)),
        pause(0.5, () => cls("is-x", false)),
        pause(1.3, () => { cls("is-retry", false); setCard(1); }),
        move(1.3, g(0), g("EXE")),
        pause(0.9, () => cls("at-exe", true)),
        move(1.1, g("EXE"), g("VER"), () => cls("at-exe", false)),
        pause(1.6, () => { cls("is-ok", true); showResult(); }),
        { d: 1.1, f: (k) => put(exit.getPointAtLength(geo.LE * k), k * -14) },
        pause(0.5, () => { cls("is-filed", true); slip.classList.add("is-gone"); }),
        { d: 1.4, on: () => cls("is-out", true), f: llmAt },
        pause(5, () => { setCard(2); showResult(); cls("is-ok", false); }),
      ];
      const reset = () => {
        ["is-x", "is-ok", "is-filed", "is-out", "is-retry", "at-exe"].forEach((c) => cls(c, false));
        slip.classList.remove("is-gone"); llmAt(0); put(at(0));
      };
      const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
      let i = 0, t = 0, started = false, dead = false;
      NB.loop(svg, (dt) => {
        if (dead) return;
        if (!geo) { geo = measure(); if (!geo) { dead = true; finish(); return; } reset(); }
        const s = T[i];
        if (!started) { started = true; s.on && s.on(); }
        t += dt;
        s.f && s.f(ease(Math.min(1, t / s.d)));
        if (t >= s.d) { t = 0; started = false; i++; if (i >= T.length) { i = 0; reset(); } }
      });
    }
  }

  /* ---------- steppers ---------- */
  document.querySelectorAll("#ai [data-stepper]").forEach((el) => {
    const items = [...el.querySelectorAll("[data-s]")];
    const max = Math.max(...items.map((n) => +n.dataset.s));
    const show = (k) => items.forEach((n) => n.classList.toggle("on", +n.dataset.s <= k));
    if (NB.reduced) return show(max);
    const step = +el.dataset.stepper || .6, HOLD = 6;
    let k = 0, t = 0;
    NB.loop(el, (dt) => {
      t += dt;
      if (t < step) return;
      t = 0; k = (k + 1) % (max + HOLD); show(k);
    });
  });
})();

} catch (e) { console.error('[40-ai.js]', e); }
/* 45-data.js */
try {
/* #data: a hand-inked pipeline drawn from config. Tabs re-route it between three real pipelines;
   packets flow through, and one failing packet per cycle is hooked out into quarantine. */
(() => {
  const fig = document.querySelector("#data .data-sketch");
  const svg = fig && fig.querySelector(".data-svg"), canvas = svg && svg.querySelector(".data-canvas");
  const board = fig && fig.querySelector(".data-board"), noteEl = fig && fig.querySelector(".data-note");
  const panel = document.getElementById("data-panel");
  if (!canvas || !board || !noteEl || !panel) return; // markup out of sync: fail quietly, never throw
  const bodies = [...panel.querySelectorAll(".data-pb")];
  const tabs = [...fig.querySelectorAll(".tab")];
  const HINT = noteEl.innerHTML;

  const PIPES = {
    transit: {
      speed: 150, gap: 72, pkt: "row",
      st: [
        { k: "antenna", name: "GTFS feeds", sub: ["BART + VTA", "static + real-time"], note: "Static schedules and real-time vehicle feeds from two operators, BART and VTA." },
        { k: "log", name: "Kafka", sub: ["producer → consumer"], note: "A Kafka producer and consumer carry near-real-time vehicle events, with dedup and replay." },
        { k: "valve", name: "Airflow", sub: ["3 DAGs on MWAA"], note: "Three DAGs: GTFS incremental ingestion, streaming ingestion and ML forecasting." },
        { k: "gate", name: "checks", sub: ["late · malformed · dupes"], note: "Live events are aligned to static stop IDs; late or malformed location samples and duplicates are pulled aside." },
        { k: "wh", name: "Snowflake", sub: ["dbt · landing →", "analytics schemas"], note: "Snowflake landing and analytics schemas; dbt builds route-level performance aggregates." },
        { k: "screen", name: "FastAPI", sub: ["React/TS operator", "dashboard"], note: "FastAPI serves a React/TypeScript operator dashboard with maps and metrics; heavy ETL and training stay off this path." }
      ],
      ann: [[0, ["stop IDs ≠ live events:", "align them first"]], [2, ["ingest, stream,", "forecast"]], [5, ["+ Azure Databricks", "& Power BI KPIs"]]]
    },
    zscaler: {
      speed: 120, gap: 150, pkt: "delta",
      st: [
        { k: "tank", name: "Salesforce", sub: ["formula fields"], note: "Formula fields recalculate in real time but never update LastModified, so incremental loads missed them and pipelines fell back to full refreshes." },
        { k: "funnel", name: "formula compiler", sub: ["metadata → SQL"], note: "Pulls formula definitions from the Salesforce API, walks every field dependency depth-first, and an LLM drafts SQL from that structured context." },
        { k: "valve", name: "Matillion", sub: ["incremental upserts"], note: "Change detection and incremental upserts replace full-table refreshes." },
        { k: "wh", name: "Snowflake", sub: ["versioned dbt models", "clustered tables"], note: "Generated SQL lives in version-controlled dbt models; partitioning and Snowflake clustering cut scan volume." },
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
        { k: "valve", name: "MWAA", sub: ["modular Airflow DAGs"], note: "Legacy Airflow moved to managed MWAA patterns: containerized operators, modular DAGs, isolated tests, better retries." },
        { k: "bell", name: "SLA alerts", sub: ["CloudWatch, SNS", "+ Lambda"], note: "CloudWatch metrics, SNS alerts and Lambda triggers catch SLA breaches and job failures before the client does." }
      ],
      ann: [[0, ["moved in tracked", "batches"]], [2, ["one model:", "18 → 6 min"]], [5, ["~45% fewer client", "escalations"]]]
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
      const y = 236, xs = [...Array(n)].map((_, i) => 100 + i * 180);
      return { W: 1100, H: 500, s: 1.3, pts: xs.map((x) => [x, y]), bin: [xs[gi], 392], pivot: [xs[gi] + 74, 384] };
    }
    const gap = 128, y0 = 80, ys = [...Array(n)].map((_, i) => y0 + i * gap);
    return { W: 380, H: y0 + (n - 1) * gap + 80, s: .95, pts: ys.map((y) => [138, y]), bin: [54, ys[gi] + 50], pivot: [52, ys[gi] - 28] };
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
      h += ln(x0, y0 - 13, x1, y1 - 13, "ink", 1.4) + ln(x0, y0 + 13, x1, y1 + 13, "ink", 1.4);
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
      const lx = vert ? 190 : x, anchor = vert ? "start" : "middle";
      const ly = vert ? y - 6 : gate ? y - 132 : y + 98;
      let lab = `<text class="svg-hand lbl" x="${lx}" y="${ly}" text-anchor="${anchor}">${s.name}</text>`;
      s.sub.forEach((t, k) => { lab += `<text class="svg-print sub" x="${lx}" y="${ly + 24 + k * 21}" text-anchor="${anchor}">${t}</text>`; });
      h += `<g class="st st-${s.k}${gate ? " gate" : ""}" data-i="${i}" style="--i:${i}" tabindex="0" role="button" aria-label="${s.name}: ${s.note}">` +
        `<rect class="hit" x="${vert ? x - 60 : x - 88}" y="${vert ? y - 60 : y - 150}" width="${vert ? 310 : 176}" height="${vert ? 120 : 300}"/>` +
        `<g class="boil"><g transform="translate(${x} ${y}) scale(${g.s})">${G[s.k]()}</g></g>${lab}</g>`;
    });
    /* quarantine bin, stacked rejects, hook arm */
    const [bx, by] = g.bin, bw = vert ? 30 : 42, bh = vert ? 46 : 56;
    h += `<g class="bin rough">${ln(bx - bw, by, bx - bw + 9, by + bh)}${ln(bx - bw + 9, by + bh, bx + bw - 9, by + bh)}${ln(bx + bw - 9, by + bh, bx + bw, by)}${ln(bx - bw - 5, by, bx + bw + 5, by)}</g>`;
    h += `<text class="svg-hand qlbl" x="${bx}" y="${by + bh + (vert ? 22 : 28)}" text-anchor="middle">quarantine</text>`;
    const slots = vert ? [[-12, 36], [8, 37], [-2, 22]] : [[-17, 46], [5, 47], [-6, 30]];
    h += slots.map(([dx, dy], i) => `<g class="stk" data-k="${i}" transform="translate(${bx + dx} ${by + dy}) rotate(${(i - 1) * 9})">${BAD}</g>`).join("");
    h += `<g class="arm"><path class="ink-red arm-l"/><circle class="pivot" cx="${g.pivot[0]}" cy="${g.pivot[1]}" r="4"/></g>`;
    /* annotations (desktop only; mobile reads the result line) */
    if (!vert) c.ann.forEach(([i, lines, red]) => {
      const x = g.pts[i][0], cls = red ? "ink-red" : "ink-blue";
      const [tx, an] = i === 0 ? [x - 52, "start"] : i === n - 1 ? [x + 52, "end"] : [x, "middle"];
      h += `<g class="ann${red ? " red" : ""}">${lines.map((t, k) => `<text class="svg-hand" x="${tx}" y="${40 + k * 24}" text-anchor="${an}">${t}</text>`).join("")}` +
        `<path class="${cls} thin" d="M${x + 4} 82 q14 26 0 ${y0 - 82 - 62 * g.s - 8}" marker-end="url(#arrowhead)"/></g>`;
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

  const check = () => { const v = board.clientWidth < 920; if (v !== vert || !S) { vert = v; render(); } };
  new ResizeObserver(check).observe(board);
  const only = fig.closest('#data').dataset.only;
  if (only && PIPES[only]) { mode = only; }
  check();
  if (!NB.reduced) NB.loop(fig, (dt, t) => S && frame(t));
})();

} catch (e) { console.error('[45-data.js]', e); }
/* 50-agents.js */
try {
/* #agents — (1) the read-only ops bot: click a suggested question, the answer types out in handwriting;
   "ignore your rules" shows the guardrail. Plays question 1 once on first view so the log isn't empty.
   (2) Blast Radius: a stepper adds .on to [data-s] elements stage by stage (data-until hides them again). */
(() => {
  const reduced = !!(window.NB && NB.reduced);

  /* ---------- the notebook chat ---------- */
  const chat = document.getElementById("agent-chat");
  if (chat) {
    const log = document.getElementById("agent-chat-log");
    const btns = [...chat.querySelectorAll("button[data-q]")];
    const SRC = "Source · published weekly report · read-only";
    const REPLIES = [
      { a: "2 of your 14 miners failed this week: miner-A (no ground-truth rows in the window) and miner-B (run timed out). You were DM'd when each run failed.", s: SRC },
      { a: "miner-C: precision 0.94 this week, up from 0.91. That's true-positive labeled events over effective generated events, with canceled and failed-download work excluded.", s: SRC },
      { guard: true, a: "I can't. I'm read-only: no tools, no database access, no way to rerun or change a miner. Your message is treated as untrusted text, not an instruction. I can tell you which miners failed or what their precision is.", s: "Guardrail · zero tools · fenced untrusted input · bounded context" },
    ];
    const scroll = () => { log.scrollTop = log.scrollHeight; };
    const addMsg = (text, cls) => {
      const m = document.createElement("div");
      m.className = "msg " + cls + " flash";
      const t = document.createElement("span"); t.className = "msg-text"; t.textContent = text; m.append(t);
      log.append(m); scroll();
      return m;
    };
    let busy = false;
    const answer = (idx) => {
      if (busy) return;
      busy = true;
      const r = REPLIES[idx];
      btns.forEach((b) => (b.disabled = true));
      btns[idx].setAttribute("aria-pressed", "true");
      addMsg(btns[idx].textContent, "msg-q");
      const m = addMsg("", "msg-a" + (r.guard ? " guard" : ""));
      const textEl = m.firstChild, src = document.createElement("span");
      src.className = "src"; m.append(src);
      const done = () => { textEl.textContent = r.a; src.textContent = r.s; scroll(); busy = false; btns.forEach((b) => (b.disabled = false)); };
      if (reduced) return done();
      let i = 0;
      setTimeout(function tick() {
        i += 2;
        if (i >= r.a.length) return done();
        textEl.textContent = r.a.slice(0, i);
        textEl.insertAdjacentHTML("beforeend", '<span class="caret"></span>');
        scroll();
        setTimeout(tick, 20);
      }, 350);
    };
    btns.forEach((b, i) => b.addEventListener("click", () => answer(i)));
    let primed = false;
    if (window.NB) NB.onVisible(chat, () => { if (!primed) { primed = true; setTimeout(() => answer(0), 700); } });
  }

  /* ---------- Blast Radius stage script ---------- */
  const br = document.querySelector("#agents .br-svg");
  if (br) {
    const items = [...br.querySelectorAll("[data-s]")];
    const MAX = 7, HOLD = 3; // stages 1..7, then hold the green state for 3 beats before resetting
    const show = (k) => {
      items.forEach((n) => { const s = +n.dataset.s, u = n.dataset.until ? +n.dataset.until : 99; n.classList.toggle("on", s <= k && k <= u); });
      br.classList.toggle("is-run", k >= 1);
      br.classList.toggle("is-pending", k >= 5 && k <= 6);
      br.classList.toggle("is-green", k >= 7);
    };
    if (reduced || !window.NB) show(MAX);
    else {
      const step = +br.dataset.step || 1.9;
      let k = 0, t = 0;
      show(0);
      NB.loop(br, (dt) => {
        t += dt;
        if (t < (k === 0 ? 0.8 : step)) return;
        t = 0; k = (k + 1) % (MAX + HOLD); show(Math.min(k, MAX));
      });
    }
  }
})();

} catch (e) { console.error('[50-agents.js]', e); }
/* 55-automation.js */
try {
/* #automation: all motion is CSS. This only advances the week number on the snapshot page
   each time the scheduled cycle restarts, so every "week" publishes a new immutable report. */
(() => {
  const page = document.querySelector("#automation .as-page");
  const wk = page && page.querySelector(".as-wk");
  if (!wk || NB.reduced) return;
  let n = 23;
  page.addEventListener("animationiteration", () => { wk.textContent = `wk ${n = n >= 52 ? 1 : n + 1}`; });
})();

} catch (e) { console.error('[55-automation.js]', e); }
/* 60-security.js */
try {
/* 60 — security: hover/focus a guardrail fact to spotlight it in the fence sketch (motion itself is CSS) */
(() => {
  "use strict";
  const sec = document.getElementById("security");
  if (!sec) return;
  const svg = sec.querySelector(".sec-svg");
  const items = [...sec.querySelectorAll(".sec-fact[data-part]")];
  if (!svg) return;

  const set = (li) => {
    const part = li && li.dataset.part;
    svg.classList.toggle("is-focus", !!part);
    svg.dataset.part = part || "";
    items.forEach((o) => o.classList.toggle("is-on", o === li));
    svg.querySelectorAll(".sec-part").forEach((g) => g.classList.toggle("is-on", !!part && g.classList.contains("p-" + part)));
  };
  items.forEach((li) => {
    li.addEventListener("mouseenter", () => set(li));
    li.addEventListener("focus", () => set(li));
    li.addEventListener("mouseleave", () => { if (document.activeElement !== li) set(null); });
    li.addEventListener("blur", () => set(null));
  });
})();

} catch (e) { console.error('[60-security.js]', e); }
/* 65-systems.js */
try {
/* 65 — systems: tabbed sketches (LSM write/read, query pushdown, roofline climb) synced to the entry on the right.
   Each sketch is a pure render(t) of a looping timeline; NB.loop only runs it while the pane is visible. */
(() => {
  "use strict";
  const sec = document.getElementById("systems");
  if (!sec || !window.NB) return;

  /* ---------- tabs + entry sync (WAI-ARIA tabs, arrow keys) ---------- */
  const tabs = [...sec.querySelectorAll(".sys-tab")];
  const panes = [...sec.querySelectorAll(".sys-pane")];
  const entries = [...sec.querySelectorAll(".sys-entry")];
  const setTab = (i, focus) => {
    tabs.forEach((t, k) => { t.setAttribute("aria-selected", String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    panes.forEach((p, k) => { p.hidden = k !== i; });
    entries.forEach((e, k) => e.classList.toggle("is-active", k === i));
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => setTab(i));
    t.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); setTab((i + d + tabs.length) % tabs.length, true); }
    });
  });

  const only = ["lsm", "qe", "roof"].indexOf(sec.dataset.only);
  if (only >= 0) setTab(only);

  /* ---------- timeline helpers ---------- */
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ramp = (c, a, b) => ease(clamp((c - a) / (b - a)));          // 0 → 1 between a and b
  const on = (c, a, b) => c >= a && c < b;
  // keyframes [[t, x, y], ...] → eased position at time c
  const track = (kf, c) => {
    if (c <= kf[0][0]) return kf[0].slice(1);
    for (let i = 1; i < kf.length; i++) {
      const [t1, x1, y1] = kf[i], [t0, x0, y0] = kf[i - 1];
      if (c < t1) { const p = ease((c - t0) / (t1 - t0)); return [x0 + (x1 - x0) * p, y0 + (y1 - y0) * p]; }
    }
    return kf[kf.length - 1].slice(1);
  };
  const stepText = (steps, c) => { let s = steps[0][1]; for (const [t, txt] of steps) if (c >= t) s = txt; return s; };

  function run(svg, T, tFinal, render) {
    if (!svg) return;
    if (NB.reduced) { render(tFinal); return; }
    render(0);
    NB.loop(svg, (_dt, t) => render(t % T));
  }

  /* ---------- 1 · LSM: put k → WAL → memtable; get j → memtable → Bloom no → Bloom maybe, found; compaction ---------- */
  (() => {
    const svg = sec.querySelector(".sys-lsm"); if (!svg) return;
    const q = (s) => svg.querySelector(s);
    const dw = q(".sys-dot-w"), dr = q(".sys-dot-r"), wal = q(".sys-wal-new"), k = q(".sys-k"), mem = q(".sys-mem"),
      b3 = q(".sys-bits3"), b2 = q(".sys-bits2"), s3 = q(".sys-sst3"), s2 = q(".sys-sst2"), found = q(".sys-found"),
      ghost = q(".sys-ghost"), status = q(".sys-status");
    const W = [[0.2, 62, 44], [1.2, 62, 118], [1.7, 62, 118], [2.7, 212, 92]];
    const R = [[3.2, 290, 236], [4.0, 202, 122], [4.8, 202, 122], [5.4, 352, 66], [6.4, 352, 66], [7.0, 352, 120]];
    const S = [[0, "put k: append to the WAL, fsync"], [1.6, "insert k into the sorted memtable"],
      [3.2, "get j: memtable first, a miss"], [4.8, "newest SSTable: Bloom says no, skip"],
      [6.4, "next SSTable: Bloom says maybe, found"], [8.4, "compaction merges SSTables into one"]];
    const T = 11;
    run(svg, T, 7.8, (c) => {
      const [wx, wy] = track(W, c), [rx, ry] = track(R, c);
      dw.setAttribute("cx", wx); dw.setAttribute("cy", wy); dw.style.opacity = on(c, 0.2, 2.9) ? 1 : 0;
      dr.setAttribute("cx", rx); dr.setAttribute("cy", ry); dr.style.opacity = on(c, 3.2, 8.3) ? 1 : 0;
      wal.style.opacity = on(c, 1.2, T - 0.5) ? 1 : 0;
      k.style.opacity = on(c, 2.6, T - 0.5) ? 1 : 0;
      mem.classList.toggle("is-miss", on(c, 4.0, 4.8));
      b3.classList.toggle("is-no", on(c, 5.4, 6.4)); s3.classList.toggle("is-miss", on(c, 5.4, 6.4));
      b2.classList.toggle("is-maybe", on(c, 7.0, 8.4)); s2.classList.toggle("is-hit", on(c, 7.0, 8.4));
      found.style.opacity = on(c, 7.2, 8.4) ? 1 : 0;
      const g = ramp(c, 8.6, 9.8);
      ghost.setAttribute("transform", `translate(0 ${(152 * g).toFixed(1)})`);
      ghost.style.opacity = on(c, 8.5, 10.4) ? 1 : 0;
      const txt = stepText(S, c); if (status.textContent !== txt) status.textContent = txt;
    });
  })();

  /* ---------- 2 · Query engine: Filter pushed into the scan; min/max stats skip row group 2 ---------- */
  (() => {
    const svg = sec.querySelector(".sys-qe"); if (!svg) return;
    const q = (s) => svg.querySelector(s);
    const filt = q(".sys-filter"), pred = q(".sys-pred"), pill = q(".sys-pill"), arrow = q(".sys-scanarrow"),
      ok = q(".sys-ok"), x = q(".sys-skipx"), rg2 = q(".sys-rg2"), status = q(".sys-status");
    const S = [[0, "the plan, as written"], [1.4, "optimizer pushes the filter into the scan"],
      [3.4, "scan reads row-group min / max first"], [4.8, "group 2: max 41 < 50, never decoded"]];
    const T = 9;
    run(svg, T, 6.5, (c) => {
      const back = ramp(c, 8.3, 8.9);
      const s = ramp(c, 1.4, 3.0) * (1 - back);
      filt.setAttribute("transform", `translate(0 ${(72 * s).toFixed(1)})`);
      filt.style.opacity = 1 - ramp(c, 2.2, 3.0) * (1 - back);
      pred.setAttribute("transform", `translate(0 ${(72 * s).toFixed(1)})`);
      pill.style.opacity = s > 0.95 ? 1 : 0;
      arrow.style.opacity = on(c, 3.4, 8.3) ? 1 : 0;
      ok.style.opacity = x.style.opacity = on(c, 4.8, 8.3) ? 1 : 0;
      rg2.style.opacity = on(c, 4.8, 8.3) ? 0.45 : 1;
      const txt = stepText(S, c); if (status.textContent !== txt) status.textContent = txt;
    });
  })();

  /* ---------- 3 · Roofline: SGEMM 1.27 → 13.17 → 36.11 GFLOP/s ---------- */
  (() => {
    const svg = sec.querySelector(".sys-roof"); if (!svg) return;
    const q = (s) => svg.querySelector(s);
    const pt = q(".sys-pt"), trail = q(".sys-trail"), l1 = q(".sys-l1"), l2 = q(".sys-l2"), status = q(".sys-status");
    const P = [[0.8, 200, 290], [2.4, 200, 188], [3.8, 200, 188], [5.4, 330, 144]];
    const S = [[0, "scalar loops: 1.27 GFLOP/s"], [0.8, "loop reorder: 13.17 GFLOP/s, 10.4×"], [3.8, "cache blocking + OpenMP: 36.11 GFLOP/s"]];
    const T = 9.5;
    run(svg, T, 7, (c) => {
      const [px, py] = track(P, c);
      pt.setAttribute("cx", px); pt.setAttribute("cy", py);
      pt.style.opacity = c > T - 0.5 ? 0 : 1;
      const fade = c > T - 0.9 ? 0 : 1;
      l1.style.opacity = on(c, 2.3, T) ? fade : 0;
      l2.style.opacity = on(c, 5.3, T) ? fade : 0;
      trail.style.opacity = c > 1 ? 0.7 * fade : 0;
      const txt = stepText(S, c); if (status.textContent !== txt) status.textContent = txt;
    });
  })();
})();

} catch (e) { console.error('[65-systems.js]', e); }
/* 70-demos.js */
try {
/* demos: the transit diagram's packets are SMIL; run them only while the sketch is on screen, never under reduced motion. */
(() => {
  const svg = document.querySelector("#demos .dm-tr");
  if (!svg || !svg.pauseAnimations) return;
  svg.pauseAnimations();
  if (NB.reduced) return;
  NB.onVisible(svg, () => svg.unpauseAnimations(), () => svg.pauseAnimations());
})();

} catch (e) { console.error('[70-demos.js]', e); }
/* 72-films.js */
try {
/* films: one reel at a time. Starting a film pauses any other; scrolling a playing film offscreen pauses it. */
(() => {
  const root = document.getElementById("films");
  if (!root) return;
  const vids = [...root.querySelectorAll("video")];
  vids.forEach((v) => {
    v.addEventListener("play", () => vids.forEach((o) => o !== v && !o.paused && o.pause()));
    if (window.NB) NB.onVisible(v, () => {}, () => v.paused || v.pause());
  });
})();

} catch (e) { console.error('[72-films.js]', e); }
/* 75-path.js */
try {
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
    if (multi && sj > 0) { move.style.left = "34px"; move.style.top = (pts[sj].y - 26) + "px"; move.dataset.at = sj; }
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

} catch (e) { console.error('[75-path.js]', e); }
/* 80-gallery.js */
try {
/* gallery: native <dialog> lightbox for the scrapbook photos */
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

} catch (e) { console.error('[80-gallery.js]', e); }
/* 85-resume.js */
try {
/* resume: track tabs swap the PDF; the preview iframe only loads once the section is near the viewport (desktop only). */
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

} catch (e) { console.error('[85-resume.js]', e); }