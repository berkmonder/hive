/**
 * Runs each agent's CLI inside its own pseudo-terminal and tracks its status.
 *
 * Status sources (most precise wins):
 *  1. Hook events from Claude Code (Stop / Notification => waiting, UserPromptSubmit / PreToolUse => working)
 *  2. Output activity heuristic: output => working, N seconds of silence => waiting
 *  3. Process exit => idle (stopped by you) / done (code 0) / error (with a readable reason)
 */
import * as pty from 'node-pty'
import { Agent, AgentRuntime, AgentStatus, Provider, QueuedMessage } from '@shared/types'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import type { HookEvent } from './hooks'
import { exitReason, pickActivity } from '@shared/text'
import { Terminal as Screen } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'

const IDLE_MS = 4000
const BUFFER_LIMIT = 300_000 // chars of scrollback kept for re-attaching terminals

interface Session {
  pty: pty.IPty
  buffer: string
  /** headless terminal mirroring what the user sees, for reading the screen */
  screen: Screen
  /** turns the headless screen into a clean snapshot for terminals that attach later */
  ser: SerializeAddon
  activityDirty: boolean
  activity: string
  runtime: AgentRuntime
  hookDriven: boolean
  /** CLI id (claude / codex / gemini / …) */
  providerId: string
  pendingPrompt?: string
  /** messages typed in one by one whenever the agent is free */
  queue: QueuedMessage[]
  /** stop after the current turn (project pause) */
  pauseRequested?: boolean
  command: string
  resumed: boolean
  startedAt: number
  /** set when the user pressed Stop, so the exit is not reported as an error */
  stopRequested?: boolean
  /** start again right after exit (Restart) */
  restartWith?: () => void
}

export interface AgentManagerEvents {
  onData: (agentId: string, data: string) => void
  onRuntime: (rt: AgentRuntime) => void
  /** short description of what the agent is doing right now (for lists / room) */
  onActivity: (agentId: string, text: string) => void
  /** a working stretch finished (ms) */
  onWorked?: (agentId: string, ms: number) => void
  /** `--continue` / `resume` failed quickly (e.g. no previous conversation) */
  onResumeFailed: (agentId: string) => void
  /** a pause request finished: the agent's turn ended and it was stopped */
  onPaused?: (agentId: string) => void
}

export class AgentManager {
  private sessions = new Map<string, Session>()
  private runtimes = new Map<string, AgentRuntime>()
  private timer: NodeJS.Timeout

  constructor(
    private events: AgentManagerEvents,
    private env: { hookPort: number; claudeSettingsFile: string | null; claudeSettingsJson?: () => string }
  ) {
    this.timer = setInterval(() => this.tick(), 1000)
  }

  dispose(): void {
    clearInterval(this.timer)
    for (const s of this.sessions.values()) {
      try {
        s.pty.kill()
      } catch {
        /* ignore */
      }
    }
  }

  runtime(agentId: string): AgentRuntime {
    return (
      this.runtimes.get(agentId) ?? { agentId, status: 'idle', running: false, lastActivity: 0 }
    )
  }

  allRuntimes(): AgentRuntime[] {
    return [...this.runtimes.values()]
  }

  /**
   * What a terminal that attaches now should show: a snapshot of the current screen,
   * scrollback and terminal modes (not the raw byte history – replaying that into a
   * terminal of another size garbles TUIs like Claude Code).
   */
  async buffer(agentId: string): Promise<{ data: string; cols: number; rows: number }> {
    const s = this.sessions.get(agentId)
    if (!s) return { data: this.lastBuffers.get(agentId) ?? '', cols: 0, rows: 0 }
    await new Promise<void>((r) => s.screen.write('', () => r())) // let the parser catch up
    try {
      return { data: s.ser.serialize({ scrollback: 2000 }), cols: s.screen.cols, rows: s.screen.rows }
    } catch {
      return { data: s.buffer, cols: 0, rows: 0 }
    }
  }

  private lastBuffers = new Map<string, string>()

  /** secret values hidden from terminal output shown in Hive */
  private redact: string[] = []
  setRedactions(values: string[]): void {
    this.redact = values
  }

