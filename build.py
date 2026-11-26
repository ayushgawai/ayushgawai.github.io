#!/usr/bin/env python3
"""Multi-page build for the field-notebook site.

Information architecture (one home per thing):
  index.html        cover, about, highlights, timeline, six featured, six photos
  experience.html   gallery of employers  -> work/<slug>.html   (EVERYTHING about that employer)
  projects.html     hackathons + library  -> project/<slug>.html (EVERYTHING about that project)
  research.html     studies + publications
  media.html        films, scrapbook, recognition
  contact.html      resume + contact

Section fragments in src/sections/ hold the animated sketches. Pages are composed
from whole fragments or from single blocks pulled out of them (see part()), so a
block is written once and placed on exactly one page. Old URLs become redirects.
Cross-links are rewritten to wherever a block ended up (see fix_links()).

Run: python3 build.py"""
import pathlib, re, subprocess, sys, json, html as htmlmod
R = pathlib.Path(__file__).parent
src = R / "src"
ROOT = "https://ayushgawai.github.io"

def _esc(s): return htmlmod.escape(str(s), quote=True)
def frag(name): return (src / "sections" / f"{name}.html").read_text()

def partial(name, **kw):
    t = (src / "_partials" / f"{name}.html").read_text()
    for k, v in kw.items(): t = t.replace("{%s}" % k, v)
    return t

# ---------- pulling one block out of a fragment ----------
def find(html, sel):
    """Return (start, end) of the first element matching '#id' or '.class', tag-balanced."""
    if sel[0] == "#": pat = r'<(\w+)\b[^>]*\bid="%s"[^>]*>' % re.escape(sel[1:])
    else: pat = r'<(\w+)\b[^>]*\bclass="[^"]*(?<![\w-])%s(?![\w-])[^"]*"[^>]*>' % re.escape(sel[1:])
    m = re.search(pat, html)
    if not m: raise SystemExit(f"build: selector {sel} not found")
    tag, depth, pos = m.group(1), 1, m.end()
    for t in re.finditer(r"<(/?)%s\b[^>]*>" % tag, html[pos:]):
        depth += -1 if t.group(1) else 1
        if depth == 0: return m.start(), pos + t.end()
    raise SystemExit(f"build: unbalanced <{tag}> for {sel}")

def take(html, sel):
    a, b = find(html, sel); return html[a:b]
def drop(html, *sels):
    for s in sels:
        a, b = find(html, s); html = html[:a] + html[b:]
    return html

def part(section, sels, attrs=""):
    """A slim copy of a section holding only the chosen blocks. Keeps the section id so its scoped CSS/JS still apply."""
    h = frag(section)
    inner = "\n".join(re.sub(r"^(<\w+)", r'\1 data-part', take(h, s).replace(" hidden>", ">"), count=1) for s in sels)
    return f'<section class="chapter chapter--part" id="{section}" {attrs}>\n<div class="page part-page">\n{inner}\n</div>\n</section>'

def data_pipe(pipe):
    h = frag("data")
    fig = take(h, ".data-sketch"); art = take(h, f"#p-{pipe}").replace(" hidden>", ">")
    return (f'<section class="chapter chapter--part" id="data" data-only="{pipe}">\n<div class="page">\n{fig}\n'
            f'<div class="data-panel" id="data-panel" role="region">\n{art}\n</div>\n</div>\n</section>')

def systems_pane(pane):
    return part("systems", ["#p-under-app"], f'data-only="{pane}"')

