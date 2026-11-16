# Ayush Gawai: field notebook

Personal portfolio, drawn as an engineering notebook: graph paper, hand-inked SVG sketches that explain the work, and a cover mobile of tool tags that sways when your cursor moves through it.

**Live:** https://ayushgawai.github.io/

## Layout

```
src/index.html        page skeleton, shared SVG filters, nav tabs
src/sections/*.html   one fragment per chapter (included at build time)
src/css/*.css         00-base.css = design tokens; NN-<section>.css per chapter
src/js/*.js           00-core.js = shared helpers (window.NB); NN-<section>.js per chapter
assets/               built site.css / site.js, images, logos, résumé PDFs
build.py              inlines fragments, concatenates CSS/JS → index.html + assets/site.*
```

No framework and no npm install. Static HTML, CSS and a little vanilla JS.

## Edit and preview

```bash
python3 build.py              # regenerate index.html and assets/site.{css,js}
python3 -m http.server 8000   # open http://localhost:8000
```

Edit files under `src/`, never the generated `index.html` or `assets/site.*`.

## Swapping in photos

Gallery placeholders are marked with `data-placeholder="<name>"` in `src/sections/gallery.html` (and one in `robots.html`). Drop a webp at `assets/img/gallery/<name>.webp`, update the figure as the comment next to it explains, then rebuild.

## Deploy

GitHub Pages serves the repo root of [`ayushgawai/ayushgawai.github.io`](https://github.com/ayushgawai/ayushgawai.github.io) (`main`). Build, commit, then push `main` to that remote.
