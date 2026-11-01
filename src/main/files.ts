/**
 * File access for the built-in code editor.
 * Every call names a workspace root (a project folder or an agent worktree);
 * paths are relative to it and may never escape it.
 */
import { BrowserWindow, shell } from 'electron'
import { existsSync, FSWatcher, watch } from 'fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { dirname, join, relative, resolve, sep } from 'path'
import { getState } from './store'

export interface DirEntry {
  name: string
  path: string // relative to root, '/' separated
  dir: boolean
}

const HIDDEN = new Set(['.git', '.DS_Store'])
const HEAVY = new Set(['node_modules', '.next', 'dist', 'out', 'build', '.turbo', '.cache', 'target', '.venv', '__pycache__'])
const MAX_FILE = 5 * 1024 * 1024

/** Only folders Hive knows about can be opened. */
function checkRoot(root: string): string {
  const r = resolve(root)
  const s = getState()
  const ok = s.projects.some((p) => resolve(p.path) === r) || s.agents.some((a) => a.worktreePath && resolve(a.worktreePath) === r)
  if (!ok) throw new Error('Folder is not part of a Hive project')
  return r
}

function abs(root: string, rel: string): string {
  const r = checkRoot(root)
  const p = resolve(r, rel || '.')
  if (p !== r && !p.startsWith(r + sep)) throw new Error('Path is outside the workspace')
  return p
}

const toRel = (root: string, p: string): string => relative(resolve(root), p).split(sep).join('/')

export async function list(root: string, rel: string): Promise<DirEntry[]> {
  const dir = abs(root, rel)
  const items = await readdir(dir, { withFileTypes: true })
  return items
    .filter((d) => !HIDDEN.has(d.name))
    .map((d) => ({ name: d.name, path: toRel(root, join(dir, d.name)), dir: d.isDirectory() }))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.dir ? -1 : 1))
}

/** Flat list of files for quick-open (skips heavy folders). */
export async function listAll(root: string): Promise<string[]> {
  const r = checkRoot(root)
  const out: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (out.length > 20000 || depth > 20) return
    let items
    try {
      items = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of items) {
      if (HIDDEN.has(d.name) || HEAVY.has(d.name)) continue
      const p = join(dir, d.name)
      if (d.isDirectory()) await walk(p, depth + 1)
      else out.push(toRel(r, p))
    }
  }
  await walk(r, 0)
  return out
}

export async function read(root: string, rel: string): Promise<{ content: string; binary: boolean; tooLarge: boolean; size: number }> {
  const p = abs(root, rel)
  const st = await stat(p)
  if (st.size > MAX_FILE) return { content: '', binary: false, tooLarge: true, size: st.size }
  const buf = await readFile(p)
  const binary = buf.subarray(0, 8000).includes(0)
  return { content: binary ? '' : buf.toString('utf8'), binary, tooLarge: false, size: st.size }
}

/** Like read(), but a missing file is a normal outcome (returns null) instead of an error. */
export async function readOptional(root: string, rel: string): Promise<string | null> {
  const p = abs(root, rel)
  if (!existsSync(p)) return null
  try {
    const st = await stat(p)
    if (!st.isFile() || st.size > MAX_FILE) return null
    return await readFile(p, 'utf8')
  } catch {
    return null
  }
}

export async function write(root: string, rel: string, content: string): Promise<void> {
  await writeFile(abs(root, rel), content, 'utf8')
}

export async function create(root: string, rel: string, dir: boolean): Promise<void> {
  const p = abs(root, rel)
  if (existsSync(p)) throw new Error(`${rel} already exists`)
  if (dir) await mkdir(p, { recursive: true })
  else {
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, '', 'utf8')
  }
}

export async function move(root: string, from: string, to: string): Promise<void> {
  const a = abs(root, from)
  const b = abs(root, to)
  if (existsSync(b)) throw new Error(`${to} already exists`)
  await mkdir(dirname(b), { recursive: true })
  await rename(a, b)
}

/** Moves to the system Trash (recoverable) instead of deleting. */
export async function trash(root: string, rel: string): Promise<void> {
  const p = abs(root, rel)
  if (p === resolve(root)) throw new Error('Refusing to delete the workspace root')
  await shell.trashItem(p)
}

export function absolute(root: string, rel: string): string {
  return abs(root, rel)
}

// ---------- change notifications ----------
const watchers = new Map<string, { w: FSWatcher; refs: number }>()

export function watchRoot(root: string, win: () => BrowserWindow | null): void {
  const r = checkRoot(root)
  const cur = watchers.get(r)
  if (cur) {
    cur.refs++
    return
  }
  let timer: NodeJS.Timeout | null = null
  const changed = new Set<string>()
  try {
    const w = watch(r, { recursive: true }, (_ev, file) => {
      if (!file) return
      const f = String(file).split(sep).join('/')
      if (f.startsWith('.git/') || f.split('/').some((seg) => HEAVY.has(seg))) return
      changed.add(f)
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const w2 = win()
        if (w2 && !w2.isDestroyed()) w2.webContents.send('fs:changed', { root: r, paths: [...changed] })
        changed.clear()
      }, 250)
    })
    w.on('error', () => undefined)
    watchers.set(r, { w, refs: 1 })
  } catch (err) {
    console.warn('[files] watch failed', err)
  }
}

