/**
 * Mock APIs: small local HTTP servers with fixed routes (templated JSON answers, status,
 * headers, delay), CORS for browsers, an optional fallback to the real backend with
 * "record" mode, and a live request log. Agents can add routes through Hive's MCP tools.
 */
import { ipcMain } from 'electron'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { randomUUID } from 'crypto'
import type { MockLogEntry, MockRoute, MockServer } from '@shared/types'
import { getState, updateState } from './store'
import { runClaude } from './ai'

type Send = (channel: string, payload: unknown) => void
const running = new Map<string, { server: Server; port: number }>()
const logs = new Map<string, MockLogEntry[]>()
let send: Send = () => undefined
let broadcast: () => void = () => undefined

const mocks = (): MockServer[] => getState().mocks ?? []
const save = (fn: (list: MockServer[]) => void): void => {
  updateState((s) => {
    s.mocks = s.mocks ?? []
    fn(s.mocks)
  })
  broadcast()
}

/** "/users/:id" matches "/users/42" -> { id: "42" }; "*" matches the rest */
function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.replace(/\/+$/, '') || '/'
  const a = path.replace(/\/+$/, '') || '/'
  if (p === '*' || p === '/*') return {}
  const ps = p.split('/')
  const as = a.split('/')
  const params: Record<string, string> = {}
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] === '*') return params
    if (i >= as.length) return null
    if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(as[i])
    else if (ps[i] !== as[i]) return null
  }
  return ps.length === as.length ? params : null
}

const pick = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)

function fill(tpl: string, ctx: { params: Record<string, string>; query: Record<string, string>; body: unknown }): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => {
    if (key === 'uuid') return randomUUID()
    if (key === 'now') return new Date().toISOString()
    if (key === 'timestamp') return String(Date.now())
    const [root, ...rest] = key.split('.')
    const src = root === 'params' ? ctx.params : root === 'query' ? ctx.query : root === 'body' ? ctx.body : undefined
    if (src === undefined) return m
    const v = rest.length ? pick(src, rest.join('.')) : src
    return v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  })
}

const headerLines = (s?: string): [string, string][] =>
  (s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes(':'))
    .map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()])

function log(e: MockLogEntry): void {
  const list = logs.get(e.mockId) ?? []
  list.push(e)
  if (list.length > 300) list.shift()
  logs.set(e.mockId, list)
  send('mock:log', e)
}

async function handle(m: MockServer, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const t0 = Date.now()
  const url = new URL(req.url ?? '/', 'http://localhost')
  const cors = {
    'Access-Control-Allow-Origin': String(req.headers.origin ?? '*'),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': String(req.headers['access-control-request-headers'] ?? '*')
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end()
    return
  }
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks)
  const text = raw.toString('utf8')
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    /* not JSON */
  }
  const cur = mocks().find((x) => x.id === m.id) ?? m
  const method = (req.method ?? 'GET').toUpperCase()
  let route: MockRoute | undefined
  let params: Record<string, string> = {}
  for (const r of cur.routes) {
    if (!r.enabled || (r.method !== 'ANY' && r.method.toUpperCase() !== method)) continue
    const p = match(r.path, url.pathname)
    if (p) {
      route = r
      params = p
      break
    }
  }
  const query = Object.fromEntries(url.searchParams)
  const delay = (route?.delayMs ?? 0) + (cur.latencyMs ?? 0)
  if (delay) await new Promise((r) => setTimeout(r, Math.min(delay, 60_000)))

  if (route) {
    const out = fill(route.body, { params, query, body })
    const hdrs = Object.fromEntries(headerLines(route.headers))
    const isJson = (() => {
      try {
        JSON.parse(out)
        return true
      } catch {
        return false
      }
    })()
    if (!Object.keys(hdrs).some((k) => k.toLowerCase() === 'content-type')) hdrs['Content-Type'] = isJson ? 'application/json' : 'text/plain; charset=utf-8'
    res.writeHead(route.status, { ...cors, ...hdrs }).end(out)
    log({ mockId: m.id, at: t0, method, path: url.pathname + url.search, status: route.status, ms: Date.now() - t0, routeId: route.id, body: text.slice(0, 2000) })
    return
  }

  if (cur.fallbackUrl) {
    try {
      const target = new URL(url.pathname + url.search, cur.fallbackUrl.replace(/\/?$/, '/'))
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'connection', 'content-length', 'accept-encoding'].includes(k)).map(([k, v]) => [k, String(v)]))
      const r = await fetch(target, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : raw })
      const buf = Buffer.from(await r.arrayBuffer())
      const out: Record<string, string> = { ...cors }
      r.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'access-control-allow-origin'].includes(k)) out[k] = v
      })
      res.writeHead(r.status, out).end(buf)
      log({ mockId: m.id, at: t0, method, path: url.pathname + url.search, status: r.status, ms: Date.now() - t0, proxied: true, body: text.slice(0, 2000) })
      if (cur.record && buf.length < 500_000) {
        save((list) => {
          const x = list.find((y) => y.id === m.id)
          if (!x || x.routes.some((y) => y.method === method && y.path === url.pathname)) return
          x.routes.push({ id: randomUUID(), method, path: url.pathname, status: r.status, body: buf.toString('utf8'), headers: r.headers.get('content-type') ? `Content-Type: ${r.headers.get('content-type')}` : undefined, enabled: true, note: 'recorded' })
        })
      }
      return
    } catch (e) {
      res.writeHead(502, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Mock fallback failed', detail: (e as Error).message }))
      log({ mockId: m.id, at: t0, method, path: url.pathname + url.search, status: 502, ms: Date.now() - t0, proxied: true })
      return
    }
  }

  res.writeHead(404, { ...cors, 'Content-Type': 'application/json' }).end(
    JSON.stringify({ error: `No mock route for ${method} ${url.pathname}`, routes: cur.routes.filter((r) => r.enabled).map((r) => `${r.method} ${r.path}`) }, null, 2)
  )
  log({ mockId: m.id, at: t0, method, path: url.pathname + url.search, status: 404, ms: Date.now() - t0, body: text.slice(0, 2000) })
}

