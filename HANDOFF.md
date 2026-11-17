# Portfolio — handoff / status

## Current information architecture (Nov 16, 2026 — supersedes the sections below where they differ)
Top nav has 5 tabs: Experience · Hackathons & Projects · Research & Publications · Media & Recognition · Résumé & Contact.
- `index.html`: cover, first-person about + highlights, timeline, six featured, six photos, contact.
- `experience.html` (generated gallery from `src/data/experiences.json`) → `work/<slug>.html`: EVERYTHING about that employer
  (header from JSON + sketch blocks pulled out of section fragments; see `WORK_PARTS` in `build.py`).
- `projects.html` (hackathons + library from `src/data/projects.json`) → `project/<slug>.html`
  (JSON header + its sketch block, see `PROJECT_BLOCK`).
- `research.html`, `media.html` (films, scrapbook, recognition), `contact.html` (résumé + contact).
- A block lives on exactly one page. `build.py::part()` lifts a block out of `src/sections/*.html`; `fix_links()` repoints every
  cross-link to wherever the target id now lives; old URLs (`ai.html`, `autonomy.html`, `project/zoox.html`…) are redirects (`REDIRECTS`).
- The build fails on any broken internal link. Copy is first person ("I"). QA: `node .qa/page.mjs <path> <name> [width]`.


**Last updated:** after commit `e582fbe` (all pushed to `origin` + `githubio`).
The site is a hand-drawn "field notebook" (graph paper, ballpoint ink, tape).
**Do not change the aesthetic** — the owner was explicit: it looks great, only the
information architecture was the problem.

## The big change in progress: single-page → multi-page restructure

### Why
The site was one ~3,700-line page; a company (e.g. Zoox) appeared in ~9 sections; a
visitor wanting "just the Zoox work" had to scroll everything. Fix: real direct
pages + one source of truth per thing + a top binder-tab nav. Aesthetics unchanged.

### What is DONE and pushed
1. **Multi-page build** — `build.py` now emits 13 root pages (`index, experience,
   projects, ai, data, software, robotics, autonomy, research, hackathons, media,
   recognition, contact`) from `src/_partials/{head,defs,topnav}.html` + existing
   `src/sections/*.html` fragments. Run: `python3 build.py` (or `build.py <page>`).
2. **Top binder-tab nav** (`src/_partials/topnav.html` + `src/css/05-topnav.css`) —
   booktabs hanging from a sticky top bar; active tab lifts; old right-rail `.tabs`
   hidden via CSS. Mobile: horizontal scroll.
