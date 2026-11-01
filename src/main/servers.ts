/**
 * Dev servers ("npm run dev", "dotnet watch run", …) running next to the agents.
 * Each runs in its own pty; the first local URL it prints is picked up for the preview.
 */
import * as pty from 'node-pty'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { DevServer, ServerRuntime } from '@shared/types'

const BUFFER_LIMIT = 200_000
const URL_RE = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|[\w-]+\.local)(?::\d{2,5})?(?:\/[^\s'"`<>)\]]*)?/g
const strip = (s: string): string =>
  s.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b[@-_]/g, '')

interface Proc {
  pty: pty.IPty
  buffer: string
  runtime: ServerRuntime
  scan: string
  stopRequested?: boolean
}

export class ServerManager {
  private procs = new Map<string, Proc>()
  private runtimes = new Map<string, ServerRuntime>()
  private buffers = new Map<string, string>()

  constructor(private events: { onData: (id: string, data: string) => void; onRuntime: (rt: ServerRuntime) => void }) {}

  all(): ServerRuntime[] {
    return [...this.runtimes.values()]
  }

  buffer(id: string): string {
    return this.procs.get(id)?.buffer ?? this.buffers.get(id) ?? ''
  }

  isRunning(id: string): boolean {
    return this.procs.has(id)
  }

  start(server: DevServer, cwd: string, env: Record<string, string>): void {
    if (this.procs.has(server.id)) return
    if (!existsSync(cwd)) throw new Error(`Folder not found: ${cwd}`)
    const isWin = process.platform === 'win32'
    const file = isWin ? 'powershell.exe' : process.env.SHELL || '/bin/zsh'
    const args = isWin ? ['-NoLogo', '-Command', server.command] : ['-l', '-i', '-c', server.command]
    const term = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env, ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '1', BROWSER: 'none' } as Record<string, string>
    })
    const p: Proc = { pty: term, buffer: '', scan: '', runtime: { serverId: server.id, running: true, startedAt: Date.now() } }
    this.procs.set(server.id, p)
    this.set(p.runtime)

    term.onData((data) => {
      p.buffer = (p.buffer + data).slice(-BUFFER_LIMIT)
      this.events.onData(server.id, data)
      // look for the local URL (prefer localhost over network addresses)
      p.scan = (p.scan + strip(data)).slice(-4000)
      const found = [...p.scan.matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:]+$/, '').replace('0.0.0.0', 'localhost').replace(/\[::1?\]/, 'localhost'))
      if (found.length) {
        const best = found.find((u) => /localhost|127\.0\.0\.1/.test(u)) ?? found[0]
        if (!p.runtime.url || (!/localhost|127\.0\.0\.1/.test(p.runtime.url) && /localhost|127\.0\.0\.1/.test(best))) {
          p.runtime = { ...p.runtime, url: best }
          this.set(p.runtime)
        }
      }
    })
    term.onExit(({ exitCode }) => {
      if (this.procs.get(server.id) !== p) return
      this.procs.delete(server.id)
      this.buffers.set(server.id, p.buffer + `\r\n\x1b[90m[${p.stopRequested ? 'stopped' : `exited with code ${exitCode}`}]\x1b[0m\r\n`)
      this.set({ serverId: server.id, running: false, url: p.runtime.url, exitCode: p.stopRequested ? undefined : exitCode })
    })
  }

  stop(id: string): void {
    const p = this.procs.get(id)
    if (!p) return
    p.stopRequested = true
    try {
      p.pty.write('\x03')
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (this.procs.get(id) !== p) return
      try {
        p.pty.kill()
      } catch {
        /* already gone */
      }
    }, 1500)
  }

  write(id: string, data: string): void {
    this.procs.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const p = this.procs.get(id)
    if (p && cols > 0 && rows > 0) p.pty.resize(cols, rows)
  }

  forget(id: string): void {
    const p = this.procs.get(id)
    this.procs.delete(id)
    this.runtimes.delete(id)
    this.buffers.delete(id)
    try {
      p?.pty.kill()
    } catch {
      /* ignore */
    }
  }

  dispose(): void {
    for (const p of this.procs.values()) {
      try {
        p.pty.kill()
      } catch {
        /* ignore */
      }
    }
  }

  private set(rt: ServerRuntime): void {
    this.runtimes.set(rt.serverId, rt)
    this.events.onRuntime(rt)
  }
}

/** Guess useful dev commands for a project (package.json scripts, .NET, Python, Docker). */
export function suggestServers(root: string): { name: string; command: string; cwd: string }[] {
  const out: { name: string; command: string; cwd: string }[] = []
  const dirs = ['', ...['frontend', 'client', 'web', 'app', 'ui', 'backend', 'server', 'api', 'src'].filter((d) => existsSync(join(root, d)))]
  for (const d of dirs) {
    const dir = join(root, d)
    const label = d ? `${d}: ` : ''
    const pj = join(dir, 'package.json')
    if (existsSync(pj)) {
      try {
        const scripts = (JSON.parse(readFileSync(pj, 'utf8')).scripts ?? {}) as Record<string, string>
        const pm = existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(dir, 'yarn.lock')) ? 'yarn' : existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock')) ? 'bun run' : 'npm run'
        for (const s of ['dev', 'start', 'serve', 'watch', 'storybook', 'preview']) if (scripts[s]) out.push({ name: `${label}${s}`, command: `${pm} ${s}`, cwd: d })
      } catch {
        /* bad package.json */
      }
    }
    try {
      const entries = readdirSync(dir)
      const csproj = entries.find((f) => f.endsWith('.csproj'))
      if (csproj) out.push({ name: `${label}dotnet watch`, command: `dotnet watch run --project ${csproj}`, cwd: d })
      if (entries.includes('manage.py')) out.push({ name: `${label}django`, command: 'python manage.py runserver', cwd: d })
      if (entries.some((f) => /^(docker-)?compose\.ya?ml$/.test(f))) out.push({ name: `${label}docker compose`, command: 'docker compose up', cwd: d })
    } catch {
      /* unreadable */
    }
  }
  // .NET solutions: web projects one level down
  try {
    for (const sub of readdirSync(root, { withFileTypes: true })) {
      if (!sub.isDirectory() || sub.name.startsWith('.') || sub.name === 'node_modules') continue
      const files = readdirSync(join(root, sub.name))
      const csproj = files.find((f) => f.endsWith('.csproj'))
      if (csproj && /Sdk="Microsoft\.NET\.Sdk\.Web"/.test(readFileSync(join(root, sub.name, csproj), 'utf8')))
        out.push({ name: `${sub.name} (dotnet watch)`, command: 'dotnet watch run', cwd: sub.name })
    }
  } catch {
    /* ignore */
  }
  const seen = new Set<string>()
  return out.filter((s) => !seen.has(s.cwd + s.command) && seen.add(s.cwd + s.command))
}