export function startMock(id: string): Promise<void> {
  const m = mocks().find((x) => x.id === id)
  if (!m) return Promise.reject(new Error('Unknown mock'))
  stopMock(id)
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handle(m, req, res).catch((e) => {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: String(e) }))
      })
    })
    server.once('error', (e: NodeJS.ErrnoException) => reject(new Error(e.code === 'EADDRINUSE' ? `Port ${m.port} is already in use` : e.message)))
    server.listen(m.port, '127.0.0.1', () => {
      running.set(id, { server, port: m.port })
      send('mock:state', mockState())
      resolve()
    })
  })
}
export function stopMock(id: string): void {
  const r = running.get(id)
  if (!r) return
  r.server.close()
  r.server.closeAllConnections?.()
  running.delete(id)
  send('mock:state', mockState())
}
const mockState = (): Record<string, boolean> => Object.fromEntries([...running.keys()].map((k) => [k, true]))
export const runningMocks = (projectId?: string): { name: string; url: string; routes: number }[] =>
  mocks()
    .filter((m) => running.has(m.id) && (!projectId || m.projectId === projectId))
    .map((m) => ({ name: m.name, url: `http://localhost:${m.port}`, routes: m.routes.length }))

const freePort = (): number => {
  const used = new Set(mocks().map((m) => m.port))
  let p = 4010
  while (used.has(p)) p++
  return p
}

