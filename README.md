# Latexifier

A fast, minimal, web-based LaTeX editor — a lighter take on Overleaf.

- **Three-pane workspace:** project file tree · source editor · live preview.
- **Real compiled PDF.** The backend runs `latexmk` and streams back an actual
  PDF, rendered in-browser with pdf.js. Pages are oversampled for crisp text;
  zoom with the on-screen controls or ⌘/Ctrl + scroll. Scroll position is
  preserved across recompiles, so live editing never jumps the view.
- **Direct visual editing.** Flip the right panel to "Visual editor" and edit
  the document *in place* — click any heading, paragraph, or equation and type.
  No edit boxes, no save buttons; changes autosave and recompile. Page
  formatting (preamble, environments) stays locked here; change it in the source
  pane.
- **Desmos-style equations (WYSIWYG).** Equations are live MathQuill fields —
  the same engine Desmos is built on. You edit the math itself, not its code:
  type `/` and you get a real fraction, `^` opens a superscript box, `(` grows
  to fit, and names like `sqrt`, `pi`, `theta`, `sum` convert as you type.
- **Undo/redo everywhere.** ⌘/Ctrl+Z (and ⌘/Ctrl+Shift+Z / Ctrl+Y) work in both
  the source editor and the visual editor.

The `src/lib/mathInput.js` module also provides a text "simple math → LaTeX"
converter (`a/b → \frac{a}{b}`, auto-sizing parens, greek names, etc.) used as a
fallback when MathQuill isn't available.

## Storage — none (ephemeral by design)

There is no database and **nothing is saved**. The files under
`projects/sample-project/` are a read-only *template* used only to seed a new
session. All editing happens in the browser's memory; the compile endpoint is
**stateless** — the client sends the current file set, the server compiles it in
a throwaway temp dir, returns the PDF, and deletes the dir. Refresh the page and
you're back to the template. (A "demo · not saved" tag in the toolbar makes this
explicit.)

## Running

Requires Node 18+ and a TeX install (`latexmk` + `pdflatex` on PATH).

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run dev` runs Vite (`:5173`, proxies `/api`)
and the stateless compile server (`:3019`).

## Deploying (Vercel frontend + TeX backend container)

Vercel can't run TeX, so compilation lives in a container that has it:

1. **Backend** — deploy the `Dockerfile` (Node + TeX + latexmk) to a container
   host (Render / Railway / Fly.io). A `render.yaml` blueprint is included.
   Note the resulting URL, e.g. `https://latexifier-api.onrender.com`.
   Optionally set `ALLOW_ORIGIN` to your frontend URL to lock down CORS.
2. **Frontend** — import the repo into Vercel (it auto-detects Vite via
   `vercel.json`). Set the env var `VITE_API_BASE` to the backend URL from
   step 1, and deploy.

The backend writes nothing persistent, so it scales/restarts freely. Override
the local backend port with `PORT=xxxx` if `3019` is taken.

## Layout

```
server/index.js        Express API: template reads + stateless latexmk compile
src/
  App.jsx              app shell, in-memory files, debounced auto-compile, undo/redo
  components/
    Sidebar.jsx        file tree
    Editor.jsx         CodeMirror 6 source editor (LaTeX highlighting)
    PdfPreview.jsx     pdf.js viewer: oversampled rendering, zoom, scroll retention
    VisualEditor.jsx   block-based inline visual editor (autosave)
    MathField.jsx      MathQuill WYSIWYG equation field (Desmos-style)
    EquationEditor.jsx standalone equation editor (Visual/LaTeX) — optional/reusable
    Katex.jsx          KaTeX rendering helpers
  lib/
    mathInput.js       simple-math -> LaTeX converter
    parseBlocks.js     splits a document into editable content blocks
projects/sample-project/   the demo account's files
```
