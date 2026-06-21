import { useEffect, useMemo, useRef } from 'react'
import { parseBlocks, renderBlock, segmentInline, renderInlineMath } from '../lib/parseBlocks'
import { Math } from './Katex'
import MathField, { mathquillReady } from './MathField'

// The instant, client-side visual editor. Content is edited DIRECTLY in the
// page -- click and type, no edit box, no save button. Paragraphs flow as a mix
// of editable text and inline WYSIWYG math fields; display equations are full
// MathQuill fields. Changes autosave through onChange (App debounces the actual
// write + recompile). Structural / formatting markup stays locked.
export default function VisualEditor({ source, onChange, syncNonce }) {
  const blocks = useMemo(() => parseBlocks(source), [source])
  const hasMQ = mathquillReady()

  // An edit "session" pins the splice target (base text + offsets) for the
  // duration of focus, so a burst of keystrokes always rewrites the same source
  // region regardless of intermediate re-parses. Keyed by an arbitrary id so
  // every block AND inline segment can have its own independent target.
  const session = useRef(null)
  const begin = (id, start, end) => { session.current = { id, base: source, start, end } }
  const end = () => { session.current = null }
  const commitRange = (id, start, end, replacement) => {
    let s = session.current
    if (!s || s.id !== id) { s = { id, base: source, start, end }; session.current = s }
    onChange(s.base.slice(0, s.start) + replacement + s.base.slice(s.end))
  }

  const insertEquation = () => {
    const marker = '\\end{document}'
    const at = source.indexOf(marker)
    const insertion = '\n\\[\n  x = y\n\\]\n\n'
    onChange(at === -1 ? source + insertion : source.slice(0, at) + insertion + source.slice(at))
  }

  const renderTextBlock = (b) => {
    const segs = segmentInline(b)
    return (
      <p className="vb vb-text" key={b.id}>
        {segs.map((seg, i) => {
          const id = `${b.id}:${i}`
          if (seg.kind === 'math') {
            return hasMQ ? (
              <MathField
                key={id}
                inline
                value={seg.value}
                syncNonce={syncNonce}
                onFocus={() => begin(id, seg.start, seg.end)}
                onBlur={end}
                onChange={(latex) => commitRange(id, seg.start, seg.end, renderInlineMath(seg, latex))}
              />
            ) : (
              <Math key={id} tex={seg.value} />
            )
          }
          return (
            <InlineText
              key={id}
              inline
              className="vb-seg-text"
              value={seg.value}
              syncNonce={syncNonce}
              onFocus={() => begin(id, seg.start, seg.end)}
              onBlur={end}
              onInput={(v) => commitRange(id, seg.start, seg.end, v)}
            />
          )
        })}
      </p>
    )
  }

  return (
    <div className="visual">
      <div className="visual-doc">
        {blocks.length === 0 && <p className="visual-empty">No editable content found in the document body.</p>}
        {blocks.map((b) => {
          switch (b.type) {
            case 'heading':
              return (
                <InlineText
                  key={b.id}
                  className={`vb vb-heading vb-${b.level}`}
                  value={b.title}
                  syncNonce={syncNonce}
                  onFocus={() => begin(b.id, b.start, b.end)}
                  onBlur={end}
                  onInput={(v) => commitRange(b.id, b.start, b.end, renderBlock(b, v))}
                />
              )
            case 'text':
              return renderTextBlock(b)
            case 'math':
              return (
                <div className="vb vb-math" key={b.id}>
                  {hasMQ ? (
                    <MathField
                      value={b.tex}
                      syncNonce={syncNonce}
                      onFocus={() => begin(b.id, b.start, b.end)}
                      onBlur={end}
                      onChange={(latex) => commitRange(b.id, b.start, b.end, renderBlock(b, latex))}
                    />
                  ) : (
                    <Math tex={b.tex} display />
                  )}
                </div>
              )
            case 'locked':
              return (
                <pre className="vb vb-locked" key={b.id} title="Formatting / structure — edit in the source pane">
                  {b.raw}
                </pre>
              )
            default:
              return null
          }
        })}
      </div>
      <div className="visual-foot">
        <button onClick={insertEquation}>+ Insert equation</button>
        <span className="visual-foot-note">Click any text or equation to edit it · changes autosave · ⌘/Ctrl+Z to undo</span>
      </div>
    </div>
  )
}

// A contentEditable region edited in place. It is uncontrolled (we write its
// DOM imperatively) so typing never resets the caret; React only re-syncs the
// text when the value changes from outside and the element isn't focused, or
// when forced by an undo/redo (syncNonce).
function InlineText({ className, value, onInput, onFocus, onBlur, syncNonce, inline = false }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) ref.current.textContent = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value
  }, [value])

  useEffect(() => {
    if (syncNonce === undefined) return
    const el = ref.current
    if (el && el.textContent !== value) el.textContent = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncNonce])

  const Tag = inline ? 'span' : 'div'
  return (
    <Tag
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={(e) => onInput(e.currentTarget.textContent)}
    />
  )
}
