// Desmos / AsciiMath-style "simple math" -> LaTeX converter.
//
// Goals: let people type the obvious thing and get good LaTeX out.
//   a/b            -> \frac{a}{b}
//   (a+b)/(c+d)    -> \frac{a+b}{c+d}
//   x^2, x_i       -> x^{2}, x_{i}
//   sqrt(x), root  -> \sqrt{x}
//   sin x, log     -> \sin x, \log
//   alpha, theta   -> \alpha, \theta
//   <=, >=, !=, -> -> \leq, \geq, \neq, \to
//   +-             -> \pm,   *  -> \cdot,   inf -> \infty
// Parentheses auto-size with \left ... \right when the content is "tall".

const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
  'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi',
  'varpi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi',
  'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma',
  'Upsilon', 'Phi', 'Psi', 'Omega',
])

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh',
  'arcsin', 'arccos', 'arctan', 'log', 'ln', 'exp', 'lim', 'max', 'min',
  'det', 'gcd', 'deg', 'dim', 'ker',
])

// Multi-character operators, longest first.
const SYMBOLS = [
  ['<=', '\\leq'], ['>=', '\\geq'], ['!=', '\\neq'], ['==', '='],
  ['->', '\\to'], ['=>', '\\Rightarrow'], ['+-', '\\pm'], ['-+', '\\mp'],
  ['...', '\\dots'], ['~=', '\\approx'],
]

const WORD_SYMBOLS = {
  inf: '\\infty', infinity: '\\infty', infty: '\\infty',
  pm: '\\pm', mp: '\\mp', times: '\\times', cdot: '\\cdot', div: '\\div',
  deg: '\\deg', degree: '^\\circ', cdots: '\\cdots', dots: '\\dots',
  leq: '\\leq', geq: '\\geq', neq: '\\neq', approx: '\\approx',
  to: '\\to', mapsto: '\\mapsto', forall: '\\forall', exists: '\\exists',
  in: '\\in', notin: '\\notin', subset: '\\subset', cup: '\\cup',
  cap: '\\cap', emptyset: '\\emptyset', nabla: '\\nabla', partial: '\\partial',
}

// "Big" operators that take optional _ / ^ limits.
const BIGOPS = { sum: '\\sum', prod: '\\prod', int: '\\int', oint: '\\oint', lim: '\\lim' }

function tokenize(src) {
  const tokens = []
  let i = 0
  const isDigit = (c) => c >= '0' && c <= '9'
  const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
  outer: while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue }
    for (const [sym, tex] of SYMBOLS) {
      if (src.startsWith(sym, i)) { tokens.push({ t: 'op', v: tex }); i += sym.length; continue outer }
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i + 1
      while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j++
      tokens.push({ t: 'num', v: src.slice(i, j) }); i = j; continue
    }
    if (isAlpha(c)) {
      let j = i + 1
      while (j < src.length && isAlpha(src[j])) j++
      tokens.push({ t: 'word', v: src.slice(i, j) }); i = j; continue
    }
    if ('+-=<>'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue }
    if (c === '*') { tokens.push({ t: 'op', v: '\\cdot' }); i++; continue }
    if ('()[]{}|,!^_/'.includes(c)) { tokens.push({ t: 'punc', v: c }); i++; continue }
    // pass anything else (e.g. & . ;) straight through
    tokens.push({ t: 'op', v: c }); i++
  }
  return tokens
}

// Does a chunk of LaTeX render "tall" enough to want stretchy delimiters?
function isTall(tex) {
  return /\\frac|\\sqrt|\\sum|\\prod|\\int|\\binom|\\left|\^\{[^}]{2,}|_\{[^}]{2,}/.test(tex)
}

// Remove one layer of parentheses that wraps an entire expression, so things
// like (a+b)/(c+d) become \frac{a+b}{c+d} rather than \frac{(a+b)}{(c+d)}.
function stripOuterParens(s) {
  s = s.trim()
  let openLen
  if (s.startsWith('\\left(')) openLen = 6
  else if (s.startsWith('(')) openLen = 1
  else return s
  let depth = 0, i = 0, endIdx = -1, closeLen = 0
  while (i < s.length) {
    if (s.startsWith('\\left(', i)) { depth++; i += 6; continue }
    if (s.startsWith('\\right)', i)) { depth--; i += 7; if (depth === 0) { endIdx = i; closeLen = 7; break } continue }
    if (s[i] === '(') { depth++; i++; continue }
    if (s[i] === ')') { depth--; i++; if (depth === 0) { endIdx = i; closeLen = 1; break } continue }
    i++
  }
  return endIdx === s.length ? s.slice(openLen, endIdx - closeLen).trim() : s
}

