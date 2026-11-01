/**
 * Process watchdog: finds processes started by agents' tool calls (test runners, servers,
 * watchers…), including ones left behind after the agent stopped. Only processes that
 * were seen inside an agent's process tree can be stopped from Hive.
 * Dev servers started from Hive's Servers view are separate and never listed.
 */
import { execFile } from 'child_process'
import type { ProcInfo } from '@shared/procs'

interface PsRow {
  pid: number
  ppid: number
  etime: string
  cpu: number
  rss: number
  command: string
}

function ps(): Promise<PsRow[]> {
  if (process.platform === 'win32') return Promise.resolve([])
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'pid=,ppid=,etime=,%cpu=,rss=,command='], { maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve([])
      const rows: PsRow[] = []
      for (const line of out.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.*)$/)
        if (m) rows.push({ pid: +m[1], ppid: +m[2], etime: m[3], cpu: +m[4], rss: +m[5], command: m[6] })
      }
      resolve(rows)
    })
  })
}

/** pid -> owner, remembered so orphans (re-parented to launchd/init) are still attributed */
const known = new Map<number, { agentId: string; command: string; firstSeen: number }>()

/** The agent CLI itself and its MCP helpers are not "leftovers" */
const isAgentInfra = (cmd: string): boolean =>
  /(^|\/)(claude|codex|gemini|aider)(\s|$)/.test(cmd) || /claude-code|@openai\/codex|gemini-cli|mcp|caffeinate/i.test(cmd)

export async function scan(agents: { id: string; pid?: number; running: boolean }[]): Promise<ProcInfo[]> {
  const rows = await ps()
  const byPid = new Map(rows.map((r) => [r.pid, r]))
  const kids = new Map<number, PsRow[]>()
  for (const r of rows) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r])

  const out: ProcInfo[] = []
  const live = new Set<number>()
  for (const a of agents) {
    if (!a.pid || !byPid.has(a.pid)) continue
    // shell (a.pid) -> CLI -> tool processes
    const stack: { r: PsRow; depth: number }[] = (kids.get(a.pid) ?? []).map((r) => ({ r, depth: 1 }))
    while (stack.length) {
      const { r, depth } = stack.pop()!
      live.add(r.pid)
      for (const k of kids.get(r.pid) ?? []) stack.push({ r: k, depth: depth + 1 })
      if (isAgentInfra(r.command)) continue
      if (!known.has(r.pid)) known.set(r.pid, { agentId: a.id, command: r.command, firstSeen: Date.now() })
      out.push({ pid: r.pid, agentId: a.id, command: r.command, cpu: r.cpu, memMb: Math.round(r.rss / 1024), elapsed: r.etime, leftover: false })
    }
  }
  // orphans: we saw them under an agent before, the agent tree no longer contains them
  for (const [pid, k] of known) {
    const r = byPid.get(pid)
    if (!r || r.command !== k.command) {
      known.delete(pid)
      continue
    }
    if (live.has(pid)) continue
    out.push({ pid, agentId: k.agentId, command: r.command, cpu: r.cpu, memMb: Math.round(r.rss / 1024), elapsed: r.etime, leftover: true })
  }
  return out
}

export function killProc(pid: number): boolean {
  if (!known.has(pid)) throw new Error('Hive only stops processes started by its agents')
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    known.delete(pid)
    return false
  }
  setTimeout(() => {
    try {
      process.kill(pid, 0)
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
    known.delete(pid)
  }, 2500)
  return true
}
