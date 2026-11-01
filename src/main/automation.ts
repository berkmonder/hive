/**
 * Automation: test guard, daily budget, cross-agent conflict warnings, workflows
 * (step-by-step pipelines across agents) and plan review (Claude's ExitPlanMode).
 */
import { ipcMain, Notification } from 'electron'
import { spawn } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Agent, AgentRuntime, Conflict, PlanReview, ProjectSettings, TestResult, Workflow, WorkflowRun } from '@shared/types'
import { getState, updateState } from './store'
import type { FeatureCtx } from './features'
import type { HookEvent, HookPayload } from './hooks'
import * as git from './git'
import { usageReport } from './usage'
import { readConversation } from './transcript'

const dayKey = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Best guess at the project's test command. */
export function detectTestCommand(root: string): string | undefined {
  const pj = join(root, 'package.json')
  if (existsSync(pj)) {
    try {
      const s = (JSON.parse(readFileSync(pj, 'utf8')).scripts ?? {}) as Record<string, string>
      const pm = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(root, 'yarn.lock')) ? 'yarn' : existsSync(join(root, 'bun.lockb')) ? 'bun' : 'npm'
      if (s.test && !/no test specified/.test(s.test)) return `${pm} test`
    } catch {
      /* ignore */
    }
  }
  try {
    const names = readdirSync(root)
    if (names.some((n) => n.endsWith('.sln') || n.endsWith('.csproj'))) return 'dotnet test'
    if (names.includes('pytest.ini') || names.includes('pyproject.toml')) return 'pytest -q'
    if (names.includes('go.mod')) return 'go test ./...'
    if (names.includes('Cargo.toml')) return 'cargo test'
  } catch {
    /* ignore */
  }
  return undefined
}

function runShell(cmd: string, cwd: string, timeoutMs = 600_000): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || '/bin/zsh'
    const child = spawn(shell, ['-l', '-i', '-c', cmd], { cwd, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } })
    let out = ''
    const add = (d: Buffer): void => {
      out = (out + d.toString()).slice(-60_000)
    }
    child.stdout.on('data', add)
    child.stderr.on('data', add)
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      out += '\n[Hive: test command timed out]'
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, output: out.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, output: String(e) })
    })
  })
}