function parse(tokens) {
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  // An atom: a single base (number, symbol, function, group) with NO trailing
  // ^ / _ postfixes -- so x^2^3 and \sum_a^b attach to the right base.
  function parseAtom() {
    const tk = peek()
    if (!tk) return ''
    if (tk.t === 'num') { next(); return tk.v }
    if (tk.t === 'word') {
      next()
      const w = tk.v
      if (w === 'sqrt') return `\\sqrt{${grabArg()}}`
      if (BIGOPS[w]) return BIGOPS[w] // limits handled by postfix ^ _
      if (FUNCS.has(w)) {
        let base = `\\${w}`
        if (startsFactor(peek())) base += ` ${parseFactor()}`
        return base
      }
      if (GREEK.has(w)) return `\\${w}`
      if (WORD_SYMBOLS[w]) return WORD_SYMBOLS[w]
      if (w.length === 1) return w
      return w.split('').join(' ') // multi-letter -> implicit product
    }
    if (tk.t === 'punc' && tk.v === '(') {
      next()
      const inner = parseSequence([')'])
      if (peek() && peek().v === ')') next()
      return isTall(inner) ? `\\left(${inner}\\right)` : `(${inner})`
    }
    if (tk.t === 'punc' && tk.v === '[') {
      next()
      const inner = parseSequence([']'])
      if (peek() && peek().v === ']') next()
      return isTall(inner) ? `\\left[${inner}\\right]` : `[${inner}]`
    }
    if (tk.t === 'punc' && tk.v === '{') {
      next()
      const inner = parseSequence(['}'])
      if (peek() && peek().v === '}') next()
      return `{${inner}}`
    }
    if (tk.t === 'punc' && tk.v === '|') {
      next()
      const inner = parseSequence(['|'])
      if (peek() && peek().v === '|') next()
      return `\\left|${inner}\\right|`
    }
    next() // operator or stray punctuation
    return tk.v
  }

  // A factor: an atom plus any trailing ^ / _ / ! postfixes.
  function parseFactor() {
    let base = parseAtom()
    while (peek()) {
      const p = peek()
      if (p.t === 'punc' && (p.v === '^' || p.v === '_')) {
        next()
        base += `${p.v}{${grabArg()}}`
      } else if (p.t === 'punc' && p.v === '!') {
        next(); base += '!'
      } else break
    }
    return base
  }

  // The operand of ^, _, sqrt: a single atom, with wrapping parens removed.
  function grabArg() {
    return stripOuterParens(parseAtom())
  }

  function startsFactor(tk) {
    if (!tk) return false
    if (tk.t === 'num' || tk.t === 'word') return true
    // Note: '|' is intentionally excluded -- it's ambiguous (open vs close),
    // so absolute values are picked up at the sequence level instead, which
    // lets the closing bar terminate the group correctly.
    if (tk.t === 'punc' && '([{'.includes(tk.v)) return true
    return false
  }

  // A term: factors joined by implicit/explicit multiplication, where '/'
  // turns the product-so-far into the numerator of a fraction.
  function parseTerm() {
    let acc = parseFactor()
    while (peek()) {
      const p = peek()
      if (p.t === 'punc' && p.v === '/') {
        next()
        const den = parseFactor()
        acc = `\\frac{${stripOuterParens(acc)}}{${stripOuterParens(den)}}`
      } else if (p.t === 'op' && p.v === '\\cdot') {
        next()
        acc += ` \\cdot ${parseFactor()}`
      } else if (startsFactor(p)) {
        acc += ` ${parseFactor()}`
      } else break
    }
    return acc
  }

  // A sequence: terms joined by +, -, relations, etc., until a stop token.
  function parseSequence(stops) {
    const parts = []
    while (peek()) {
      const p = peek()
      if (p.t === 'punc' && stops.includes(p.v)) break
      if (p.t === 'op') { parts.push(p.v); next(); continue }
      // Stray closing punctuation passes through; '|' is handled as a factor
      // (absolute value) so it isn't swallowed here.
      if (p.t === 'punc' && ')]},'.includes(p.v)) { parts.push(p.v); next(); continue }
      parts.push(parseTerm())
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  }

  return parseSequence([])
}

export function simpleToLatex(src) {
  if (!src || !src.trim()) return ''
  try {
    return parse(tokenize(src))
  } catch {
    return src // never throw at the user; fall back to raw input
  }
}