# ---------- where every block lives ----------
WORK_PARTS = {
    "zoox": lambda: [drop(frag("av"), "#p-scene-miner", "#p-trajectory"), part("ai", ["#p-predicates"]),
                     part("automation", ["#p-fleet-reporting"]), part("agents", ["#p-slackbot"]), part("security", ["#p-sec-fence"])],
    "zscaler": lambda: [data_pipe("zscaler"), part("ai", ["#p-formulas"])],
    "latentview": lambda: [data_pipe("latentview")],
    "coditas": lambda: [part("automation", ["#p-cicd"])],
    "sneakstore": lambda: [part("automation", ["#p-sneakstore"])],
}
PROJECT_BLOCK = {
    "sentinel": lambda: part("ai", ["#p-sentinel"]),
    "leo": lambda: part("ai", ["#p-leo"]),
    "blast": lambda: part("agents", ["#p-blast"]),
    "obstacle": lambda: part("robots", ["#p-obstacle"]),
    "warehouse": lambda: part("robots", ["#p-warehouse"]),
    "labelloop": lambda: part("labelloop", ["#p-labelloop"]),
    "transit": lambda: data_pipe("transit"),
    "transitrisk": lambda: part("data", ["#p-transitrisk"]),
    "wikirisk": lambda: part("data", ["#p-wikirisk"]),
    "capflow": lambda: part("data", ["#p-capflow"]),
    "lsmstore": lambda: systems_pane("lsm"),
    "query-engine": lambda: systems_pane("qe"),
    "siliconbench": lambda: systems_pane("roof"),
    "carbonshift": lambda: part("systems", ["#p-carbonshift"]),
    "scene-miner": lambda: part("av", ["#p-scene-miner"]),
    "trajectory": lambda: part("av", ["#p-trajectory"]),
}
# old URL -> its one new home
REDIRECTS = {
    "ai.html": "projects.html", "data.html": "projects.html", "software.html": "projects.html", "robotics.html": "projects.html",
    "hackathons.html": "projects.html", "autonomy.html": "work/zoox.html", "recognition.html": "media.html",
    "work/research.html": "research.html",
    "project/predicates.html": "work/zoox.html", "project/fleet-reporting.html": "work/zoox.html",
    "project/slackbot.html": "work/zoox.html", "project/zoox.html": "work/zoox.html",
    "project/formulas.html": "work/zscaler.html", "project/latentview.html": "work/latentview.html",
    "project/cicd.html": "work/coditas.html", "project/eyetracking.html": "research.html", "project/wheelchair.html": "research.html",
    "project/so101.html": "research.html",
}
MOVED = {"predicates", "fleet-reporting", "slackbot", "zoox", "formulas", "latentview", "cicd", "eyetracking", "wheelchair", "so101"}

PAGES = [  # file, [parts], title, description, nav key
    ("index.html", ["hero", "home-about", "home-featured", "path", "skills", "home-photos", "contact"],
     "Ayush Gawai — field notebook",
     "I build data, AI and robotics systems people can trust: AV data infrastructure at Zoox, robot-learning and human-centered research at SJSU, data platforms at Zscaler and LatentView.", "home"),
    ("experience.html", ["@xp"],
     "Experience — Ayush Gawai", "Where I have worked: Zoox, Zscaler, LatentView, Coditas and my own store. Each has one page with the whole story.", "experience"),
    ("projects.html", ["projlib"],
     "Hackathons and projects — Ayush Gawai", "Every hackathon build and project, each with one page: demo, moving sketch, numbers, code.", "projects"),
    ("research.html", ["research"],
     "Research and publications — Ayush Gawai", "Published human-centered AI research at SJSU: visual attention and assistive mobility.", "research"),
    ("media.html", ["gallery", "recognition"],
     "Media and recognition — Ayush Gawai", "Project films, photos, awards and press.", "media"),
    ("contact.html", ["resume", "contact"],
     "Résumé and contact — Ayush Gawai", "My résumé and how to reach me.", "contact"),
]

def shell(body, title, desc, url, key):
    return f"""<!doctype html>
<html lang="en">
<head>
{partial('head', title=title, desc=desc, url=url, assetbase='')}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

{partial('defs')}

{partial('topnav', page=key)}

<main id="main">
{body}
</main>

<script src="assets/site.js" defer></script>
</body>
</html>
"""

def _film_block(m, ab):
    if not m: return ""
    if isinstance(m, str):  # "silent:query-engine.mp4"
        if m.startswith("silent:"):
            f = "assets/video/" + m.split(":", 1)[1]
        else:
            f = f"assets/video/narrated/{m}.mp4"
        return (f'<figure class="proj-film"><video controls preload="metadata" playsinline '
                f'poster="{ab}{f.replace(".mp4","")}-poster.webp" width="1920" height="1080">'
                f'<source src="{ab}{f}" type="video/mp4"></video></figure>')
    t = m.get("type")
    if t == "yt":
        return (f'<figure class="proj-film proj-film-embed"><div class="embed-frame">'
                f'<iframe src="https://www.youtube-nocookie.com/embed/{m["id"]}" title="{m.get("label","Video")}" '
                f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>'
                f'</div></figure>')
    if t == "loom":
        return (f'<figure class="proj-film proj-film-embed"><div class="embed-frame">'
                f'<iframe src="https://www.loom.com/embed/{m["id"]}?autoplay=0&hide_owner=true" title="{m.get("label","Video")}" allow="fullscreen" loading="lazy"></iframe>'
                f'</div></figure>')
    return ""