export function registerAutomation(ctx: FeatureCtx): {
  onRuntime: (rt: AgentRuntime) => void
  onHook: (agentId: string, event: HookEvent, payload: HookPayload) => void
  dispose: () => void
} {
  const { agents } = ctx
  const save = (fn: Parameters<typeof updateState>[0]): void => {
    updateState(fn)
    ctx.broadcastState()
  }
  const notify = (title: string, body: string, agentId?: string): void => {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body, silent: getState().settings.notify.silent })
    n.on('click', () => {
      ctx.win()?.show()
      if (agentId) ctx.send('agent:focus', agentId)
    })
    n.show()
  }
  const ps = (projectId: string): ProjectSettings => getState().projectSettings[projectId] ?? {}

  ipcMain.handle('projectSettings:save', (_e, projectId: string, p: ProjectSettings) => save((s) => (s.projectSettings[projectId] = p)))
  ipcMain.handle('projectSettings:detectTest', (_e, projectId: string) => detectTestCommand(ctx.findProject(projectId).path) ?? '')

  // ---------- test guard ----------
  const prevStatus = new Map<string, string>()
  const retries = new Map<string, number>()
  const testing = new Set<string>()
  const lastTests = new Map<string, TestResult>()
  ipcMain.handle('tests:last', () => [...lastTests.values()])
  ipcMain.handle('tests:run', (_e, agentId: string) => runTests(ctx.findAgent(agentId), true))

  async function runTests(a: Agent, manual = false): Promise<TestResult | null> {
    const cfg = ps(a.projectId)
    const cwd = ctx.agentCwd(a)
    const cmd = cfg.testCommand?.trim() || detectTestCommand(cwd)
    if (!cmd) {
      if (manual) throw new Error('No test command – set one in the project automation settings')
      return null
    }
    if (testing.has(a.id)) return null
    testing.add(a.id)
    ctx.send('tests:running', { agentId: a.id, command: cmd })
    const r = await runShell(cmd, cwd)
    testing.delete(a.id)
    const res: TestResult = { agentId: a.id, ok: r.ok, command: cmd, output: r.output.slice(-8000), at: Date.now() }
    if (r.ok) retries.set(a.id, 0)
    else if (!manual) {
      const n = (retries.get(a.id) ?? 0) + 1
      retries.set(a.id, n)
      const max = cfg.testRetries ?? 3
      if (n <= max && agents.isRunning(a.id)) {
        agents.deliver(a.id, `[Hive test guard] \`${cmd}\` failed after your last change (attempt ${n}/${max}). Fix the failures, then stop.\n\n\`\`\`\n${r.output.slice(-3500).trim()}\n\`\`\``)
        res.sentBack = true
      } else if (n > max) notify(`🧪 ${a.name}: tests still failing`, `Gave up after ${max} automatic attempts – please take a look.`, a.id)
    }
    lastTests.set(a.id, res)
    ctx.send('tests:result', res)
    return res
  }

  /** changed-file fingerprint per agent, so we only test when the turn changed something */
  const fingerprints = new Map<string, string>()
  async function changedSinceLast(a: Agent): Promise<boolean> {
    try {
      const sum = await git.summary(ctx.agentCwd(a))
      if (!sum.isRepo) return true
      const fp = sum.files.map((f) => `${f.path}:${f.added ?? 0}:${f.removed ?? 0}`).join('|') + sum.diff.length
      const prev = fingerprints.get(a.id)
      fingerprints.set(a.id, fp)
      return fp !== prev && sum.files.length > 0
    } catch {
      return false
    }
  }

  // ---------- workflows ----------
  ipcMain.handle('workflows:save', (_e, w: Workflow) =>
    save((s) => {
      const i = s.workflows.findIndex((x) => x.id === w.id)
      if (i >= 0) s.workflows[i] = w
      else s.workflows.push(w)
    })
  )
  ipcMain.handle('workflows:remove', (_e, id: string) => save((s) => (s.workflows = s.workflows.filter((x) => x.id !== id))))
  ipcMain.handle('workflows:run', (_e, id: string, input: string) => {
    const w = getState().workflows.find((x) => x.id === id)
    if (!w || !w.steps.length) throw new Error('Workflow has no steps')
    const run: WorkflowRun = { id: randomUUID(), workflowId: w.id, projectId: w.projectId, name: w.name, input, step: 0, status: 'running', log: [], startedAt: Date.now() }
    save((s) => (s.workflowRuns = [run, ...s.workflowRuns].slice(0, 30)))
    startStep(run.id, '')
    return run.id
  })
  ipcMain.handle('workflows:stop', (_e, runId: string) => save((s) => {
    const r = s.workflowRuns.find((x) => x.id === runId)
    if (r && r.status === 'running') r.status = 'stopped'
  }))
  /** agentId -> run waiting for that agent's turn to finish */
  const waitingRun = new Map<string, { runId: string; since: number }>()

  function startStep(runId: string, previous: string): void {
    const run = getState().workflowRuns.find((x) => x.id === runId)
    const w = run && getState().workflows.find((x) => x.id === run.workflowId)
    if (!run || !w || run.status !== 'running') return
    const step = w.steps[run.step]
    if (!step) {
      save((s) => (s.workflowRuns.find((x) => x.id === runId)!.status = 'done'))
      notify(`✅ ${w.name} finished`, `${w.steps.length} steps done`)
      return
    }
    const a = getState().agents.find((x) => x.id === step.agentId)
    if (!a) {
      save((s) => (s.workflowRuns.find((x) => x.id === runId)!.status = 'failed'))
      return
    }
    const text =
      `[Workflow "${w.name}" – step ${run.step + 1} of ${w.steps.length}]\n` +
      step.prompt.replace(/\{\{input\}\}/g, run.input).replace(/\{\{previous\}\}/g, previous || '(nothing yet)')
    waitingRun.set(a.id, { runId, since: Date.now() })
    if (agents.isRunning(a.id)) agents.deliver(a.id, text)
    else ctx.startAgent(a.id, false, text)
  }

  async function lastReply(a: Agent): Promise<string> {
    const t = a.sessions?.[a.sessions.length - 1]
    if (a.providerId === 'claude' && t) {
      const conv = await readConversation(t)
      const last = [...conv.items].reverse().find((i) => i.kind === 'assistant')
      if (last) return last.text.slice(-4000)
    }
    return agents.screenLines(a.id, 40).join('\n').slice(-4000)
  }

  async function stepDone(agentId: string): Promise<void> {
    const w8 = waitingRun.get(agentId)
    if (!w8 || Date.now() - w8.since < 4000) return
    waitingRun.delete(agentId)
    const a = getState().agents.find((x) => x.id === agentId)
    if (!a) return
    const output = await lastReply(a)
    const runId = w8.runId
    save((s) => {
      const r = s.workflowRuns.find((x) => x.id === runId)
      if (!r || r.status !== 'running') return
      r.log.push({ step: r.step, agentId, output, at: Date.now() })
      r.step++
    })
    startStep(runId, output)
  }

  // ---------- plan review ----------
  const plans = new Map<string, PlanReview>()
  ipcMain.handle('plans:list', () => [...plans.values()])
  ipcMain.handle('plans:decide', (_e, agentId: string, decision: 'approve' | 'revise', feedback?: string) => {
    plans.delete(agentId)
    ctx.send('plan:cleared', agentId)
    if (!agents.isRunning(agentId)) throw new Error('Agent is not running')
    if (decision === 'approve') {
      agents.write(agentId, '\r') // "Yes" is the highlighted choice in Claude's plan prompt
      return
    }
    agents.write(agentId, '\x1b') // reject the plan, stay in plan mode
    setTimeout(() => agents.deliver(agentId, `Please revise the plan:\n\n${feedback ?? ''}`), 900)
  })

  ipcMain.handle('agent:planMode', (_e, id: string) => {
    const a = ctx.findAgent(id)
    if (a.providerId !== 'claude') throw new Error('Plan mode is a Claude Code feature')
    const go = (): void => ctx.startAgent(id, true, undefined, '--permission-mode plan')
    if (agents.isRunning(id)) agents.restart(id, go)
    else go()
  })

  // ---------- conflicts ----------
  let conflicts: Conflict[] = []
  ipcMain.handle('conflicts:list', () => conflicts)
  async function scanConflicts(): Promise<void> {
    const out: Conflict[] = []
    for (const p of getState().projects) {
      const isolated = getState().agents.filter((a) => a.projectId === p.id && a.worktreePath && existsSync(a.worktreePath))
      if (isolated.length < 2) continue
      const base = await git.currentBranch(p.path)
      if (!base) continue
      const byFile = new Map<string, string[]>()
      for (const a of isolated) {
        try {
          const sum = await git.branchSummary(a.worktreePath!, base)
          for (const f of sum.files) byFile.set(f.path, [...(byFile.get(f.path) ?? []), a.id])
        } catch {
          /* ignore */
        }
      }
      for (const [file, ids] of byFile) if (ids.length > 1) out.push({ file, agentIds: ids })
    }
    const key = (c: Conflict[]): string => c.map((x) => x.file + x.agentIds.join()).sort().join('|')
    const fresh = out.filter((c) => !conflicts.some((o) => o.file === c.file && o.agentIds.join() === c.agentIds.join()))
    if (key(out) !== key(conflicts)) {
      conflicts = out
      ctx.send('conflicts', conflicts)
      if (fresh.length) {
        const names = (ids: string[]): string => ids.map((id) => getState().agents.find((a) => a.id === id)?.name ?? '?').join(' & ')
        notify('⚠️ Agents are editing the same files', fresh.slice(0, 3).map((c) => `${c.file} – ${names(c.agentIds)}`).join('\n'))
      }
    }
  }

  // ---------- budget ----------
  const alerted = new Map<string, Set<number>>() // `${project}:${day}` -> thresholds alerted
  const spend = new Map<string, number>()
  ipcMain.handle('budget:today', () => Object.fromEntries(spend))
  async function checkBudgets(): Promise<void> {
    const today = dayKey()
    for (const p of getState().projects) {
      const limit = ps(p.id).dailyBudget
      if (!limit) {
        spend.delete(p.id)
        continue
      }
      const list = getState().agents.filter((a) => a.projectId === p.id)
      const rep = await usageReport(list, [], () => 0)
      const cost = rep.agents.reduce((s, a) => s + (a.days[today] ?? 0), 0)
      spend.set(p.id, cost)
      const k = `${p.id}:${today}`
      const done = alerted.get(k) ?? new Set<number>()
      for (const th of [0.5, 0.75, 1]) {
        if (cost < limit * th || done.has(th)) continue
        done.add(th)
        if (th < 1) notify(`💸 ${p.name}: ${Math.round(th * 100)}% of today's budget`, `$${cost.toFixed(2)} of $${limit.toFixed(2)} (estimated)`)
        else {
          const running = list.filter((a) => agents.isRunning(a.id))
          for (const a of running) agents.pauseAfterTurn(a.id)
          notify(`🛑 ${p.name}: daily budget reached`, `$${cost.toFixed(2)} of $${limit.toFixed(2)} – pausing ${running.length} agent(s) after their current turn.`)
        }
      }
      alerted.set(k, done)
    }
    ctx.send('budget', Object.fromEntries(spend))
  }

  const t1 = setInterval(() => scanConflicts().catch(() => undefined), 45_000)
  const t2 = setInterval(() => checkBudgets().catch(() => undefined), 60_000)
  setTimeout(() => {
    scanConflicts().catch(() => undefined)
    checkBudgets().catch(() => undefined)
  }, 5000)

  return {
    onRuntime(rt) {
      const prev = prevStatus.get(rt.agentId)
      prevStatus.set(rt.agentId, rt.status)
      // a turn just ended: working -> waiting
      if (prev === 'working' && rt.status === 'waiting' && rt.running && !rt.queue?.length) {
        const a = getState().agents.find((x) => x.id === rt.agentId)
        if (!a) return
        if (waitingRun.has(a.id)) stepDone(a.id).catch(() => undefined)
        else if (ps(a.projectId).testGuard)
          changedSinceLast(a).then((changed) => (changed ? runTests(a) : null)).catch(() => undefined)
      }
    },
    onHook(agentId, event, payload) {
      if (event !== 'PreToolUse' || payload.tool_name !== 'ExitPlanMode') return
      const plan = String(payload.tool_input?.plan ?? '').trim()
      if (!plan) return
      const p: PlanReview = { agentId, plan, at: Date.now() }
      plans.set(agentId, p)
      ctx.send('plan:ready', p)
      const a = getState().agents.find((x) => x.id === agentId)
      notify(`📝 ${a?.name ?? 'Agent'} has a plan for you`, 'Open it to comment, edit and approve or send back.', agentId)
    },
    dispose() {
      clearInterval(t1)
      clearInterval(t2)
    }
  }
}
