import express from 'express'
import cors from 'cors'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PROJECTS_DIR = path.join(ROOT, 'projects')
const PORT = process.env.PORT || 3019

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

// ---- path safety -----------------------------------------------------------
// Every file operation is confined to projects/<project>/ so a crafted path
// can never escape the sandbox.
function projectDir(project) {
  const dir = path.join(PROJECTS_DIR, project)
  if (!dir.startsWith(PROJECTS_DIR + path.sep)) throw new Error('bad project')
  return dir
}
function safeJoin(project, rel) {
  const base = projectDir(project)
  const full = path.join(base, rel)
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('bad path')
  return full
}

// Recursively list source files in a project as a flat array of relative paths.
async function listFiles(dir, base = dir) {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // skip .build etc.
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await listFiles(full, base)))
    } else {
      out.push(path.relative(base, full))
    }
  }
  return out.sort()
}

// ---- API -------------------------------------------------------------------

app.get('/api/projects', async (_req, res) => {
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true })
  res.json(entries.filter((e) => e.isDirectory()).map((e) => e.name))
})

app.get('/api/files', async (req, res) => {
  try {
    const files = await listFiles(projectDir(req.query.project))
    res.json(files)
  } catch (e) {
    res.status(400).json({ error: String(e.message) })
  }
})

app.get('/api/file', async (req, res) => {
  try {
    const full = safeJoin(req.query.project, req.query.path)
    res.type('text/plain').send(await fs.readFile(full, 'utf8'))
  } catch (e) {
    res.status(404).json({ error: String(e.message) })
  }
})

app.put('/api/file', async (req, res) => {
  try {
    const { project, path: rel, content } = req.body
    const full = safeJoin(project, rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, content, 'utf8')
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: String(e.message) })
  }
})

// Compile a project with latexmk and stream back the resulting PDF.
// Build artifacts live in projects/<project>/.build so they never pollute the
// file tree the user sees.
const compiling = new Map() // project -> Promise (latest-wins de-dup)

function runLatexmk(project, root) {
  const dir = projectDir(project)
  const buildDir = path.join(dir, '.build')
  const args = [
    '-pdf',
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-file-line-error',
    `-outdir=${buildDir}`,
    root,
  ]
  return new Promise((resolve) => {
    const child = spawn('latexmk', args, { cwd: dir })
    let log = ''
    child.stdout.on('data', (d) => (log += d))
    child.stderr.on('data', (d) => (log += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), 30000)
    child.on('close', (code) => {
      clearTimeout(timer)
      const pdf = path.join(buildDir, root.replace(/\.tex$/, '.pdf'))
      resolve({ code, log, pdf })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, log: `Failed to launch latexmk: ${err.message}`, pdf: null })
    })
  })
}

app.post('/api/compile', async (req, res) => {
  const { project, root = 'main.tex' } = req.body
  try {
    projectDir(project) // validate
    // Coalesce concurrent requests for the same project onto one compile.
    let job = compiling.get(project)
    if (!job) {
      job = runLatexmk(project, root).finally(() => compiling.delete(project))
      compiling.set(project, job)
    }
    const { code, log, pdf } = await job
    if (pdf && existsSync(pdf)) {
      const buf = await fs.readFile(pdf)
      res.json({
        ok: code === 0,
        log,
        pdf: buf.toString('base64'),
      })
    } else {
      res.json({ ok: false, log, pdf: null })
    }
  } catch (e) {
    res.status(400).json({ error: String(e.message), log: String(e.message) })
  }
})

app.listen(PORT, () => {
  console.log(`latexifier server on http://localhost:${PORT}`)
})
