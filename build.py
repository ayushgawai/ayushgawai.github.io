#!/usr/bin/env python3
"""Multi-page build for the field-notebook site.
Each page = shared head + top binder nav + section fragments + shared CSS/JS.
Output: one HTML file per page at the repo root (GitHub Pages static site).
Each JS file is syntax-checked (node --check) and wrapped in try/catch, so one
section's bug can't stop the scripts after it.

Pages are declared in PAGES below. A fragment that is missing becomes an inline
<!-- missing --> comment instead of a build failure, so the site keeps growing
safely. Run `python3 build.py [page ...]` (default: all)."""
import pathlib, re, subprocess, sys
R = pathlib.Path(__file__).parent
src = R / "src"
ROOT = "https://ayushgawai.github.io"

def inc(m):
    p = src / m.group(1).strip()
    return inc_all(p.read_text()) if p.exists() else f"<!-- missing {m.group(1).strip()} -->"
def inc_all(t): return re.sub(r"<!--\s*@include\s+(.+?)\s*-->", inc, t)

def partial(name: str, **kw) -> str:
    p = src / "_partials" / f"{name}.html"
    t = p.read_text() if p.exists() else f"<!-- missing partial {name} -->"
    return t.replace("{title}", kw.get("title", "")) \
            .replace("{desc}", kw.get("desc", "")) \
            .replace("{url}", kw.get("url", "")) \
            .replace("{page}", kw.get("page", ""))

# page: (file, [fragments], title, description, nav-active-key)
PAGES = [
    ("index.html",       ["hero", "home-strip", "home-featured", "contact"],
     "Ayush Gawai — field notebook",
     "Ayush builds data, AI and robotics systems that people can trust: AV data infrastructure at Zoox, robot-learning and human-centered research at SJSU, and data platforms at Zscaler and LatentView.",
     "home"),
    ("experience.html",  ["path", "recognition", "contact"],
     "Experience — Ayush Gawai",
     "The full route: Zoox, Zscaler, LatentView, Coditas and SJSU research — open a stop for the technical depth.",
     "experience"),
    ("projects.html",    ["projlib", "contact"],
     "Projects — Ayush Gawai",
     "The complete library: every project, each with its own page of video, architecture and results.",
     "projects"),
    ("ai.html",          ["ai", "agents", "automation", "security"],
     "AI & LLM work — Ayush Gawai",
     "Applied AI: grounded LLM systems, agentic pipelines, and guardrails that keep models honest.",
     "ai"),
    ("data.html",        ["data"],
     "Data platforms — Ayush Gawai",
     "Streaming and batch data platforms: Kafka, Airflow, dbt, Snowflake, and the models on top.",
     "data"),
    ("software.html",    ["systems", "software"],
     "Software engineering — Ayush Gawai",
     "Systems software and performance: columnar engines, storage, matching and dedup in C++ and Java.",
     "software"),
    ("robotics.html",    ["robots"],
     "Robotics — Ayush Gawai",
     "Embodied AI: SO-101 imitation learning, obstacle-alert research and edge perception.",
     "robotics"),
    ("autonomy.html",    ["av"],
     "Autonomy & Zoox — Ayush Gawai",
     "Perception data infrastructure at Zoox: teaching a fleet of data miners to grade their own work.",
     "autonomy"),
    ("research.html",    ["research"],
     "Research — Ayush Gawai",
     "Published human-centered research: visual attention, assistive mobility and robot learning at SJSU.",
     "research"),
    ("hackathons.html",  ["hackathons"],
     "Hackathons — Ayush Gawai",
     "What wins and ships in 48 hours: Sentinel AI, Blast Radius, CarbonShift and the rest.",
     "hackathons"),
    ("media.html",       ["films", "demos", "gallery"],
     "Media — Ayush Gawai",
     "Demo films, live demos and the scrapbook — everything visual about the work.",
     "media"),
    ("recognition.html", ["recognition", "resume", "contact"],
     "Recognition — Ayush Gawai",
     "Awards, scholarships, features and the publications behind them.",
     "recognition"),
    ("contact.html",     ["contact"],
     "Contact — Ayush Gawai",
     "Ways to reach out: email, GitHub and LinkedIn.",
     "contact"),
]

def build_page(file, frs, title, desc, page_key):
    includes = "\n".join(f"<!-- @include sections/{f}.html -->" for f in frs)
    html = f"""<!doctype html>
<html lang="en">
<head>
{partial('head', title=title, desc=desc, url=f"{ROOT}/{'' if file=='index.html' else file}")}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

{partial('defs')}

{partial('topnav', page=page_key)}

<main id="main">
{includes}
</main>

<script src="assets/site.js" defer></script>
</body>
</html>
"""
    (R / file).write_text(inc_all(html))

def main():
    only = sys.argv[1:] or [p[0] for p in PAGES]
    for file, frs, title, desc, key in PAGES:
        if file not in only:
            continue
        build_page(file, frs, title, desc, key)
        print(f"built {file}")

    js = sorted((src / "js").glob("*.js"))
    bad = [p.name for p in js if subprocess.run(["node", "--check", str(p)], capture_output=True).returncode]
    if bad: sys.exit(f"syntax error in: {', '.join(bad)} (run: node --check src/js/<file>)")
    (R / "assets/site.css").write_text("\n".join(f"/* {p.name} */\n{p.read_text()}" for p in sorted((src / "css").glob("*.css"))))
    (R / "assets/site.js").write_text("\n".join(
        f"/* {p.name} */\ntry {{\n{p.read_text()}\n}} catch (e) {{ console.error('[{p.name}]', e); }}" for p in js))
    print("built assets/site.css + assets/site.js")

if __name__ == "__main__":
    main()
