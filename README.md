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

## Storage

This demo has no database. The sample account's project lives on disk under
`projects/sample-project/`. Editing in the UI saves straight to those files;
compiles read them back. Build artifacts go in `projects/<project>/.build/`.

## Running

Requires Node 18+ and a TeX installation (`latexmk` + `pdflatex` on your PATH —
MacTeX / TeX Live both work).

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

`npm run dev` starts two processes:
- **web** — Vite dev server on `:5173` (proxies `/api` to the backend)
- **server** — Express API + LaTeX compiler on `:3019`

Override the backend port with `PORT=xxxx` if `3019` is taken.

## Layout

```
server/index.js        Express API: file CRUD + latexmk compile (sandboxed to projects/)
src/
  App.jsx              app shell, state, debounced auto-save + auto-compile
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