OUT = {}   # path -> html (root-relative links; prefixed for subfolders when written)

def projects_data(): return json.loads((src / "data" / "projects.json").read_text())
def works_data(): return json.loads((src / "data" / "experiences.json").read_text())

def build_projects():
    items = [it for it in projects_data()["items"] if it["slug"] not in MOVED]
    slugs = {it["slug"] for it in items}
    for it in items:
        slug, title = it["slug"], it["title"]
        block = PROJECT_BLOCK[slug]() if slug in PROJECT_BLOCK else ""
        facts = "".join(f'<p class="fact"><b>{_esc(f["k"])}</b>{_esc(f.get("v",""))}</p>' for f in it.get("facts", []))
        deep = "".join(f"<li>{_esc(p)}</li>" for p in it.get("deep", []))
        two = "" if (block and not it.get("showtext")) or not (facts or deep) else (
            f'<div class="proj-two"><div class="proj-facts"><h3 class="proj-sub hand">the numbers</h3>{facts}</div>'
            f'<div class="proj-deep"><h3 class="proj-sub hand">how it works</h3><ul class="deep-list">{deep}</ul></div></div>')
        dec = it.get("decisions", [])
        decisions = ('<div class="proj-decs"><h3 class="proj-sub hand">the design calls</h3><div class="decs-grid">'
                     + "".join(f'<div class="dec"><h4>{_esc(d["h"])}</h4><p>{_esc(d["b"])}</p></div>' for d in dec) + "</div></div>") if dec else ""
        stack = "".join(f"<li>{_esc(s)}</li>" for s in it.get("stack", []))
        repo = (f'<a class="btn" href="{it["repo"]}" target="_blank" rel="noopener">Code on GitHub</a>' if it.get("repo")
                else '<p class="hand pencil">no public repo</p>')
        papers = "".join(f'<a class="btn" href="{_esc(p["url"])}" target="_blank" rel="noopener">{_esc(p["label"])}</a> '
                         for p in it.get("papers", []) if "placeholder" not in p["url"])
        rel = [r for r in it.get("related", []) if r in slugs]
        related = ('<p class="proj-rel hand">same territory: ' + "".join(
            f'<a class="rel-link" href="project/{r}.html">{_esc(next(x["title"] for x in items if x["slug"]==r))}</a>' for r in rel) + "</p>") if rel else ""
        film = it.get("film")
        film_html = "" if (block and 'class="video"' in block and isinstance(film, dict)) else _film_block(film, "")
        if it.get("film2"): film_html += '<h3 class="proj-sub hand" id="film2">the explainer film</h3>' + _film_block(it["film2"], "")
        body = f"""<section class="chapter proj" id="proj" aria-labelledby="proj-title">
  <header class="chapter-head page">
    <p class="proj-back"><a class="hand" href="projects.html">← all hackathons and projects</a></p>
    <p class="chapter-kicker hand">{_esc(it.get("where",""))}</p>
    <h1 id="proj-title" class="chapter-title">{_esc(title)}</h1>
    <p class="chapter-lede">{_esc(it.get("summary",""))}</p>
  </header>
  <div class="page">{film_html}{two}</div>
</section>
{block}
<section class="chapter proj proj-tail" aria-label="More about {_esc(title)}">
  <div class="page">
    {decisions}
    <div class="proj-rows">
      <div class="proj-stack"><h3 class="proj-sub hand">the stack</h3><ul class="tags">{stack}</ul></div>
      <div class="proj-links"><h3 class="proj-sub hand">the links</h3><div class="btn-row">{repo}{papers}</div></div>
    </div>
    {related}
    <p class="proj-back"><a class="hand" href="projects.html">← all hackathons and projects</a></p>
  </div>
</section>"""
        OUT[f"project/{slug}.html"] = shell(body, f"{title} — Ayush Gawai", _esc(f'{title}: {it["summary"]}'[:155]), f"{ROOT}/project/{slug}.html", "projects")
    return items

