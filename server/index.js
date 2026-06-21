import express from 'express'
import cors from 'cors'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PROJECTS_DIR = path.join(ROOT, 'projects')
const PORT = process.env.PORT || 3019

const app = express()
// CORS is open so the Vercel-hosted frontend (a different origin) can call the
// compile API. Lock this down with ALLOW_ORIGIN in a real deployment.
app.use(cors(process.env.ALLOW_ORIGIN ? { origin: process.env.ALLOW_ORIGIN } : {}))
app.use(express.json({ limit: '10mb' }))

// ---------------------------------------------------------------------------
// This server is STATELESS and saves nothing. The files under projects/ are a
// read-only template used only to seed a new session. All editing lives in the
// browser; compilation happens in a throwaway temp dir that is deleted right
// after the PDF is produced. Refreshing the page returns to the template.
// ---------------------------------------------------------------------------

// ---- template reads (seed only) -------------------------------------------
function projectDir(project) {
  const dir = path.join(PROJECTS_DIR, project)
  if (dir !== PROJECTS_DIR && !dir.startsWith(PROJECTS_DIR + path.sep)) throw new Error('bad project')
  return dir
}
function safeJoin(project, rel) {
  const base = projectDir(project)
  const full = path.join(base, rel)
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('bad path')
  return full
}
async function listFiles(dir, base = dir) {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)))
    else out.push(path.relative(base, full))
  }
  return out.sort()
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/projects', async (_req, res) => {
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true })
  res.json(entries.filter((e) => e.isDirectory()).map((e) => e.name))
})

app.get('/api/files', async (req, res) => {
  try {
    res.json(await listFiles(projectDir(req.query.project)))
  } catch (e) {
    res.status(400).json({ error: String(e.message) })
  }
})

app.get('/api/file', async (req, res) => {
  try {
    res.type('text/plain').send(await fs.readFile(safeJoin(req.query.project, req.query.path), 'utf8'))
  } catch (e) {
    res.status(404).json({ error: String(e.message) })
  }
})

// ---- stateless compile -----------------------------------------------------
// Body: { root: 'main.tex', files: { 'main.tex': '...', 'notes.tex': '...' } }
// Files are written to a fresh temp dir, compiled, and the dir is removed.
function runLatexmk(dir, root) {
  const args = ['-pdf', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', root]
  return new Promise((resolve) => {
    const child = spawn('latexmk', args, { cwd: dir })
    let log = ''
    child.stdout.on('data', (d) => (log += d))
    child.stderr.on('data', (d) => (log += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), 30000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, log, pdf: path.join(dir, root.replace(/\.tex$/, '.pdf')) })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, log: `Failed to launch latexmk: ${err.message}`, pdf: null })
    })
  })
}

app.post('/api/compile', async (req, res) => {
  const { root = 'main.tex', files } = req.body || {}
  if (!files || typeof files !== 'object') return res.status(400).json({ ok: false, error: 'no files' })

  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'latexifier-'))
  try {
    for (const [rel, content] of Object.entries(files)) {
      if (typeof content !== 'string') continue
      const full = path.join(work, rel)
      if (full !== work && !full.startsWith(work + path.sep)) continue // ignore path escapes
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, content, 'utf8')
    }
    const { code, log, pdf } = await runLatexmk(work, root)
    if (pdf && existsSync(pdf)) {
      const buf = await fs.readFile(pdf)
      res.json({ ok: code === 0, log, pdf: buf.toString('base64') })
    } else {
      res.json({ ok: false, log, pdf: null })
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message), log: String(e.message) })
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
})

app.listen(PORT, () => {
  console.log(`latexifier server (stateless) on http://localhost:${PORT}`)
})
