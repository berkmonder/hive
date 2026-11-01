/**
 * Weekly report, session replay and the secrets manager.
 */
import { app, ipcMain, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { open } from 'fs/promises'
import { basename, join } from 'path'
import simpleGit from 'simple-git'
import type { Agent } from '@shared/types'
import type { ReplayTurn, WeeklyReport } from '@shared/insights'
import { getState } from './store'
import type { FeatureCtx } from './features'
import * as git from './git'
import { usageReport } from './usage'

const DAY = 86_400_000
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ---------------- secrets ----------------
const secretsFile = (): string => join(app.getPath('userData'), 'secrets.json')
type SecretStore = Record<string, { value: string; projectId?: string; updatedAt: number }>
function loadSecrets(): SecretStore {
  try {
    return existsSync(secretsFile()) ? JSON.parse(readFileSync(secretsFile(), 'utf8')) : {}
  } catch {
    return {}
  }
}
const decrypt = (v: string): string => {
  const buf = Buffer.from(v, 'base64')
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
}
const encrypt = (v: string): string =>
  (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(v) : Buffer.from(v, 'utf8')).toString('base64')

/** Env vars for an agent: every secret that is global or belongs to its project. */
export function secretEnv(projectId: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, s] of Object.entries(loadSecrets())) {
    if (s.projectId && s.projectId !== projectId) continue
    try {
      out[name] = decrypt(s.value)
    } catch {
      /* keychain locked / moved machine */
    }
  }
  return out
}
/** Values to hide in terminal output (longer than 5 chars, to avoid masking common words). */
export function secretValues(): string[] {
  return Object.values(loadSecrets())
    .map((s) => {
      try {
        return decrypt(s.value)
      } catch {
        return ''
      }
    })
    .filter((v) => v.length > 5)
}
export function secretNames(projectId: string): string[] {
  return Object.entries(loadSecrets())
    .filter(([, s]) => !s.projectId || s.projectId === projectId)
    .map(([n]) => n)
}

export function registerInsights(ctx: FeatureCtx): { onSecretsChanged: (cb: () => void) => void } {
  let changed: () => void = () => undefined

  ipcMain.handle('secrets:list', () =>
    Object.entries(loadSecrets()).map(([name, s]) => ({ name, projectId: s.projectId, updatedAt: s.updatedAt, length: (() => {
      try {
        return decrypt(s.value).length
      } catch {
        return 0
      }
    })() })).sort((a, b) => a.name.localeCompare(b.name))
  )
  ipcMain.handle('secrets:set', (_e, name: string, value: string, projectId?: string) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Use an environment variable name, e.g. STRIPE_API_KEY')
    const all = loadSecrets()
    all[name] = { value: encrypt(value), projectId: projectId || undefined, updatedAt: Date.now() }
    writeFileSync(secretsFile(), JSON.stringify(all, null, 2), { mode: 0o600 })
    changed()
    return safeStorage.isEncryptionAvailable()
  })
  ipcMain.handle('secrets:remove', (_e, name: string) => {
    const all = loadSecrets()
    delete all[name]
    writeFileSync(secretsFile(), JSON.stringify(all, null, 2), { mode: 0o600 })
    changed()
  })
  ipcMain.handle('secrets:encrypted', () => safeStorage.isEncryptionAvailable())

  // ---------------- session replay ----------------
  ipcMain.handle('replay:sessions', (_e, agentId: string) => {
    const a = ctx.findAgent(agentId)
    return (a.sessions ?? [])
      .filter((p) => existsSync(p))
      .map((p) => ({ path: p, id: basename(p, '.jsonl') }))
      .reverse()
  })
  ipcMain.handle('replay:load', async (_e, agentId: string, path: string) => {
    const a = ctx.findAgent(agentId)
    if (!(a.sessions ?? []).includes(path)) throw new Error('Unknown session')
    return replay(path)
  })

  // ---------------- weekly report ----------------
  ipcMain.handle('report:weekly', (_e, projectId: string, days = 7) => weekly(ctx, projectId, days))

  return { onSecretsChanged: (cb) => (changed = cb) }
}

