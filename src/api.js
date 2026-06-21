// Thin client over the compile backend.
//
// In dev, BASE is empty and requests go through the Vite proxy to :3019.
// In production (Vercel), set VITE_API_BASE to the deployed backend URL, e.g.
//   VITE_API_BASE=https://latexifier-api.onrender.com
const BASE = import.meta.env.VITE_API_BASE || ''
const PROJECT = 'sample-project'

// Template (seed) reads — used only to populate a fresh session.
export async function listFiles() {
  const r = await fetch(`${BASE}/api/files?project=${PROJECT}`)
  if (!r.ok) throw new Error('failed to list files')
  return r.json()
}

export async function readFile(path) {
  const r = await fetch(`${BASE}/api/file?project=${PROJECT}&path=${encodeURIComponent(path)}`)
  if (!r.ok) throw new Error('failed to read file')
  return r.text()
}

// Stateless compile: the browser sends the current file set; the server
// compiles it in a throwaway temp dir and returns the PDF. Nothing is saved.
export async function compile(files, root = 'main.tex') {
  const r = await fetch(`${BASE}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, files }),
  })
  return r.json() // { ok, log, pdf(base64|null) }
}
