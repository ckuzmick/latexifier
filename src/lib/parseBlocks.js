// Parse a LaTeX document into editable "blocks" for the visual editor.
//
// We only ever expose *content* blocks (paragraphs, headings, display
// equations). Everything structural -- the preamble, \begin{document},
// environments, list markup -- is preserved verbatim and never shown as
// editable, so page formatting can't be changed from the visual editor.
//
// Every block records absolute [start, end) offsets into the original source
// so an edit can be spliced straight back in.

const HEADING = /^(section|subsection|subsubsection|chapter|title|paragraph)$/

// One pass that finds the next "interesting" construct after a cursor.
const SPECIAL = new RegExp(
  [
    '\\\\\\[([\\s\\S]*?)\\\\\\]', // \[ ... \]
    '\\$\\$([\\s\\S]*?)\\$\\$', // $$ ... $$
    '\\\\begin\\{(equation\\*?|align\\*?|gather\\*?|multline\\*?)\\}([\\s\\S]*?)\\\\end\\{\\3\\}',
    '\\\\(section|subsection|subsubsection|chapter|title|paragraph)\\*?\\{([\\s\\S]*?)\\}',
  ].join('|'),
  'g'
)

let uid = 0
const nextId = () => `b${uid++}`

// Split a run of body text (offset = its absolute start) into paragraph /
// locked blocks separated by blank lines.
function splitText(text, offset) {
  const blocks = []
  const re = /\n[ \t]*\n/g // blank line(s)
  let last = 0
  let m
  const pushChunk = (chunk, start) => {
    if (!chunk.trim()) return
    const lead = chunk.length - chunk.trimStart().length
    const realStart = start + lead
    const trimmed = chunk.trim()
    // A chunk that is purely structural markup stays locked.
    const structural = /^\\(maketitle|tableofcontents|newpage|clearpage|begin|end|item|hrule|vspace|hspace|usepackage|documentclass)/.test(
      trimmed
    )
    blocks.push({
      id: nextId(),
      type: structural ? 'locked' : 'text',
      start: realStart,
      end: realStart + trimmed.length,
      raw: trimmed,
    })
  }
  while ((m = re.exec(text))) {
    pushChunk(text.slice(last, m.index), offset + last)
    last = m.index + m[0].length
  }
  pushChunk(text.slice(last), offset + last)
  return blocks
}

export function parseBlocks(source) {
  uid = 0
  // Restrict to the document body when present.
  const begin = source.indexOf('\\begin{document}')
  const end = source.indexOf('\\end{document}')
  const bodyStart = begin === -1 ? 0 : begin + '\\begin{document}'.length
  const bodyEnd = end === -1 ? source.length : end
  const body = source.slice(bodyStart, bodyEnd)

  const blocks = []
  SPECIAL.lastIndex = 0
  let cursor = 0
  let m
  while ((m = SPECIAL.exec(body))) {
    if (m.index > cursor) {
      blocks.push(...splitText(body.slice(cursor, m.index), bodyStart + cursor))
    }
    const abs = bodyStart + m.index
    const full = m[0]
    if (m[1] !== undefined) {
      blocks.push({ id: nextId(), type: 'math', wrap: 'bracket', tex: m[1].trim(), start: abs, end: abs + full.length })
    } else if (m[2] !== undefined) {
      blocks.push({ id: nextId(), type: 'math', wrap: 'dollar', tex: m[2].trim(), start: abs, end: abs + full.length })
    } else if (m[3] !== undefined) {
      blocks.push({ id: nextId(), type: 'math', wrap: 'env', env: m[3], tex: m[4].trim(), start: abs, end: abs + full.length })
    } else if (m[5] !== undefined) {
      const level = m[5]
      blocks.push({
        id: nextId(),
        type: HEADING.test(level) ? 'heading' : 'text',
        level,
        starred: full.includes('*{') || /\\\w+\*\{/.test(full),
        title: m[6],
        start: abs,
        end: abs + full.length,
      })
    }
    cursor = m.index + full.length
  }
  if (cursor < body.length) {
    blocks.push(...splitText(body.slice(cursor), bodyStart + cursor))
  }
  return blocks
}

// Split a text block into a flowing sequence of inline segments: literal text
// runs and inline-math runs ($...$ or \(...\)). Each segment records absolute
// [start, end) offsets so it can be edited independently. Used to make inline
// math directly editable in the visual editor.
export function segmentInline(block) {
  const raw = block.raw || ''
  const offset = block.start
  const re = /\$([^$]+)\$|\\\(([\s\S]*?)\\\)/g
  const segs = []
  let last = 0
  let m
  while ((m = re.exec(raw))) {
    if (m.index > last) {
      segs.push({ kind: 'text', value: raw.slice(last, m.index), start: offset + last, end: offset + m.index })
    }
    const isDollar = m[1] !== undefined
    segs.push({
      kind: 'math',
      wrap: isDollar ? 'dollar' : 'paren',
      value: (isDollar ? m[1] : m[2]).trim(),
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    })
    last = m.index + m[0].length
  }
  if (last < raw.length) {
    segs.push({ kind: 'text', value: raw.slice(last), start: offset + last, end: offset + raw.length })
  }
  if (segs.length === 0) segs.push({ kind: 'text', value: '', start: offset, end: offset + raw.length })
  return segs
}

// Wrap inline-math latex back in its original delimiters.
export function renderInlineMath(seg, latex) {
  return seg.wrap === 'paren' ? `\\(${latex}\\)` : `$${latex}$`
}

// Rebuild the source text for a single edited block.
export function renderBlock(block, value) {
  switch (block.type) {
    case 'text':
      return value
    case 'heading': {
      const star = block.starred ? '*' : ''
      return `\\${block.level}${star}{${value}}`
    }
    case 'math': {
      if (block.wrap === 'bracket') return `\\[\n  ${value}\n\\]`
      if (block.wrap === 'dollar') return `$$${value}$$`
      if (block.wrap === 'env') return `\\begin{${block.env}}\n  ${value}\n\\end{${block.env}}`
      return value
    }
    default:
      return value
  }
}

// Apply an edit to one block, returning the new full document string.
export function applyBlockEdit(source, block, value) {
  const replacement = renderBlock(block, value)
  return source.slice(0, block.start) + replacement + source.slice(block.end)
}
