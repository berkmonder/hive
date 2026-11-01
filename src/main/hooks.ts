/**
 * Tiny local HTTP server that receives lifecycle events from agent CLIs.
 *
 * Claude Code is launched with `--settings <file>` pointing to a generated
 * settings file whose hooks `curl` this server. That gives us a precise signal
 * for "agent finished / is waiting for you" instead of guessing from output.
 */
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { app } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'

export type HookEvent = 'Stop' | 'Notification' | 'UserPromptSubmit' | 'PreToolUse' | 'SessionStart'

let server: Server | null = null
let port = 0

export type HttpHandler = (req: IncomingMessage, res: ServerResponse) => boolean

export interface HookPayload {
  session_id?: string
  transcript_path?: string
  cwd?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
}

export function startHookServer(onEvent: (agentId: string, event: HookEvent, payload: HookPayload) => void, extra?: HttpHandler): Promise<number> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      if (extra?.(req, res)) return
      // POST|GET /hook/<agentId>/<event>
      const m = req.url?.match(/^\/hook\/([\w-]+)\/(\w+)/)
      let body = ''
      req.on('data', (c) => body.length < 1_000_000 && (body += c))
      req.on('end', () => {
        let payload: HookPayload = {}
        try {
          payload = body ? JSON.parse(body) : {}
        } catch {
          /* not JSON */
        }
        if (m) onEvent(m[1], m[2] as HookEvent, payload)
        res.writeHead(m ? 204 : 404).end()
      })
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      port = typeof addr === 'object' && addr ? addr.port : 0
      resolve(port)
    })
  })
}

export function getHookPort(): number {
  return port
}

export function stopHookServer(): void {
  server?.close()
  server = null
}

/** Writes the Claude Code settings file that wires hooks to this server. */
export function writeClaudeHookSettings(): string | null {
  if (process.platform === 'win32') return null // env-var syntax differs; idle detection is used instead
  const curl = (event: HookEvent): string =>
    // forward the hook's JSON (session id, transcript path…) from stdin
    `curl -s -m 2 -X POST -H 'Content-Type: application/json' --data-binary @- "http://127.0.0.1:$HIVE_PORT/hook/$HIVE_AGENT_ID/${event}" >/dev/null 2>&1 || true`
  const hook = (event: HookEvent, matcher?: string): unknown => [
    { ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: curl(event) }] }
  ]
  const settings = {
    hooks: {
      Stop: hook('Stop'),
      Notification: hook('Notification'),
      UserPromptSubmit: hook('UserPromptSubmit'),
      PreToolUse: hook('PreToolUse', '*'),
      SessionStart: hook('SessionStart')
    }
  }
  const file = join(app.getPath('userData'), 'claude-hooks.json')
  writeFileSync(file, JSON.stringify(settings, null, 2))
  return file
}
