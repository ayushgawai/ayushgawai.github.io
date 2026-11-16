#!/usr/bin/env python3
"""Tiny build: inline section fragments, concat CSS/JS. Output: index.html, assets/site.css, assets/site.js
Each JS file is syntax-checked (node --check) and wrapped in try/catch, so one section's bug can't stop the scripts after it."""
import pathlib, re, subprocess, sys
R = pathlib.Path(__file__).parent
src = R / "src"
def include(m):
    p = src / m.group(1).strip()
    return include_all(p.read_text()) if p.exists() else f"<!-- missing {m.group(1)} -->"
def include_all(t): return re.sub(r"<!--\s*@include\s+(.+?)\s*-->", include, t)

js = sorted((src / "js").glob("*.js"))
bad = [p.name for p in js if subprocess.run(["node", "--check", str(p)], capture_output=True).returncode]
if bad: sys.exit(f"syntax error in: {', '.join(bad)} (run: node --check src/js/<file>)")

(R / "index.html").write_text(include_all((src / "index.html").read_text()))
(R / "assets/site.css").write_text("\n".join(f"/* {p.name} */\n{p.read_text()}" for p in sorted((src / "css").glob("*.css"))))
(R / "assets/site.js").write_text("\n".join(
    f"/* {p.name} */\ntry {{\n{p.read_text()}\n}} catch (e) {{ console.error('[{p.name}]', e); }}" for p in js))
print("built")
