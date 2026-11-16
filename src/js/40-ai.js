/* #ai — generate → execute → verify → store loop. A slip travels the track; pass 1 fails and goes back
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
