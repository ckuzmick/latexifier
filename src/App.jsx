import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import PdfPreview from './components/PdfPreview'
import VisualEditor from './components/VisualEditor'
import { listFiles, readFile, writeFile, compile } from './api'

export default function App() {
  const [files, setFiles] = useState([])
  const [active, setActive] = useState(null)
  const [contents, setContents] = useState({}) // path -> text
  const [dirty, setDirty] = useState(new Set())

  const [pdf, setPdf] = useState(null)
  const [log, setLog] = useState('')
  const [ok, setOk] = useState(true)
  const [compiling, setCompiling] = useState(false)
  const [showLog, setShowLog] = useState(false)

  const [rightMode, setRightMode] = useState('pdf') // 'pdf' | 'visual'
  const [autocompile, setAutocompile] = useState(true)
  const [syncNonce, setSyncNonce] = useState(0) // bump to force editors to adopt source (undo/redo)

  const contentsRef = useRef(contents)
  contentsRef.current = contents
  const activeRef = useRef(active)
  activeRef.current = active
  const autoRef = useRef(autocompile)
  autoRef.current = autocompile
  const saveTimer = useRef(null)

  // ---- undo / redo history (per file) ----
  const histories = useRef({}) // path -> { past: [], future: [] }
  const histTimer = useRef(null)
  const pending = useRef(null) // { path, value } — state before the current edit burst
  const histFor = (p) => histories.current[p] || (histories.current[p] = { past: [], future: [] })

  const commitPending = useCallback(() => {
    clearTimeout(histTimer.current)
    const pb = pending.current
    pending.current = null
    if (!pb) return
    const h = histFor(pb.path)
    if (h.past[h.past.length - 1] !== pb.value) {
      h.past.push(pb.value)
      if (h.past.length > 300) h.past.shift()
    }
    h.future = []
  }, [])

  // Coalesce a burst of keystrokes into a single undo step (snapshot the state
  // from just before the burst).
  const recordHistory = useCallback((path, prevValue) => {
    if (pending.current === null) pending.current = { path, value: prevValue }
    clearTimeout(histTimer.current)
    histTimer.current = setTimeout(commitPending, 500)
  }, [commitPending])

  // ---- load project ----
  useEffect(() => {
    ;(async () => {
      const list = await listFiles()
      setFiles(list)
      const first = list.includes('main.tex') ? 'main.tex' : list[0]
      if (first) {
        const text = await readFile(first)
        setContents({ [first]: text })
        setActive(first)
      }
    })().catch((e) => setLog(String(e)))
  }, [])

  const openFile = useCallback(async (path) => {
    if (contentsRef.current[path] === undefined) {
      const text = await readFile(path)
      setContents((c) => ({ ...c, [path]: text }))
    }
    setActive(path)
  }, [])

  // ---- compile ----
  const doCompile = useCallback(async () => {
    const a = activeRef.current
    if (!a) return
    setCompiling(true)
    const cur = contentsRef.current[a] || ''
    const root = cur.includes('\\documentclass') ? a : 'main.tex'
    try {
      const res = await compile(root)
      setPdf((prev) => res.pdf || prev)
      setLog(res.log || '')
      setOk(!!res.ok)
      if (!res.ok) setShowLog(true)
    } catch (e) {
      setLog(String(e))
      setOk(false)
    } finally {
      setCompiling(false)
    }
  }, [])

  const flush = useCallback(async (path) => {
    await writeFile(path, contentsRef.current[path])
    setDirty((d) => { const n = new Set(d); n.delete(path); return n })
  }, [])

  // First compile once a file is loaded.
  useEffect(() => {
    if (active && pdf === null) doCompile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // ---- editing (shared by source + visual editors) ----
  const queueSave = useCallback((a) => {
    setDirty((d) => new Set(d).add(a))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await flush(a)
      if (autoRef.current) doCompile()
    }, 700)
  }, [doCompile, flush])

  const onEdit = useCallback((text) => {
    const a = activeRef.current
    if (!a) return
    recordHistory(a, contentsRef.current[a] ?? '')
    setContents((c) => ({ ...c, [a]: text }))
    queueSave(a)
  }, [queueSave, recordHistory])

  const undo = useCallback(() => {
    const a = activeRef.current
    if (!a) return
    commitPending()
    const h = histFor(a)
    if (!h.past.length) return
    h.future.push(contentsRef.current[a] ?? '')
    const prev = h.past.pop()
    setContents((c) => ({ ...c, [a]: prev }))
    setSyncNonce((n) => n + 1)
    queueSave(a)
  }, [commitPending, queueSave])

  const redo = useCallback(() => {
    const a = activeRef.current
    if (!a) return
    commitPending()
    const h = histFor(a)
    if (!h.future.length) return
    h.past.push(contentsRef.current[a] ?? '')
    const nxt = h.future.pop()
    setContents((c) => ({ ...c, [a]: nxt }))
    setSyncNonce((n) => n + 1)
    queueSave(a)
  }, [commitPending, queueSave])

  const compileNow = useCallback(async () => {
    const a = activeRef.current
    if (a) await flush(a)
    await doCompile()
  }, [doCompile, flush])

  // ---- shortcuts ----
  useEffect(() => {
    const h = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 's' || e.key === 'Enter') {
        e.preventDefault()
        compileNow()
        return
      }
      // Let CodeMirror handle undo/redo when the source pane is focused;
      // everywhere else (visual editor, etc.) use the app-level history.
      const inCodeMirror = e.target.closest && e.target.closest('.cm-editor')
      if (inCodeMirror) return
      if (e.key === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [compileNow, undo, redo])

  const source = active ? contents[active] ?? '' : ''

  return (
    <div className="app">
      <Sidebar files={files} active={active} onOpen={openFile} dirty={dirty} />

      <main className="workspace">
        <div className="toolbar">
          <span className="crumb">{active || '—'}</span>
          <div className="spacer" />
          <label className="auto">
            <input type="checkbox" checked={autocompile} onChange={(e) => setAutocompile(e.target.checked)} />
            Auto
          </label>
          <button className="primary" onClick={compileNow} disabled={compiling}>
            {compiling ? 'Compiling…' : 'Recompile'}
          </button>
        </div>

        <div className="panes">
          <section className="pane editor-pane">
            <Editor value={source} onChange={onEdit} />
          </section>

          <section className="pane right-pane">
            <div className="right-tabs">
              <button className={rightMode === 'pdf' ? 'on' : ''} onClick={() => setRightMode('pdf')}>PDF</button>
              <button className={rightMode === 'visual' ? 'on' : ''} onClick={() => setRightMode('visual')}>Visual editor</button>
              <div className="spacer" />
              {!ok && <button className="status err" onClick={() => setShowLog((s) => !s)}>● errors</button>}
              {ok && pdf && <span className="status ok">● compiled</span>}
            </div>

            <div className="right-body">
              {rightMode === 'pdf' ? (
                <PdfPreview pdfBase64={pdf} />
              ) : (
                <VisualEditor source={source} onChange={onEdit} syncNonce={syncNonce} />
              )}
              {showLog && (
                <div className="logpane">
                  <div className="logpane-head">
                    <span>Compile log</span>
                    <button onClick={() => setShowLog(false)}>close</button>
                  </div>
                  <pre>{log || 'No output.'}</pre>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