def build_works():
    items = works_data()["items"]
    for it in items:
        slug = it["slug"]
        if slug not in WORK_PARTS: continue
        numbers = "".join(f'<p class="fact"><b>{_esc(n["k"])}</b>{_esc(n.get("v",""))}</p>' for n in it.get("numbers", []))
        story = "".join(f"<li>{_esc(p)}</li>" for p in it.get("deep", []))
        stack = "".join(f"<li>{_esc(x)}</li>" for x in it.get("stack", []))
        body = f"""<section class="chapter work" id="work" aria-labelledby="work-title">
  <header class="chapter-head page">
    <p class="proj-back"><a class="hand" href="experience.html">← all experience</a></p>
    <p class="chapter-kicker hand">{_esc(it["dates"])} · {_esc(it["role"])}</p>
    <h1 id="work-title" class="chapter-title">{_esc(it["org"])}</h1>
    <p class="chapter-lede">{_esc(it["one"])}</p>
  </header>
  <div class="page">
    <div class="work-two">
      <div class="work-numbers"><h3 class="proj-sub hand">on the record</h3><div class="facts">{numbers}</div></div>
      <div class="work-story"><h3 class="proj-sub hand">what I did</h3><ul class="deep-list">{story}</ul></div>
    </div>
    <div class="proj-rows"><div><h3 class="proj-sub hand">the stack</h3><ul class="tags">{stack}</ul></div></div>
    <p class="work-next hand">drawn out below: every system I built here, each with its own sketch and deep dive ↓</p>
  </div>
</section>
{chr(10).join(WORK_PARTS[slug]())}
<section class="chapter proj proj-tail"><div class="page"><p class="proj-back"><a class="hand" href="experience.html">← all experience</a></p></div></section>"""
        OUT[f"work/{slug}.html"] = shell(body, f'{it["org"]} — experience · Ayush Gawai', _esc(f'{it["org"]}: {it["role"]}, {it["dates"]}'), f"{ROOT}/work/{slug}.html", "experience")
    return items

def xp_gallery(items):
    cards = []
    for it in items:
        href = f'work/{it["slug"]}.html' if it["slug"] in WORK_PARTS else "research.html"
        nums = "".join(f'<li><b>{_esc(n["k"])}</b> {_esc(n.get("v",""))}</li>' for n in it.get("numbers", [])[:3])
        logo = {"zoox": "zoox", "zscaler": "zscaler", "coditas": "coditas", "research": "sjsu"}.get(it["slug"])
        mark = (f'<img class="xpg-logo" src="assets/logos/co/{logo}.png" alt="" width="44" height="44">' if logo
                else f'<span class="xpg-logo xpg-logo--txt" aria-hidden="true">{_esc(it["org"][0])}</span>')
        cards.append(f"""      <a class="xpg-card" href="{href}">
        {mark}
        <p class="xpg-date hand">{_esc(it["dates"])}</p>
        <h2 class="xpg-org">{_esc(it["org"])}</h2>
        <p class="xpg-role">{_esc(it["role"])}</p>
        <p class="xpg-one">{_esc(it["one"])}</p>
        <ul class="xpg-nums">{nums}</ul>
        <span class="xpg-go hand">open the full page →</span>
      </a>""")
    return f"""<section class="chapter" id="xp" aria-labelledby="xp-title">
  <header class="chapter-head page">
    <p class="chapter-kicker hand">2021 → now</p>
    <h1 id="xp-title" class="chapter-title">Experience</h1>
    <p class="chapter-lede">Each card opens one page that holds everything I did there: the systems, the sketches, the numbers.</p>
  </header>
  <div class="page"><div class="xpg-grid">
{chr(10).join(cards)}
  </div></div>
</section>"""

SHOWCASE = ["labelloop", "sentinel", "leo", "carbonshift", "blast", "transit", "multiplayer-agents", "query-engine", "iot-garden"]   # owner's order; the rest follow, films first
THUMB = {"sentinel": "assets/img/demos/sentinel.webp", "blast": "assets/img/demos/blast-radius.webp", "carbonshift": "assets/img/demos/carbonshift-demo.webp"}

