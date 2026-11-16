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