  start(agent: Agent, provider: Provider, cwd: string, opts: { resume?: boolean; prompt?: string; extraArgs?: string; env?: Record<string, string>; ssh?: { host: string; path: string } } = {}): void {
    if (this.sessions.has(agent.id)) return

    const isWin = process.platform === 'win32'
    let cmd = provider.command.trim()
    if (cmd && provider.id === 'claude' && opts.ssh && this.env.claudeSettingsJson?.())
      cmd += ` --settings ${quote(this.env.claudeSettingsJson(), false)}` // the file only exists here
    else if (cmd && provider.id === 'claude' && this.env.claudeSettingsFile)
      cmd += ` --settings ${quote(this.env.claudeSettingsFile, false)}`
    // Codex calls `notify` after every turn – our "Stop" hook
    if (cmd && provider.id === 'codex')
      cmd += ` -c ${quote('notify=["bash","-c","curl -s -m 2 -X POST --data-binary \\"$1\\" http://127.0.0.1:$HIVE_PORT/hook/$HIVE_AGENT_ID/Stop >/dev/null 2>&1 || true","hive"]', false)}`
    if (cmd && opts.extraArgs) cmd += ` ${opts.extraArgs}`
    if (cmd && opts.resume && provider.resumeArgs) cmd += ` ${provider.resumeArgs}`

    let pendingPrompt = opts.prompt?.trim() || (!opts.resume && agent.initialPrompt?.trim() ? agent.initialPrompt.trim() : undefined)
    if (cmd && pendingPrompt && provider.promptArg !== undefined) {
      cmd += ` ${provider.promptArg ? provider.promptArg + ' ' : ''}${quote(pendingPrompt, isWin)}`
      pendingPrompt = undefined
    }

    // remote agent: run over SSH; -R forwards the hook / MCP port back to Hive
    if (opts.ssh) {
      const p = this.env.hookPort
      const remote = `cd ${quote(opts.ssh.path || '.', false)} && HIVE_PORT=${p} HIVE_AGENT_ID=${agent.id} HIVE_AGENT_NAME=${quote(agent.name, false)} exec "$SHELL" -lic ${quote(cmd || 'exec "$SHELL" -l', false)}`
      cmd = `ssh -tt -o ServerAliveInterval=30 -o ExitOnForwardFailure=no -R ${p}:127.0.0.1:${p} ${quote(opts.ssh.host, false)} ${quote(remote, false)}`
      cwd = homedir()
    }

    let file: string
    let args: string[]
    if (isWin) {
      file = 'powershell.exe'
      args = cmd ? ['-NoLogo', '-NoExit', '-Command', cmd] : ['-NoLogo']
    } else {
      // login + interactive shell so PATH from .zshrc/.bashrc (nvm, brew...) is available
      // even when the app is launched from Finder/Dock.
      file = process.env.SHELL || '/bin/zsh'
      args = cmd ? ['-l', '-i', '-c', cmd] : ['-l', '-i']
    }

    const term = pty.spawn(file, args, {
      name: 'xterm-256color',
      // start at the size the agent's view had last time, so the CLI draws for the right width
      cols: this.sizes.get(agent.id)?.cols ?? 120,
      rows: this.sizes.get(agent.id)?.rows ?? 32,
      cwd,
      env: {
        ...process.env,
        ...utf8Locale(),
        ...opts.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        HIVE_PORT: String(this.env.hookPort),
        HIVE_AGENT_ID: agent.id,
        HIVE_AGENT_NAME: agent.name
      } as Record<string, string>
    })

    const session: Session = {
      pty: term,
      buffer: '',
      screen: new Screen({ cols: this.sizes.get(agent.id)?.cols ?? 120, rows: this.sizes.get(agent.id)?.rows ?? 32, scrollback: 2000, allowProposedApi: true }),
      ser: new SerializeAddon(),
      activityDirty: false,
      activity: '',
      hookDriven: false,
      providerId: provider.id,
      pendingPrompt,
      queue: [],
      command: cmd,
      resumed: !!opts.resume,
      startedAt: Date.now(),
      runtime: { agentId: agent.id, status: 'working', running: true, lastActivity: Date.now() }
    }
    session.screen.loadAddon(session.ser as unknown as Parameters<Screen['loadAddon']>[0])
    this.sessions.set(agent.id, session)
    this.setRuntime(session.runtime)
    // a task handed over on the command line counts as delivered now (gives the CLI time to start)
    if (opts.prompt) this.deliveredAt.set(agent.id, Date.now() + 4000)

    term.onData((raw) => {
      let data = raw
      for (const v of this.redact) if (data.includes(v)) data = data.split(v).join('••••••')
      session.buffer = (session.buffer + data).slice(-BUFFER_LIMIT)
      session.screen.write(data)
      session.activityDirty = true
      session.runtime.lastActivity = Date.now()
      if (!session.hookDriven && session.runtime.status !== 'working') this.setStatus(agent.id, 'working')
      this.events.onData(agent.id, data)
    })

    term.onExit(({ exitCode, signal }) => {
      if (this.sessions.get(agent.id) !== session) return // forgotten / replaced
      this.sessions.delete(agent.id)
      let snapshot = ''
      try {
        snapshot = session.ser.serialize({ scrollback: 2000 })
      } catch {
        snapshot = session.buffer
      }
      session.screen.dispose()
      const stopped = session.stopRequested || !!session.restartWith
      const quickResumeFail = session.resumed && exitCode !== 0 && !stopped && Date.now() - session.startedAt < 8000
      const note = stopped
        ? 'stopped'
        : quickResumeFail
          ? 'no previous session to resume – starting a new one'
          : `process exited with code ${exitCode}${signal ? ` (signal ${signal})` : ''}`
      // leave the alternate screen of a TUI so the note is readable, and reset the modes it set
      this.lastBuffers.set(agent.id, snapshot + `\x1b[?1049l\x1b[?25h\x1b[0m\r\n\x1b[90m[${note}]\x1b[0m\r\n`)

      const status: AgentStatus = stopped ? 'idle' : exitCode === 0 ? 'done' : 'error'
      this.setRuntime({
        agentId: agent.id,
        running: false,
        status,
        exitCode,
        exitReason: status === 'error' ? exitReason(exitCode, session.buffer.slice(-4000), session.command) : undefined,
        lastActivity: Date.now()
      })
      if (session.restartWith) session.restartWith()
      else if (quickResumeFail) this.events.onResumeFailed(agent.id)
    })
  }