def card_media(it):
    f, t = it.get("film"), _esc(it["title"])
    if isinstance(f, dict) and f.get("type") in ("yt", "loom"):
        attr = "data-yt" if f["type"] == "yt" else "data-loom"
        thumb = THUMB.get(it["slug"], "assets/img/demos/leo.webp")
        return (f'<button class="video" type="button" {attr}="{f["id"]}" data-title="{t} demo" aria-label="Play the {t} demo">'
                f'<img src="{thumb}" alt="" loading="lazy" width="1280" height="720"><span class="video-label">Watch the demo</span></button>')
    if isinstance(f, str):
        base = "assets/video/" + f.split(":", 1)[1][:-4] if f.startswith("silent:") else f"assets/video/narrated/{f}"
        return (f'<video class="pg-video" controls preload="none" playsinline poster="{base}-poster.webp" width="1920" height="1080" aria-label="{t} film">'
                f'<source src="{base}.mp4" type="video/mp4"></video>')
    return ""

def projlib(items):
    rank = {s: i for i, s in enumerate(SHOWCASE)}
    withfilm = sorted([it for it in items if it.get("film")], key=lambda it: rank.get(it["slug"], 99))
    rest = [it for it in items if not it.get("film")]
    def card(it, big):
        href = f'project/{it["slug"]}.html'
        facts = "".join(f'<li><b>{_esc(x["k"])}</b> {_esc(x.get("v",""))}</li>' for x in it.get("facts", [])[:3])
        repo = f'<a class="btn" href="{it["repo"]}" target="_blank" rel="noopener">Code on GitHub</a>' if it.get("repo") else ""
        return f"""      <article class="pg-card{' pg-card--big' if big else ''}">
        {card_media(it) if big else ''}
        <p class="pg-where hand">{_esc(it.get("where",""))}</p>
        <h3 class="pg-title"><a href="{href}">{_esc(it["title"])}</a></h3>
        <p class="pg-sum">{_esc(it.get("summary",""))}</p>
        {f'<ul class="pg-facts">{facts}</ul>' if facts and big else ''}
        <div class="btn-row"><a class="btn blue" href="{href}">Read more</a>{f'<a class="btn" href="{href}#film2">Explainer film</a>' if it.get("film2") else ""}{repo}</div>
      </article>"""
    big = "\n".join(card(it, True) for it in withfilm)
    small = "\n".join(card(it, False) for it in rest)
    return f"""<section class="chapter" id="projlib" aria-labelledby="projlib-title">
  <header class="chapter-head page">
    <p class="chapter-kicker hand">hackathon wins, side projects, coursework</p>
    <h1 id="projlib-title" class="chapter-title">Hackathons and projects</h1>
    <p class="chapter-lede">Press play on any demo right here, or open a project for its full write-up, moving sketch and code.</p>
  </header>
  <div class="page">
    <div class="pg-grid pg-grid--big">
{big}
    </div>
    <h2 class="pg-more-t hand">more builds</h2>
    <div class="pg-grid pg-grid--small">
{small}
    </div>
  </div>
</section>"""

def more_builds():
    return (part("agents", [".ag-more"]) + "\n" + part("systems", [".sys-log-wrap", ".sys-cloud"]).replace(take(frag("systems"), "#p-carbonshift"), ""))

def build_pages(projects, works):
    special = {"@xp": lambda: xp_gallery(works), "@more": more_builds, "projlib": lambda: projlib(projects),
               "research": lambda: frag("research") + "\n" + part("robots", ["#p-so101"]),
               "skills": lambda: frag("skills") if (src / "sections" / "skills.html").exists() else ""}
    for file, parts, title, desc, key in PAGES:
        body = "\n".join(special[p]() if p in special else frag(p) for p in parts)
        OUT[file] = shell(body, title, desc, f"{ROOT}/{'' if file == 'index.html' else file}", key)
    for old, new in REDIRECTS.items():
        OUT[old] = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Moved</title>'
                    f'<link rel="canonical" href="{ROOT}/{new}"><meta http-equiv="refresh" content="0; url={new}">'
                    f'<meta name="robots" content="noindex"></head><body><p>This page moved to <a href="{new}">{new}</a>.</p></body></html>')

