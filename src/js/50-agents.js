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
