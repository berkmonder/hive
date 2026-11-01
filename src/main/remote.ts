/**
 * Localhost tunnels (share a dev server or the webhook port on a public HTTPS URL)
 * and database connections that agents can query read-only over MCP.
 */
import { ipcMain, safeStorage, app } from 'electron'
import { spawn, ChildProcess, execFile } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { DbConnection } from '@shared/types'
import type { FeatureCtx } from './features'

// ---------------- tunnels ----------------
interface Tunnel {
  port: number
  url?: string
  proc: ChildProcess
  tool: string
}
const tunnels = new Map<number, Tunnel>()

function which(bin: string): Promise<boolean> {
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((r) => execFile(shell, ['-l', '-i', '-c', `command -v ${bin}`], { timeout: 8000 }, (err, out) => r(!err && !!out.trim())))
}

async function openTunnel(port: number): Promise<Tunnel> {
  const existing = tunnels.get(port)
  if (existing?.url) return existing
  const shell = process.env.SHELL || '/bin/zsh'
  const hasCf = await which('cloudflared')
  // Cloudflare quick tunnels need no account; localtunnel is the fallback (via npx)
  const cmd = hasCf ? `cloudflared tunnel --no-autoupdate --url http://localhost:${port}` : `npx -y localtunnel --port ${port}`
  const proc = spawn(shell, ['-l', '-i', '-c', cmd], { env: process.env })
  const t: Tunnel = { port, proc, tool: hasCf ? 'cloudflared' : 'localtunnel' }
  tunnels.set(port, t)
  return new Promise((resolve, reject) => {
    let log = ''
    const timer = setTimeout(() => {
      proc.kill()
      tunnels.delete(port)
      reject(new Error(`No public URL after 40 s (${t.tool}).\n${log.slice(-300)}`))
    }, 40_000)
    const onData = (d: Buffer): void => {
      log += d.toString()
      const m = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/) ?? log.match(/your url is: (https:\/\/\S+)/i)
      if (m && !t.url) {
        t.url = m[1] ?? m[0]
        clearTimeout(timer)
        resolve(t)
      }
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', () => {
      tunnels.delete(port)
      clearTimeout(timer)
      if (!t.url) reject(new Error(`${t.tool} stopped.\n${log.slice(-300)}`))
    })
  })
}

// ---------------- database connections ----------------
const dbFile = (): string => join(app.getPath('userData'), 'databases.json')
type Stored = DbConnection & { secretUrl: string }
const enc = (s: string): string => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s)).toString('base64')
const dec = (s: string): string => (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(s, 'base64')) : Buffer.from(s, 'base64').toString())
function loadDbs(): Stored[] {
  try {
    return existsSync(dbFile()) ? JSON.parse(readFileSync(dbFile(), 'utf8')) : []
  } catch {
    return []
  }
}
const saveDbs = (l: Stored[]): void => writeFileSync(dbFile(), JSON.stringify(l, null, 2), { mode: 0o600 })
const publicDb = (s: Stored): DbConnection => ({ id: s.id, name: s.name, type: s.type, projectId: s.projectId, readOnly: s.readOnly, host: s.host })

export function dbsFor(projectId: string): DbConnection[] {
  return loadDbs().filter((d) => !d.projectId || d.projectId === projectId).map(publicDb)
}

const WRITE_SQL = /^\s*(insert|update|delete|merge|upsert|create|alter|drop|truncate|grant|revoke|rename|replace|call|exec|execute|do|copy|vacuum|lock|set\s+(?!transaction)|load|handler)\b/i