# ---------- links ----------
ATTR = re.compile(r'\b(href|src|poster)="([^"]*)"')
def is_rel(u): return u and not re.match(r"^(https?:|mailto:|tel:|data:|#|/|\.\./|javascript:)", u)

def fix_links():
    """Point every in-site link at the page where its target id actually lives now."""
    home = {}
    for path, h in OUT.items():
        if path in REDIRECTS: continue
        for i in re.findall(r'\bid="([^"]+)"', h): home.setdefault(i, path)
    for path, h in OUT.items():
        if path in REDIRECTS: continue
        ids = set(re.findall(r'\bid="([^"]+)"', h))
        def sub(m):
            attr, u = m.group(1), m.group(2)
            if attr != "href": return m.group(0)
            if u.startswith("#"):
                i = u[1:]
                if i and i not in ids and i in home: return f'href="{home[i]}#{i}"'
                if i and i not in ids: return f'href="{SECTION_HOME.get(i, "index.html")}"'
                return m.group(0)
            if not is_rel(u): return m.group(0)
            page, _, i = u.partition("#")
            if i and i in home: return f'href="{home[i]}#{i}"' if home[i] != path else f'href="#{i}"'
            if page in REDIRECTS: return f'href="{REDIRECTS[page]}"'
            return f'href="{page}"' if i else m.group(0)
        OUT[path] = ATTR.sub(sub, h)

SECTION_HOME = {"av": "work/zoox.html", "ai": "projects.html", "agents": "projects.html", "automation": "projects.html", "security": "projects.html",
                "data": "projects.html", "systems": "projects.html", "robots": "projects.html", "demos": "projects.html", "films": "projects.html",
                "gallery": "media.html", "resume": "contact.html", "path": "index.html", "top": "index.html", "recognition": "media.html"}

def write_all():
    for path, h in OUT.items():
        depth = path.count("/")
        if depth:
            h = ATTR.sub(lambda m: f'{m.group(1)}="{"../" * depth}{m.group(2)}"' if is_rel(m.group(2)) else m.group(0), h)
            h = re.sub(r'srcset="([^"]+)"', lambda m: 'srcset="' + ", ".join(("../" * depth + x.strip()) if is_rel(x.strip()) else x.strip() for x in m.group(1).split(",")) + '"', h)
            if path in REDIRECTS: h = re.sub(r'url=([^"]+)"', lambda m: f'url={"../" * depth}{m.group(1)}"', h)
        p = R / path; p.parent.mkdir(exist_ok=True); p.write_text(h)
    # remove stale generated pages
    for d in ("project", "work"):
        for f in (R / d).glob("*.html"):
            if f"{d}/{f.name}" not in OUT: f.unlink()

def check_links():
    bad = []
    for path, h in OUT.items():
        base = (R / path).parent
        for attr, u in ATTR.findall((R / path).read_text()):
            if not (is_rel(u) or u.startswith("../")): continue
            page, _, i = u.partition("#")
            t = (base / page).resolve()
            if not t.exists(): bad.append(f"{path}: {u} (missing file)")
            elif i and t.suffix == ".html" and f'id="{i}"' not in t.read_text(): bad.append(f"{path}: {u} (missing id)")
    return bad

def main():
    js = sorted((src / "js").glob("*.js"))
    bad = [p.name for p in js if subprocess.run(["node", "--check", str(p)], capture_output=True).returncode]
    if bad: sys.exit(f"syntax error in: {', '.join(bad)}")
    projects, works = build_projects(), build_works()
    build_pages(projects, works)
    fix_links(); write_all()
    (R / "assets/site.css").write_text("\n".join(f"/* {p.name} */\n{p.read_text()}" for p in sorted((src / "css").glob("*.css"))))
    (R / "assets/site.js").write_text("\n".join(
        f"/* {p.name} */\ntry {{\n{p.read_text()}\n}} catch (e) {{ console.error('[{p.name}]', e); }}" for p in js))
    broken = check_links()
    print(f"built {len(OUT)} pages ({len(projects)} projects)")
    if broken: print("BROKEN LINKS:\n  " + "\n  ".join(sorted(set(broken))[:60])); sys.exit(1)

if __name__ == "__main__":
    main()
