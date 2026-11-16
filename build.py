#!/usr/bin/env python3
"""Tiny build: inline section fragments, concat CSS/JS. Output: index.html, assets/site.css, assets/site.js"""
import pathlib, re
R = pathlib.Path(__file__).parent
src = R / "src"
def include(m):
    p = src / m.group(1).strip()
    return include_all(p.read_text()) if p.exists() else f"<!-- missing {m.group(1)} -->"
def include_all(t): return re.sub(r"<!--\s*@include\s+(.+?)\s*-->", include, t)
(R / "index.html").write_text(include_all((src / "index.html").read_text()))
(R / "assets/site.css").write_text("\n".join(f"/* {p.name} */\n{p.read_text()}" for p in sorted((src / "css").glob("*.css"))))
(R / "assets/site.js").write_text("\n".join(f"/* {p.name} */\n;{p.read_text()}" for p in sorted((src / "js").glob("*.js"))))
print("built")