export function unwatchRoot(root: string): void {
  const r = resolve(root)
  const cur = watchers.get(r)
  if (!cur) return
  if (--cur.refs <= 0) {
    cur.w.close()
    watchers.delete(r)
  }
}

// ---------- IntelliSense: project sources + type definitions ----------
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i
const MAX_SOURCE_FILES = 2500
const MAX_SOURCE_BYTES = 25 * 1024 * 1024

/** All JS/TS sources of the workspace (for cross-file completions). */
export async function sourceFiles(root: string): Promise<{ path: string; content: string }[]> {
  const r = checkRoot(root)
  const out: { path: string; content: string }[] = []
  let bytes = 0
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (out.length >= MAX_SOURCE_FILES || bytes >= MAX_SOURCE_BYTES || depth > 20) return
    let items
    try {
      items = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of items) {
      if (HIDDEN.has(d.name) || HEAVY.has(d.name) || d.name.startsWith('.')) continue
      const p = join(dir, d.name)
      if (d.isDirectory()) await walk(p, depth + 1)
      else if (SOURCE_EXT.test(d.name) && !d.name.endsWith('.min.js')) {
        try {
          const st = await stat(p)
          if (st.size > 400_000) continue
          bytes += st.size
          out.push({ path: toRel(r, p), content: await readFile(p, 'utf8') })
        } catch {
          /* unreadable */
        }
        if (out.length >= MAX_SOURCE_FILES || bytes >= MAX_SOURCE_BYTES) return
      }
    }
  }
  await walk(r, 0)
  return out
}

/**
 * Type definitions of the project's dependencies (node_modules/<pkg> with "types",
 * and node_modules/@types/*), so the editor can complete library APIs.
 */
export async function typeLibs(root: string): Promise<{ path: string; content: string }[]> {
  const r = checkRoot(root)
  const nm = join(r, 'node_modules')
  if (!existsSync(nm)) return []
  const out: { path: string; content: string }[] = []
  let bytes = 0
  const LIMIT = 30 * 1024 * 1024
  const seen = new Set<string>()

  const readJson = async (p: string): Promise<Record<string, unknown> | null> => {
    try {
      return JSON.parse(await readFile(p, 'utf8'))
    } catch {
      return null
    }
  }
  const addDts = async (dir: string, depth = 0, budget = { n: 400 }): Promise<void> => {
    if (depth > 6 || bytes > LIMIT || budget.n <= 0) return
    let items
    try {
      items = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of items) {
      const p = join(dir, d.name)
      if (d.isDirectory()) {
        if (d.name === 'node_modules' || d.name.startsWith('.') || /^(test|tests|__tests__|src|docs?|examples?)$/.test(d.name)) continue
        await addDts(p, depth + 1, budget)
      } else if (/\.d\.(ts|mts|cts)$/.test(d.name) && !seen.has(p)) {
        try {
          const st = await stat(p)
          if (st.size > 1_500_000) continue
          seen.add(p)
          bytes += st.size
          budget.n--
          out.push({ path: toRel(r, p), content: await readFile(p, 'utf8') })
        } catch {
          /* skip */
        }
      }
      if (bytes > LIMIT || budget.n <= 0) return
    }
  }
  const addPackage = async (name: string): Promise<void> => {
    const dir = join(nm, ...name.split('/'))
    const pj = join(dir, 'package.json')
    if (seen.has(pj) || !existsSync(pj)) return
    seen.add(pj)
    const meta = await readJson(pj)
    if (!meta) return
    const hasTypes = meta.types || meta.typings || (meta.exports && JSON.stringify(meta.exports).includes('.d.ts'))
    if (!hasTypes && !name.startsWith('@types/')) return
    out.push({ path: toRel(r, pj), content: JSON.stringify({ name: meta.name, version: meta.version, types: meta.types ?? meta.typings, typings: meta.typings, main: meta.main, exports: meta.exports }) })
    await addDts(dir)
  }

  const pkg = await readJson(join(r, 'package.json'))
  const deps = Object.keys({ ...(pkg?.dependencies as object), ...(pkg?.devDependencies as object), ...(pkg?.peerDependencies as object) })
  for (const d of deps) {
    if (bytes > LIMIT) break
    await addPackage(d)
    if (!d.startsWith('@types/')) await addPackage(`@types/${d.replace(/^@([^/]+)\//, '$1__')}`)
  }
  // always include @types/node & @types/react etc. if present
  try {
    for (const t of await readdir(join(nm, '@types'))) if (bytes < LIMIT) await addPackage(`@types/${t}`)
  } catch {
    /* no @types */
  }
  return out
}