3. **Lean home** — `src/sections/home-strip.html` ("the main stops", 5 cards →
   each company's single work page) + `src/sections/home-featured.html`
   ("Six that carry the story" + "full library" CTA). CSS: `src/css/06-home.css`.
4. **Project detail pages (single source of truth)** — `src/data/projects.json`
   (29 projects) → `build.py::build_projects()` → `project/<slug>.html`. Each page:
   film (narrated `<video>` or YT/Loom iframe) + facts + how-it-works + design calls
   + stack + repo + paper links + related. CSS: `src/css/08-project.css`.
5. **Experience work pages** — `src/data/experiences.json` (zoox, research, zscaler,
   latentview, coditas) → `build.py::build_works()` → `work/<slug>.html`.
   CSS: `src/css/09-work.css`. The experience trail (`path.html`) has 5 mini-cards +
   "full page →" links to these.
6. **Software engineering is a real work area now** — `software.html` page
   (`systems` + new `src/sections/software.html` gallery) + nav tab + featured card.
7. **Auto-generated project library** — `src/sections/projlib.html` is generated
   from `projects.json` by `build_projlib()` (never hand-edit that file; edit the
   JSON).
8. **Recogition + Hackathons pages** — `src/sections/recognition.html` (awards +
   the 3 publications with real SAGE/ScienceDirect/HFES URLs reused from
   `research.html`) and `src/sections/hackathons.html` (gallery linking out).
   CSS: `src/css/07-newsections.css`.
9. **Captions fixed** — pose-describing alt/captions ("holding a microphone…",
   "standing beside a screen…") → neutral "Presenting X at Y" form.
10. **All 9 narrated films de-hedged + rebuilt** — "about/in scenarios" wording
    removed from carbonshift/wikirisk/lerobot narration per the no-caveats rule;
    re-rendered, re-synced `assets/video/narrated/`; the mmm race-corruption was
    repaired. All verified 0 decode errors. `TODO.md` #1 = move the 9 films to
    YouTube and embed YT ids instead of MP4s (owner's explicit ask, not done —
    needs the upload + video IDs from him).

### What is PENDING (do these next)
- **[1] YouTube migration** (`TODO.md` #1): owner uploads the 9 films, gives the
  9 video IDs; swap `<video>` for YT iframe in the Films section (`media.html`
  page) and project detail pages (`film.type = "yt"` is already supported in
  `build.py::_film_block` — sentinel/blast already use it). Then the big MP4s can
  be dropped from the repo.
- **[2] Paper link placeholders** (`TODO.md` #2): all 3 known publications have
  real URLs now; if the owner mentions other papers/proceedings, add them to
  `src/data/projects.json` (`papers: []` fields) + `recognition.html`, and use
  `"url": "placeholder"` — the builder already prints a red "link pending — see
  TODO.md" marker for those.
- **[3] Home featured cards point at category anchors** (e.g.
  `ai.html#p-sentinel`). Once/if detail pages become the canonical entry, update
  `home-featured.html` to link to `project/<slug>.html` instead. (The
  `projlib` cards already link to `project/`.)
- **[4] De-dup check:** `security.html` (on `ai.html` page) still describes
  Sentinel/Slackbot/Blast in full prose. Per the "one place per project" rule these
  cards could shrink to summary + "full story on the project page →" links (the
  project pages have the depth now).
- **[5] QA after any change:**
  - `python3 build.py`
  - link check (all relative hrefs across `*.html`, `project/`, `work/`):
    the checker from the last session is gone; a quick one-liner:
    `python3 - <<'EOF' ...` (rebuild a checker: walk pages, resolve every non-http
    `href` against the page's dir, assert exists; 404.html uses root-absolute refs).
  - `cd .qa && node overflow.mjs 390` → expect `scrollWidth 390 = viewport 390`.
  - Playwright smoke: serve via `.qa/serve.mjs`, load `/`, `/projects.html`,
    `/work/zoox.html`, `/project/sentinel.html`; expect 0 HTTP ≥400.
- **[6] Deploy:** `git push origin main` AND `git push githubio main`
  (githubio = the live ayushgawai.github.io site; BOTH must stay in sync).

### Key files
| file | role |
|---|---|
| `build.py` | multi-page build: PAGES list, `build_projects()`, `build_works()`, `build_projlib()` |
| `src/_partials/{head,defs,topnav,project-detail,work-detail}.html` | shared head/SVG defs/top nav + the two detail-page templates (use `{title}` etc. placeholders — `partial()` substitutes) |
| `src/data/projects.json` | **THE** single source for the 29 project pages. Fields: slug,title,area,where,summary,facts[],deep[],decisions[],stack[],repo,film(paperLinks via `papers[]`),related[] |
| `src/data/experiences.json` | the 5 work pages |
| `src/sections/*.html` | section fragments included by pages (old domain sections unchanged — they are now the "category" pages) |
| `src/css/05-topnav.css 06-home.css 07-newsections.css 08-project.css 09-work.css` | new-page styling (notebook tokens: `--paper --ink --blue --tape --f-hand --f-print`) |
| `videos/` | narrated-film pipeline (README.md + PROGRESS.md inside) |
| `TODO.md` | owner-input items (YT IDs, paper links) |

### Gotchas
- `project/` + `work/` pages need `../` prefixes for page links/assets —
  `build_projects`/`build_works` already do this via string replacement of a known
  link list; if you add new root-page links to the templates, add them to that list.
- `partial(name, **kw)` substitutes `/{key}/`… it replaces `{key}` tokens; the
  `project-detail.html` template placeholders are `{title} {where} {summary}
  {film} {facts} {deep} {decisions} {stack} {repo} {papers} {related} {page}`.
- `related` slugs must exist in `projects.json` (builder filters unknown ones).
- `film` values: `"slug"` (narrated, `assets/video/narrated/<slug>.mp4` +
  `-poster.webp`), `"silent:<file>"` (`assets/video/<file>`), or
  `{"type":"yt"|"loom","id":...}` for iframes.
- `assets/site.css` + `assets/site.js` are generated — never edit them by hand.
- `index.html` at root is still the built home page (Pages root). `404.html`
  predates the restructure (links to `index.html`) — fine as-is.
- Rate limits: the owner's gateway caps ~60 req/min for headless workers
  (`.qa/worker.sh` handles retries). Keep renders/TTS in the background;
  don't tie long work to a turn.

### Videos status (all done)
9 narrated films shipped in `assets/video/narrated/` + `videos/web/`:
carbonshift 3:12 · transit 3:00 · accessiMed 2:55 · wikirisk 2:39 · lerobot 2:43 ·
wheelchair 2:55 · leo 2:46 · eyetracking 2:26 · mmm 4:13. All de-hedged, all
verify 0 NAL decode errors, durations match `videos/timing/*.json`.
