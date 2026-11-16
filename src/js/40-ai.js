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
