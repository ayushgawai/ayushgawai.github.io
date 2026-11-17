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