  /** Type a message into the agent's CLI and press Enter. */
  private type(s: Session, text: string): void {
    s.pty.write(text.includes('\n') ? `\x1b[200~${text}\x1b[201~` : text)
    setTimeout(() => {
      if (this.sessions.get(s.runtime.agentId) === s) s.pty.write('\r')
    }, 150)
    this.deliveredAt.set(s.runtime.agentId, Date.now())
    if (!s.hookDriven) this.setStatus(s.runtime.agentId, 'working')
  }

  private deliveredAt = new Map<string, number>()

  /**
   * Hand a task to a running agent: typed right away if it is waiting for input,
   * otherwise queued and typed at its next quiet moment.
   */
  deliver(agentId: string, text: string, opts: { queueOnly?: boolean } = {}): 'sent' | 'queued' {
    const s = this.sessions.get(agentId)
    if (!s) throw new Error('Agent is not running')
    if (!opts.queueOnly && s.runtime.status === 'waiting' && !s.pendingPrompt && !s.queue.length) {
      this.type(s, text)
      return 'sent'
    }
    s.queue.push({ id: randomUUID(), text, at: Date.now() })
    this.emitQueue(s)
    return 'queued'
  }

  queue(agentId: string): QueuedMessage[] {
    return this.sessions.get(agentId)?.queue ?? []
  }

  /** remove / reorder / send-now for queued messages */
  editQueue(agentId: string, op: { remove?: string; up?: string; sendNow?: string; clear?: boolean; update?: { id: string; text: string } }): void {
    const s = this.sessions.get(agentId)
    if (!s) return
    const i = (id?: string): number => s.queue.findIndex((q) => q.id === id)
    if (op.clear) s.queue = []
    if (op.remove) s.queue = s.queue.filter((q) => q.id !== op.remove)
    if (op.update && i(op.update.id) >= 0) s.queue[i(op.update.id)].text = op.update.text
    if (op.up && i(op.up) > 0) {
      const k = i(op.up)
      ;[s.queue[k - 1], s.queue[k]] = [s.queue[k], s.queue[k - 1]]
    }
    if (op.sendNow && i(op.sendNow) >= 0) {
      const [m] = s.queue.splice(i(op.sendNow), 1)
      this.type(s, m.text)
    }
    this.emitQueue(s)
  }

