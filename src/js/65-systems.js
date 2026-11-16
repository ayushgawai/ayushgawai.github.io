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