/** OpenAPI 3 / Swagger 2 JSON -> routes with example answers */
function fromOpenApi(text: string): MockRoute[] {
  const spec = JSON.parse(text) as { paths?: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }>; schema?: unknown }>; examples?: Record<string, unknown>; schema?: unknown }> }>>; components?: { schemas?: Record<string, unknown> }; definitions?: Record<string, unknown> }
  const refs = { ...(spec.components?.schemas ?? {}), ...(spec.definitions ?? {}) } as Record<string, unknown>
  const sample = (sc: unknown, depth = 0): unknown => {
    if (!sc || typeof sc !== 'object' || depth > 6) return null
    const s = sc as Record<string, unknown>
    if (s.$ref) return sample(refs[String(s.$ref).split('/').pop()!], depth + 1)
    if (s.example !== undefined) return s.example
    if (Array.isArray(s.enum)) return s.enum[0]
    if (s.allOf) return Object.assign({}, ...(s.allOf as unknown[]).map((x) => sample(x, depth + 1) as object))
    if (s.oneOf || s.anyOf) return sample(((s.oneOf ?? s.anyOf) as unknown[])[0], depth + 1)
    switch (s.type) {
      case 'array':
        return [sample(s.items, depth + 1)]
      case 'integer':
      case 'number':
        return 1
      case 'boolean':
        return true
      case 'string':
        return s.format === 'date-time' ? new Date().toISOString() : s.format === 'uuid' ? randomUUID() : s.format === 'email' ? 'user@example.com' : 'string'
      default:
        if (s.properties) return Object.fromEntries(Object.entries(s.properties as Record<string, unknown>).map(([k, v]) => [k, sample(v, depth + 1)]))
        return {}
    }
  }
  const out: MockRoute[] = []
  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(ops)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
      const codes = Object.keys(op.responses ?? {})
      const code = codes.find((c) => /^2/.test(c)) ?? codes[0] ?? '200'
      const r = op.responses?.[code]
      const c = r?.content?.['application/json'] ?? Object.values(r?.content ?? {})[0]
      const ex = c?.example ?? Object.values(c?.examples ?? {})[0]?.value ?? Object.values(r?.examples ?? {})[0] ?? sample(c?.schema ?? r?.schema)
      out.push({ id: randomUUID(), method: method.toUpperCase(), path: path.replace(/\{(\w+)\}/g, ':$1'), status: Number(code) || 200, body: ex === undefined || ex === null ? '' : JSON.stringify(ex, null, 2), enabled: true, note: 'from OpenAPI' })
    }
  }
  return out
}

export function registerMocks(ctx: { send: Send; broadcastState: () => void }): { dispose: () => void } {
  send = ctx.send
  broadcast = ctx.broadcastState
  ipcMain.handle('mocks:save', (_e, m: MockServer) =>
    save((list) => {
      const i = list.findIndex((x) => x.id === m.id)
      if (i >= 0) list[i] = m
      else list.push(m)
    })
  )
  ipcMain.handle('mocks:remove', (_e, id: string) => {
    stopMock(id)
    save((list) => list.splice(0, list.length, ...list.filter((x) => x.id !== id)))
  })
  ipcMain.handle('mocks:start', (_e, id: string) => startMock(id))
  ipcMain.handle('mocks:stop', (_e, id: string) => stopMock(id))
  ipcMain.handle('mocks:state', () => mockState())
  ipcMain.handle('mocks:logs', (_e, id: string) => logs.get(id) ?? [])
  ipcMain.handle('mocks:clearLogs', (_e, id: string) => logs.set(id, []))
  ipcMain.handle('mocks:freePort', () => freePort())
  ipcMain.handle('mocks:try', async (_e, url: string, method: string, body?: string) => {
    const t0 = Date.now()
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body })
    const text = await r.text()
    return { status: r.status, ms: Date.now() - t0, text: text.slice(0, 5000) }
  })
  ipcMain.handle('mocks:openapi', (_e, id: string, text: string) => {
    const routes = fromOpenApi(text)
    if (!routes.length) throw new Error('No paths found in that OpenAPI document (JSON)')
    save((list) => {
      const m = list.find((x) => x.id === id)
      if (!m) return
      for (const r of routes) if (!m.routes.some((x) => x.method === r.method && x.path === r.path)) m.routes.push(r)
    })
    return routes.length
  })
  ipcMain.handle('mocks:generate', async (_e, id: string, description: string) => {
    const out = await runClaude(
      `Design mock API routes for this description. Answer with a JSON array only, no prose. Each item: {"method":"GET|POST|PUT|PATCH|DELETE","path":"/users/:id","status":200,"body":<realistic JSON answer>}. ` +
        `Use :params for ids; you may use {{params.id}}, {{query.q}}, {{body.name}}, {{uuid}}, {{now}} inside string values. Include list, detail, create, update, delete and one error case where it makes sense.\n\nDescription:\n${description.slice(0, 4000)}`,
      { args: '--model haiku', timeoutMs: 120_000 }
    )
    const json = out.match(/\[[\s\S]*\]/)?.[0]
    if (!json) throw new Error('Claude did not return routes – try a more concrete description')
    const items = JSON.parse(json) as { method?: string; path?: string; status?: number; body?: unknown }[]
    const routes: MockRoute[] = items
      .filter((x) => x.path)
      .map((x) => ({ id: randomUUID(), method: String(x.method ?? 'GET').toUpperCase(), path: String(x.path), status: Number(x.status) || 200, body: typeof x.body === 'string' ? x.body : JSON.stringify(x.body ?? {}, null, 2), enabled: true, note: 'generated' }))
    save((list) => {
      const m = list.find((x) => x.id === id)
      if (m) m.routes.push(...routes)
    })
    return routes.length
  })
  // mocks marked "start with Hive"
  setTimeout(() => {
    for (const m of mocks()) if (m.autoStart) startMock(m.id).catch((e) => console.warn('[mock]', m.name, e.message))
  }, 1500)
  return { dispose: () => [...running.keys()].forEach(stopMock) }
}