  private emitQueue(s: Session): void {
    s.runtime = { ...s.runtime, queue: [...s.queue], pausing: !!s.pauseRequested }
    this.runtimes.set(s.runtime.agentId, s.runtime)
    this.events.onRuntime(s.runtime)
  }

  /** Stop the agent as soon as its current turn is over (queued messages are kept for later). */
  pauseAfterTurn(agentId: string): boolean {
    const s = this.sessions.get(agentId)
    if (!s) return false
    s.pauseRequested = true
    this.emitQueue(s)
    return true
  }

  cancelPause(agentId: string): void {
    const s = this.sessions.get(agentId)
    if (!s) return
    s.pauseRequested = false
    this.emitQueue(s)
  }

  startedAt(agentId: string): number | undefined {
    return this.sessions.get(agentId)?.startedAt
  }

  pid(agentId: string): number | undefined {
    return this.sessions.get(agentId)?.pty.pid
  }

  runningIds(): string[] {
    return [...this.sessions.keys()]
  }

  /** True while a task was just handed over and the agent may not have picked it up yet. */
  isBusy(agentId: string): boolean {
    const s = this.sessions.get(agentId)
    if (!s) return false
    if (s.pendingPrompt || s.queue.length || s.runtime.status === 'working') return true
    return Date.now() - (this.deliveredAt.get(agentId) ?? 0) < 8000
  }

  isRunning(agentId: string): boolean {
    return this.sessions.has(agentId)
  }

  /** Stop and run `then` once the process is gone (used for Restart). */
  restart(agentId: string, then: () => void): void {
    const s = this.sessions.get(agentId)
    if (!s) return then()
    s.restartWith = then
    this.kill(s)
  }

  stop(agentId: string): void {
    const s = this.sessions.get(agentId)
    if (!s) return
    s.stopRequested = true
    this.kill(s)
  }