async function replay(path: string): Promise<ReplayTurn[]> {
  const fh = await open(path, 'r')
  const text = (await fh.readFile()).toString('utf8')
  await fh.close()
  const turns: ReplayTurn[] = []
  let cur: ReplayTurn | null = null
  const seen = new Set<string>()
  let lastCtx = 0
  const resultSize = new Map<string, ReplayTurn['tools'][number]>()
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let j: { type?: string; isMeta?: boolean; isSidechain?: boolean; timestamp?: string; message?: { id?: string; model?: string; content?: unknown; usage?: Record<string, number> } }
    try {
      j = JSON.parse(line)
    } catch {
      continue
    }
    if (j.isSidechain || j.isMeta || !j.message) continue
    const at = j.timestamp ? Date.parse(j.timestamp) : 0
    const c = j.message.content
    if (j.type === 'user') {
      if (Array.isArray(c)) {
        for (const b of c as { type: string; tool_use_id?: string; content?: unknown }[]) {
          if (b.type === 'tool_result' && b.tool_use_id) {
            const t = resultSize.get(b.tool_use_id)
            if (t) t.resultChars = JSON.stringify(b.content ?? '').length
          }
        }
        if ((c as { type: string }[]).every((b) => b.type === 'tool_result')) continue
      }
      const txt = typeof c === 'string' ? c : Array.isArray(c) ? (c as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n') : ''
      if (!txt.trim() || txt.startsWith('<local-command') || txt.startsWith('<command-') || txt.startsWith('Caveat:')) continue
      cur = { index: turns.length, at, user: txt.slice(0, 2000), replies: [], tools: [], context: lastCtx, delta: 0, output: 0, model: '' }
      turns.push(cur)
    } else if (j.type === 'assistant') {
      if (!cur) {
        cur = { index: 0, at, user: '(session start)', replies: [], tools: [], context: 0, delta: 0, output: 0, model: '' }
        turns.push(cur)
      }
      const u = j.message.usage
      if (u && j.message.model !== '<synthetic>') {
        const ctxNow = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
        if (!seen.has(`u:${j.message.id}`)) {
          seen.add(`u:${j.message.id}`)
          cur.output += u.output_tokens ?? 0
        }
        cur.delta += Math.max(0, ctxNow - lastCtx)
        cur.context = ctxNow
        lastCtx = ctxNow
        cur.model = j.message.model ?? cur.model
      }
      if (!Array.isArray(c)) continue
      for (const b of c as { type: string; text?: string; name?: string; id?: string; input?: Record<string, unknown> }[]) {
        const key = `${j.message.id}:${b.type}:${b.id ?? (b.text ?? '').slice(0, 40)}`
        if (seen.has(key)) continue
        seen.add(key)
        if (b.type === 'text' && b.text?.trim()) cur.replies.push(b.text.trim().slice(0, 3000))
        if (b.type === 'tool_use' && b.name) {
          const inp = b.input ?? {}
          const arg = String(inp.file_path ?? inp.command ?? inp.pattern ?? inp.url ?? inp.description ?? '').slice(0, 120)
          const t = { name: b.name, arg, resultChars: 0 }
          cur.tools.push(t)
          if (b.id) resultSize.set(b.id, t)
        }
      }
    }
  }
  return turns
}

async function weekly(ctx: FeatureCtx, projectId: string, days: number): Promise<WeeklyReport> {
  const project = ctx.findProject(projectId)
  const agents = getState().agents.filter((a) => a.projectId === projectId)
  const since = Date.now() - days * DAY
  const dayKeys = Array.from({ length: days }, (_, i) => dayKey(new Date(Date.now() - (days - 1 - i) * DAY)))
  const usage = await usageReport(agents, [], () => 0)
  const base = await git.currentBranch(project.path)

  const perAgent: WeeklyReport['agents'] = []
  const fileCount = new Map<string, number>()
  for (const a of agents) {
    const u = usage.agents.find((x) => x.agentId === a.id)
    const cost = dayKeys.reduce((s, d) => s + (u?.days[d] ?? 0), 0)
    const commits = await commitsBy(a, ctx.agentCwd(a), base, since, fileCount)
    const done = getState().tasks.filter((t) => t.agentId === a.id && t.status === 'done' && t.updatedAt >= since)
    perAgent.push({
      agentId: a.id,
      name: a.name,
      role: a.role,
      color: a.color,
      cost,
      commits: commits.list,
      added: commits.added,
      removed: commits.removed,
      tasksDone: done.map((t) => t.title),
      roleChanges: (a.roleLog ?? []).filter((r) => r.at >= since).length
    })
  }
  const daily = dayKeys.map((d) => ({ day: d, cost: usage.agents.reduce((s, u) => s + (u.days[d] ?? 0), 0) }))
  return {
    project: project.name,
    from: since,
    to: Date.now(),
    agents: perAgent.sort((a, b) => b.commits.length - a.commits.length || b.cost - a.cost),
    daily,
    topFiles: [...fileCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([file, n]) => ({ file, n })),
    workflows: getState().workflowRuns.filter((r) => r.projectId === projectId && r.startedAt >= since).length,
    cardsDone: getState().tasks.filter((t) => t.projectId === projectId && t.status === 'done' && t.updatedAt >= since).length,
    cardsOpen: getState().tasks.filter((t) => t.projectId === projectId && t.status !== 'done').length
  }
}

/** Commits by this agent: its own branch, or commits carrying its Hive note in a shared folder. */
async function commitsBy(a: Agent, cwd: string, base: string | undefined, since: number, files: Map<string, number>) {
  const out = { list: [] as { hash: string; subject: string; at: number }[], added: 0, removed: 0 }
  if (!existsSync(cwd)) return out
  const g = simpleGit(cwd)
  try {
    if (!(await g.checkIsRepo())) return out
    const range = a.branch && base ? [`${base}..HEAD`] : []
    const raw = await g.raw(['log', ...range, `--since=${new Date(since).toISOString()}`, '--notes=hive', '--format=@@%H%x09%ct%x09%s%n%N', '--numstat'])
    for (const chunk of raw.split('@@').filter(Boolean)) {
      const [head, ...rest] = chunk.split('\n')
      const [hash, ct, subject] = head.split('\t')
      const body = rest.join('\n')
      if (!a.branch && !body.includes(`Hive · ${a.name} (`)) continue
      out.list.push({ hash, subject, at: Number(ct) * 1000 })
      for (const l of rest) {
        const m = l.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
        if (!m) continue
        out.added += Number(m[1]) || 0
        out.removed += Number(m[2]) || 0
        files.set(m[3], (files.get(m[3]) ?? 0) + 1)
      }
    }
  } catch {
    /* no commits / no base */
  }
  return out
}
