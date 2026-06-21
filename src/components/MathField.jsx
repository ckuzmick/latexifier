import { useEffect, useRef } from 'react'

// A direct, Desmos-style WYSIWYG math field powered by MathQuill (loaded from
// the CDN in index.html). You type "/" and get a real fraction, "^" gives a
// superscript box, "(" auto-grows, and names like sqrt / pi / theta convert as
// you type. Edits are reported live through onChange (full LaTeX each time).
//
// autoCommands  -> typing these names becomes \name (symbols, radicals, sums…)
// autoOperatorNames -> upright function names (sin, cos, log…) like Desmos
const AUTO_COMMANDS = [
  'sqrt', 'cbrt', 'sum', 'prod', 'int', 'infty', 'infinity',
  'pi', 'theta', 'phi', 'varphi', 'alpha', 'beta', 'gamma', 'delta',
  'epsilon', 'varepsilon', 'zeta', 'eta', 'iota', 'kappa', 'lambda', 'mu',
  'nu', 'xi', 'rho', 'sigma', 'tau', 'upsilon', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
  'pm', 'mp', 'times', 'cdot', 'div', 'leq', 'geq', 'neq', 'approx', 'to',
  'partial', 'nabla', 'forall', 'exists', 'in', 'cup', 'cap',
].join(' ')

const AUTO_OPERATORS = 'sin cos tan cot sec csc sinh cosh tanh arcsin arccos arctan log ln exp lim max min det gcd deg dim'

export default function MathField({ value = '', onChange, onFocus, onBlur, autoFocus = false, syncNonce, inline = false }) {
  const host = useRef(null)
  const field = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const setting = useRef(false) // true while we write latex programmatically

  // Write latex without re-emitting it through onChange (avoids feedback loops).
  const setSilently = (f, v) => {
    setting.current = true
    f.latex(v)
    setting.current = false
  }

  // Create the MathQuill field once.
  useEffect(() => {
    const MQ = window.MathQuill && window.MathQuill.getInterface(2)
    if (!MQ || !host.current) return
    const f = MQ.MathField(host.current, {
      spaceBehavesLikeTab: true,
      autoCommands: AUTO_COMMANDS,
      autoOperatorNames: AUTO_OPERATORS,
      restrictMismatchedBrackets: true,
      handlers: {
        edit: () => { if (!setting.current) onChangeRef.current && onChangeRef.current(f.latex()) },
      },
    })
    setSilently(f, value)
    field.current = f
    if (autoFocus) {
      f.focus()
      f.moveToRightEnd && f.moveToRightEnd()
    }
    return () => { field.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Passive sync: adopt external changes only while NOT focused (so typing is
  // never clobbered).
  useEffect(() => {
    const f = field.current
    if (f && host.current && !host.current.classList.contains('mq-focused') && f.latex() !== value) {
      setSilently(f, value)
    }
  }, [value])

  // Forced sync (undo / redo): adopt the new value even if focused.
  useEffect(() => {
    if (syncNonce === undefined) return
    const f = field.current
    if (f && f.latex() !== value) setSilently(f, value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncNonce])

  return (
    <span
      className={inline ? 'mathquill-field mathquill-inline' : 'mathquill-field'}
      ref={host}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  )
}

// Is the MathQuill engine available yet? (CDN script in index.html.)
export function mathquillReady() {
  return typeof window !== 'undefined' && !!window.MathQuill
}