// ---------- MCP tools for agents ----------
export const MOCK_TOOLS = [
  { name: 'mock_list', description: "List Hive's mock API servers of this project with their URL and routes.", inputSchema: { type: 'object', properties: {} } },
  {
    name: 'mock_route',
    description: 'Add or replace a route on a mock API (created and started if it does not exist). Use it to fake a backend the frontend needs. body may use {{params.id}}, {{query.x}}, {{body.x}}, {{uuid}}, {{now}}.',
    inputSchema: {
      type: 'object',
      properties: { mock: { type: 'string', description: 'mock server name' }, method: { type: 'string' }, path: { type: 'string' }, status: { type: 'number' }, body: { type: 'string' }, headers: { type: 'string', description: '"Header: value" per line' }, delayMs: { type: 'number' } },
      required: ['mock', 'method', 'path', 'body']
    }
  },
  { name: 'mock_logs', description: 'Recent requests a mock API received (method, path, status, request body) – to check what the app actually calls.', inputSchema: { type: 'object', properties: { mock: { type: 'string' } }, required: ['mock'] } }
]

export async function mockTool(projectId: string, name: string, args: Record<string, unknown>): Promise<string> {
  const mine = mocks().filter((m) => m.projectId === projectId)
  const find = (n: unknown): MockServer | undefined => mine.find((m) => m.name.toLowerCase() === String(n ?? '').toLowerCase())
  if (name === 'mock_list') {
    if (!mine.length) return 'No mock APIs yet – create one with mock_route.'
    return mine.map((m) => `${m.name} – http://localhost:${m.port} (${running.has(m.id) ? 'running' : 'stopped'})${m.fallbackUrl ? ` · fallback ${m.fallbackUrl}` : ''}\n${m.routes.map((r) => `  ${r.enabled ? '' : '(off) '}${r.method} ${r.path} -> ${r.status}`).join('\n')}`).join('\n\n')
  }
  if (name === 'mock_route') {
    let m = find(args.mock)
    if (!m) {
      m = { id: randomUUID(), projectId, name: String(args.mock), port: freePort(), autoStart: true, routes: [] }
      const created = m
      save((list) => list.push(created))
    }
    const route: MockRoute = { id: randomUUID(), method: String(args.method ?? 'GET').toUpperCase(), path: String(args.path), status: Number(args.status) || 200, body: String(args.body ?? ''), headers: args.headers ? String(args.headers) : undefined, delayMs: Number(args.delayMs) || undefined, enabled: true, note: 'added by an agent' }
    const id = m.id
    save((list) => {
      const x = list.find((y) => y.id === id)!
      const i = x.routes.findIndex((r) => r.method === route.method && r.path === route.path)
      if (i >= 0) x.routes[i] = { ...route, id: x.routes[i].id }
      else x.routes.push(route)
    })
    if (!running.has(id)) await startMock(id)
    return `${route.method} http://localhost:${m.port}${route.path} -> ${route.status}`
  }
  if (name === 'mock_logs') {
    const m = find(args.mock)
    if (!m) throw new Error(`No mock "${args.mock}"`)
    const l = (logs.get(m.id) ?? []).slice(-40)
    return l.length ? l.map((e) => `${new Date(e.at).toLocaleTimeString()} ${e.method} ${e.path} -> ${e.status}${e.proxied ? ' (fallback)' : e.routeId ? '' : ' (no route)'}${e.body ? `  body: ${e.body.slice(0, 200)}` : ''}`).join('\n') : '(no requests yet)'
  }
  throw new Error(`Unknown mock tool ${name}`)
}
