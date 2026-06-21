import { useState } from 'react'
import { Math } from './Katex'
import MathField, { mathquillReady } from './MathField'

// Equation editor. "Visual" mode is a direct, Desmos-style WYSIWYG math field
// (MathQuill): you edit the equation itself, not its code. "LaTeX" mode exposes
// the raw source. Either way, onSave receives the final LaTeX.
export default function EquationEditor({ initialTex = '', onSave, onCancel }) {
  const hasMQ = mathquillReady()
  const [mode, setMode] = useState(hasMQ ? 'visual' : 'latex')
  const [latex, setLatex] = useState(initialTex)

  return (
    <div className="eq-editor" onClick={(e) => e.stopPropagation()}>
      <div className="eq-modes">
        {hasMQ && (
          <button className={mode === 'visual' ? 'on' : ''} onClick={() => setMode('visual')}>Visual</button>
        )}
        <button className={mode === 'latex' ? 'on' : ''} onClick={() => setMode('latex')}>LaTeX</button>
        <span className="eq-hint">
          {mode === 'visual'
            ? 'type math directly:  /  → fraction,  ^  _  ,  sqrt,  pi,  ( ) auto-grow'
            : 'raw LaTeX'}
        </span>
      </div>

      {mode === 'visual' ? (
        <div className="eq-mathfield">
          <MathField initialLatex={latex} onChange={setLatex} autoFocus />
        </div>
      ) : (
        <>
          <textarea
            className="eq-input"
            autoFocus
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
          />
          <div className="eq-preview">
            <Math tex={latex} display />
          </div>
        </>
      )}

      <div className="eq-actions">
        <button className="primary" onClick={() => onSave(latex)}>Save</button>
        <button onClick={onCancel}>Cancel</button>
        {mode === 'visual' && <code className="eq-latex-out">{latex || '\\;'}</code>}
      </div>
    </div>
  )
}
