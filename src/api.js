// Thin client over the Express backend.
const PROJECT = 'sample-project'

export async function listFiles() {
  const r = await fetch(`/api/files?project=${PROJECT}`)
  if (!r.ok) throw new Error('failed to list files')
  return r.json()
}

export async function readFile(path) {
  const r = await fetch(`/api/file?project=${PROJECT}&path=${encodeURIComponent(path)}`)
  if (!r.ok) throw new Error('failed to read file')
  return r.text()
}

export async function writeFile(path, content) {
  const r = await fetch('/api/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: PROJECT, path, content }),
  })
  if (!r.ok) throw new Error('failed to write file')
  return r.json()
}

export async function compile(root = 'main.tex') {
  const r = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: PROJECT, root }),
  })
  return r.json() // { ok, log, pdf(base64|null) }
}