  private kill(s: Session): void {
    // ask nicely first (Ctrl+C twice is how most agent CLIs quit), then force
    try {
      s.pty.write('\x03')
      setTimeout(() => {
        if (this.sessions.get(s.runtime.agentId) === s) s.pty.write('\x03')
      }, 150)
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (this.sessions.get(s.runtime.agentId) !== s) return
      try {
        s.pty.kill()
      } catch {
        /* already dead */
      }
    }, 1200)
  }

  write(agentId: string, data: string): void {
    const s = this.sessions.get(agentId)
    if (!s) return
    s.pty.write(data)
    // user pressed Enter => agent is about to work
    if (data.includes('\r') && s.runtime.status === 'waiting') this.setStatus(agentId, 'working')
  }

  private sizes = new Map<string, { cols: number; rows: number }>()
  resize(agentId: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.sizes.set(agentId, { cols, rows })
    const s = this.sessions.get(agentId)
    if (s && cols > 0 && rows > 0 && (s.pty.cols !== cols || s.pty.rows !== rows)) {
      s.pty.resize(cols, rows)
      s.screen.resize(cols, rows)
    }
  }

  handleHook(agentId: string, event: HookEvent): void {
    const s = this.sessions.get(agentId)
    if (!s) return
    if (event === 'SessionStart') return
    // Codex only reports turn ends (notify) – keep reading the screen for "working"
    if (s.providerId !== 'claude') {
      if (event === 'Stop' && !s.pendingPrompt) this.setStatus(agentId, 'waiting')
      return
    }
    s.hookDriven = true
    if (event === 'Stop' || event === 'Notification') this.setStatus(agentId, 'waiting')
    else this.setStatus(agentId, 'working')
  }

  /** Last `n` non-empty rendered lines (scrollback + screen) – what a human would read. */
  screenLines(agentId: string, n = 60): string[] {
    const s = this.sessions.get(agentId)
    if (!s) return []
    const b = s.screen.buffer.active
    const out: string[] = []
    for (let i = b.length - 1; i >= 0 && out.length < n; i--) {
      const line = b.getLine(i)
      if (!line) continue
      // join soft-wrapped lines
      let text = line.translateToString(true)
      while (line.isWrapped && i > 0 && out.length < n) {
        const prev = b.getLine(--i)
        if (!prev) break
        text = prev.translateToString(true) + text
        if (!prev.isWrapped) break
      }
      if (text.trim()) out.unshift(text)
    }
    return out
  }

  private tick(): void {
    const now = Date.now()
    for (const [id, s] of this.sessions) {
      if (s.activityDirty) {
        s.activityDirty = false
        const a = pickActivity(this.screenLines(id, 80))
        if (a && a !== s.activity) {
          s.activity = a
          this.events.onActivity(id, a)
        }
      }
      // Codex / Gemini show "esc to interrupt / cancel" while they work: read the screen
      const tuiBusy = s.providerId === 'codex' || s.providerId === 'gemini' ? /esc to (interrupt|cancel)|\(esc to/i.test(this.screenLines(id, 10).join('\n')) : null
      if (tuiBusy === true && !s.pendingPrompt) {
        if (s.runtime.status !== 'working') this.setStatus(id, 'working')
        continue
      }
      const quiet = now - s.runtime.lastActivity > (tuiBusy === false ? 1500 : IDLE_MS)
      if (!quiet) continue
      // first quiet moment after start: CLI is ready -> type the initial prompt
      if (s.pendingPrompt) {
        const prompt = s.pendingPrompt
        s.pendingPrompt = undefined
        this.type(s, prompt)
        s.runtime.lastActivity = now
        continue
      }
      if (!s.hookDriven && s.runtime.status === 'working') this.setStatus(id, 'waiting')
    }
    // queued messages: one at a time, when the agent is free
    for (const s of this.sessions.values()) {
      const id = s.runtime.agentId
      const free = s.runtime.status === 'waiting' && now - s.runtime.lastActivity > 1500 && now - (this.deliveredAt.get(id) ?? 0) > 3000
      if (!free || s.pendingPrompt) continue
      if (s.pauseRequested) {
        s.pauseRequested = false
        s.stopRequested = true
        this.kill(s)
        this.events.onPaused?.(id)
        continue
      }
      const next = s.queue.shift()
      if (next) {
        this.type(s, next.text)
        this.emitQueue(s)
      }
    }
  }

  private setStatus(agentId: string, status: AgentStatus): void {
    const s = this.sessions.get(agentId)
    if (!s || s.runtime.status === status) return
    s.runtime = { ...s.runtime, status, queue: [...s.queue], pausing: !!s.pauseRequested }
    this.setRuntime(s.runtime)
  }

  // ---- time spent working ----
  private workingSince = new Map<string, number>()
  /** ms of the current, still running working stretch */
  currentWork(agentId: string): number {
    const t = this.workingSince.get(agentId)
    return t ? Date.now() - t : 0
  }

  private setRuntime(rt: AgentRuntime): void {
    const since = this.workingSince.get(rt.agentId)
    if (rt.status === 'working' && rt.running) {
      if (!since) this.workingSince.set(rt.agentId, Date.now())
    } else if (since) {
      this.workingSince.delete(rt.agentId)
      this.events.onWorked?.(rt.agentId, Date.now() - since)
    }
    this.runtimes.set(rt.agentId, rt)
    this.events.onRuntime(rt)
  }

  forget(agentId: string): void {
    const s = this.sessions.get(agentId)
    this.sessions.delete(agentId)
    try {
      s?.pty.kill()
    } catch {
      /* ignore */
    }
    this.runtimes.delete(agentId)
    this.lastBuffers.delete(agentId)
  }
}

/** Quote a single argument for a POSIX shell or PowerShell. */
function quote(s: string, powershell: boolean): string {
  return powershell ? `'${s.replace(/'/g, "''")}'` : `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * Apps started from Finder/Dock (and some terminals like Warp) often have no LANG,
 * which makes shells treat ı, ş, ğ… as raw bytes. Force a UTF-8 locale, keeping the
 * user's language if they already have one (e.g. tr_TR.UTF-8).
 */
export function utf8Locale(): Record<string, string> {
  if (process.platform === 'win32') return {}
  const cur = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || ''
  if (/utf-?8/i.test(cur)) return {}
  let lang = 'en_US'
  try {
    const sys = Intl.DateTimeFormat().resolvedOptions().locale.replace('-', '_') // e.g. tr_TR
    if (/^[a-z]{2}_[A-Z]{2}$/.test(sys)) lang = sys
  } catch {
    /* keep en_US */
  }
  const utf8 = `${lang}.UTF-8`
  return { LANG: utf8, LC_CTYPE: utf8, ...(process.env.LC_ALL ? { LC_ALL: utf8 } : {}) }
}
