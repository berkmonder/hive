/**
 * Token usage & cost from Claude Code session transcripts (~/.claude/projects/…/*.jsonl).
 *  - per agent: transcripts Hive learned from the agent's hooks (exact)
 *  - per folder: every Claude Code session ever run in the project / worktree folders
 * Costs are estimates at public API list prices; on a Pro/Max plan this is the
 * API-equivalent value, not what you are billed.
 */
import { existsSync, readdirSync, statSync } from 'fs'
import { open } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { Agent } from '@shared/types'

import type { AgentUsage, Tokens, UsageEntry, UsageReport } from '@shared/usage'
import { kindOf, readOther } from './otherclis'
import { readConversation } from './transcript'
export type { UsageReport } from '@shared/usage'

// USD per million tokens: [input, output, cache write (5m), cache read]
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/opus-4-(?:[5-9]|\d\d)|opus-[5-9]/, [5, 25, 6.25, 0.5]],
  [/opus/, [15, 75, 18.75, 1.5]],
  [/haiku-4|haiku-[5-9]/, [1, 5, 1.25, 0.1]],
  [/haiku/, [0.8, 4, 1, 0.08]],
  [/sonnet/, [3, 15, 3.75, 0.3]]
]
function price(model: string): [number, number, number, number] {
  return PRICES.find(([re]) => re.test(model))?.[1] ?? [3, 15, 3.75, 0.3]
}

const zero = (): Tokens => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 })
const dayOf = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Parsed transcripts are cached by path+size+mtime so refreshing is cheap. */
const cache = new Map<string, { size: number; mtime: number; entries: UsageEntry[] }>()

async function parseTranscript(path: string): Promise<UsageEntry[]> {
  if (kindOf(path) !== 'claude') return readOther(path).usage as UsageEntry[]
  let st
  try {
    st = statSync(path)
  } catch {
    return []
  }
  const hit = cache.get(path)
  if (hit && hit.size === st.size && hit.mtime === st.mtimeMs) return hit.entries
  const fh = await open(path, 'r')
  const text = (await fh.readFile()).toString('utf8')
  await fh.close()
  // streaming writes the same message several times – keep the last copy per message id
  const byId = new Map<string, UsageEntry>()
  let anon = 0
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue
    let j: { type?: string; timestamp?: string; requestId?: string; message?: { id?: string; model?: string; usage?: Record<string, number> } }
    try {
      j = JSON.parse(line)
    } catch {
      continue
    }
    const u = j.message?.usage
    if (j.type !== 'assistant' || !u) continue
    const model = j.message?.model ?? 'unknown'
    if (model === '<synthetic>') continue
    const [pi, po, pw, pr] = price(model)
    const e: UsageEntry = {
      day: dayOf(j.timestamp),
      model,
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cost: 0
    }
    e.cost = (e.input * pi + e.output * po + e.cacheWrite * pw + e.cacheRead * pr) / 1e6
    byId.set(`${j.message?.id ?? `anon${anon++}`}:${j.requestId ?? ''}`, e)
  }
  const entries = [...byId.values()]
  cache.set(path, { size: st.size, mtime: st.mtimeMs, entries })
  return entries
}

function add(t: Tokens, e: Tokens): void {
  t.input += e.input
  t.output += e.output
  t.cacheWrite += e.cacheWrite
  t.cacheRead += e.cacheRead
  t.cost += e.cost
}

/** Claude Code stores sessions in ~/.claude/projects/<cwd with every non-alphanumeric char replaced by '-'>. */
function transcriptsForFolder(folder: string): string[] {
  const base = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')
  const dir = join(base, folder.replace(/[^a-zA-Z0-9]/g, '-'))
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f))
  } catch {
    return []
  }
}

export async function usageReport(agents: Agent[], folders: string[], liveWork: (id: string) => number): Promise<UsageReport> {
  const out: AgentUsage[] = []
  for (const a of agents) {
    const u: AgentUsage = { agentId: a.id, ...zero(), sessions: 0, messages: 0, workMs: (a.workMs ?? 0) + liveWork(a.id), models: [], days: {}, prompts: 0, promptDays: {} }
    const models = new Set<string>()
    for (const t of a.sessions ?? []) {
      try {
        for (const it of (await readConversation(t, 100_000)).items) {
          if (it.kind !== 'user' || !it.at) continue
          u.prompts++
          const d = dayOf(new Date(it.at).toISOString())
          u.promptDays[d] = (u.promptDays[d] ?? 0) + 1
        }
      } catch {
        /* unreadable transcript */
      }
      const entries = await parseTranscript(t)
      if (!entries.length) continue
      u.sessions++
      for (const e of entries) {
        add(u, e)
        u.messages++
        models.add(e.model)
        u.days[e.day] = (u.days[e.day] ?? 0) + e.cost
      }
    }
    u.models = [...models]
    out.push(u)
  }
  const folder = { ...zero(), sessions: 0, days: {} as Record<string, number> }
  const seen = new Set<string>()
  for (const f of folders) {
    for (const t of transcriptsForFolder(f)) {
      if (seen.has(t)) continue
      seen.add(t)
      const entries = await parseTranscript(t)
      if (!entries.length) continue
      folder.sessions++
      for (const e of entries) {
        add(folder, e)
        folder.days[e.day] = (folder.days[e.day] ?? 0) + e.cost
      }
    }
  }
  return { agents: out, folder, generatedAt: Date.now() }
}
