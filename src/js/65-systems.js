/* 65 — systems: tabbed sketches (LSM write/read, query pushdown, roofline climb) */
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
