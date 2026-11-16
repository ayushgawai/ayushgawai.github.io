/* 60 — security: hover/focus a guardrail to spotlight it in the sketch (motion itself is CSS) */
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