/** Run one statement. Read-only connections run inside a read-only transaction. */
export async function runQuery(projectId: string, ref: string, query: string, limit = 200): Promise<string> {
  const s = loadDbs().find((d) => (d.id === ref || d.name.toLowerCase() === ref.toLowerCase()) && (!d.projectId || d.projectId === projectId))
  if (!s) throw new Error(`No database "${ref}". Available: ${dbsFor(projectId).map((d) => d.name).join(', ') || '(none)'}`)
  const url = dec(s.secretUrl)
  const q = query.trim().replace(/;\s*$/, '')
  if (s.type !== 'mongodb' && q.includes(';')) throw new Error('One statement per call')
  if (s.readOnly && s.type !== 'mongodb' && WRITE_SQL.test(q)) throw new Error('This connection is read-only')
  const fmt = (rows: unknown[]): string => {
    const shown = rows.slice(0, limit)
    return `${rows.length} row${rows.length === 1 ? '' : 's'}${rows.length > limit ? ` (showing ${limit})` : ''}\n${JSON.stringify(shown, null, 1).slice(0, 40_000)}`
  }
  if (s.type === 'postgres') {
    const { Client } = await import('pg')
    const c = new Client({ connectionString: url, statement_timeout: 20_000 })
    await c.connect()
    try {
      if (s.readOnly) await c.query('BEGIN TRANSACTION READ ONLY')
      const r = await c.query(q)
      if (s.readOnly) await c.query('ROLLBACK')
      return fmt(r.rows ?? [])
    } finally {
      await c.end().catch(() => undefined)
    }
  }
  if (s.type === 'mysql') {
    const mysql = await import('mysql2/promise')
    const c = await mysql.createConnection({ uri: url, connectTimeout: 10_000 })
    try {
      if (s.readOnly) await c.query('START TRANSACTION READ ONLY')
      const [rows] = await c.query({ sql: q, timeout: 20_000 })
      if (s.readOnly) await c.query('ROLLBACK')
      return fmt(Array.isArray(rows) ? rows : [rows])
    } finally {
      await c.end().catch(() => undefined)
    }
  }
  // mongodb: {"collection":"users","find":{...},"limit":20} | {"collection":"x","aggregate":[...]} | {"collection":"x","count":{...}}
  const { MongoClient } = await import('mongodb')
  let spec: { collection?: string; find?: object; aggregate?: object[]; count?: object; limit?: number; sort?: Record<string, 1 | -1>; collections?: boolean }
  try {
    spec = JSON.parse(q)
  } catch {
    throw new Error('MongoDB queries are JSON: {"collection":"users","find":{"active":true},"limit":20} or {"collections":true}')
  }
  if (s.readOnly && spec.aggregate?.some((st) => '$out' in st || '$merge' in st)) throw new Error('This connection is read-only')
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 10_000 })
  await client.connect()
  try {
    const db = client.db()
    if (spec.collections) return fmt((await db.listCollections().toArray()).map((c) => c.name))
    if (!spec.collection) throw new Error('"collection" is required')
    const col = db.collection(spec.collection)
    if (spec.aggregate) return fmt(await col.aggregate(spec.aggregate, { maxTimeMS: 20_000 }).limit(limit).toArray())
    if (spec.count) return `${await col.countDocuments(spec.count, { maxTimeMS: 20_000 })}`
    return fmt(await col.find(spec.find ?? {}, { maxTimeMS: 20_000 }).sort(spec.sort ?? {}).limit(Math.min(spec.limit ?? limit, limit)).toArray())
  } finally {
    await client.close().catch(() => undefined)
  }
}

export function registerRemote(_ctx: FeatureCtx): { dispose: () => void } {
  ipcMain.handle('tunnel:open', async (_e, port: number) => {
    const t = await openTunnel(port)
    return { url: t.url, tool: t.tool }
  })
  ipcMain.handle('tunnel:close', (_e, port: number) => {
    tunnels.get(port)?.proc.kill()
    tunnels.delete(port)
  })
  ipcMain.handle('tunnel:list', () => [...tunnels.values()].filter((t) => t.url).map((t) => ({ port: t.port, url: t.url, tool: t.tool })))

  ipcMain.handle('db:list', () => loadDbs().map(publicDb))
  ipcMain.handle('db:save', (_e, d: DbConnection, url?: string) => {
    const all = loadDbs()
    const i = all.findIndex((x) => x.id === d.id)
    let host = d.host
    if (url) {
      try {
        host = new URL(url).host
      } catch {
        host = '?'
      }
    }
    const prev = i >= 0 ? all[i] : undefined
    if (!url && !prev) throw new Error('Connection string required')
    const v: Stored = { ...d, host, secretUrl: url ? enc(url) : prev!.secretUrl }
    if (i >= 0) all[i] = v
    else all.push(v)
    saveDbs(all)
  })
  ipcMain.handle('db:remove', (_e, id: string) => saveDbs(loadDbs().filter((x) => x.id !== id)))
  ipcMain.handle('db:query', (_e, id: string, q: string) => {
    const d = loadDbs().find((x) => x.id === id)
    if (!d) throw new Error('Unknown connection')
    return runQuery(d.projectId ?? '', id, q, 100)
  })

  return {
    dispose: () => {
      for (const t of tunnels.values()) t.proc.kill()
      tunnels.clear()
    }
  }
}
