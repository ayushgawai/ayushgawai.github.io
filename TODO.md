# Portfolio — pending decisions & follow-ups

Local checklist; items here are waiting on Ayush's input before they get built.

## 1) Move demo films to YouTube, embed by link
The 9 narrated films currently ship as direct MP4s under `assets/video/narrated/`.
Plan: upload each to Ayush's YouTube (unlisted is fine) and swap the `<video>` embeds
for a YouTube `<iframe>` so the files don't live in the repo / don't load on scroll.

- [ ] Upload: carbonshift, transit, accessiMed, wikirisk, lerobot, wheelchair, leo, eyetracking, mmm
- [ ] Collect the 9 video IDs and record them here
- [ ] Swap the Films section (and any project detail pages) to embed the YT IDs
- [ ] Remove the large MP4s from `assets/video/` once YT is confirmed

## 2) Paper / publication links (need real URLs from Ayush)
Add proper links on the research + recognition pages. Where I'm unsure, I'll use a
placeholder and mark it here:

- [ ] Body Brain Connect / SAGE·HFES 2026 — DOI or full-text link?
- [ ] Power-wheelchair HMI — SAGE·HFES 2026 link
- [ ] Power-wheelchair obstacle alert — Elsevier / Transportation Research Part F (Vol 123, art 103801)
- [ ] Any other 2026 proceedings not listed above

## 3) "Software Engineering" work area
Add Software Engineering as a first-class work area (it's currently missing from the
domain list). Populate with the SE-focused projects (query engine, order book, dedup
store, CapFlow, APM explorer, Rx Fulfillment, agent-fleet, etc.).
