import { useMemo } from 'react'
import katex from 'katex'

// Render a single LaTeX math string to HTML with KaTeX. Errors render inline
// in red rather than throwing, so a half-typed equation never blanks the UI.
export function Math({ tex, display = false }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex || '', {
        displayMode: display,
        throwOnError: false,
        errorColor: '#c0392b',
      })
    } catch (e) {
      return `<span style="color:#c0392b">${String(e.message)}</span>`
    }
  }, [tex, display])
  return <span className={display ? 'kx-display' : 'kx-inline'} dangerouslySetInnerHTML={{ __html: html }} />
}

// Render a paragraph of LaTeX-ish text, typesetting any inline $...$ spans and
// showing the rest as plain text (with a few common commands softened).
export function RichText({ text }) {
  const parts = useMemo(() => splitInlineMath(text), [text])
  return (
    <>
      {parts.map((p, i) =>
        p.math ? <Math key={i} tex={p.value} /> : <span key={i}>{softenText(p.value)}</span>
      )}
    </>
  )
}

function splitInlineMath(text) {
  const out = []
  const re = /\$([^$]+)\$/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ math: false, value: text.slice(last, m.index) })
    out.push({ math: true, value: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ math: false, value: text.slice(last) })
  return out
}

// Lightly de-LaTeX plain text for display (bold/italic/escapes). The source
// stays authoritative; this is only the preview rendering.
function softenText(s) {
  return s
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\textit\{([^}]*)\}/g, '$1')
    .replace(/\\emph\{([^}]*)\}/g, '$1')
    .replace(/~/g, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    .replace(/\\([%&#_$])/g, '$1')
}
