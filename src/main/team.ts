/**
 * Team orchestration over MCP.
 *
 * Every Claude Code agent that is part of a team (it has a lead, or it leads others)
 * is started with `--mcp-config` pointing at `http://127.0.0.1:<port>/mcp/<agentId>`.
 * This module answers those MCP JSON-RPC calls (stateless Streamable HTTP, JSON replies).
 *
 *  Lead tools:  list_team, send_task, get_agent_output, wait_for_agents, read_reports, stop_agent
 *  Member tool: report_to_lead
 */
import { app } from 'electron'
import { IncomingMessage, ServerResponse } from 'http'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import type { Agent, TeamEvent } from '@shared/types'
import { lastLines, pickActivity } from '@shared/text'
import type { AgentManager } from './agents'
import { getState } from './store'
import { secretNames } from './insights'
import { dbsFor, runQuery } from './remote'

export interface TeamDeps {
  agents: AgentManager
  startAgent: (id: string, resume: boolean, prompt?: string) => void
  onEvent: (e: TeamEvent) => void
  /** append a line to a project's shared memory */
  remember: (projectId: string, line: string) => void
}

const TOKEN = randomBytes(16).toString('hex')
const inbox = new Map<string, TeamEvent[]>() // lead id -> reports not read yet
let deps: TeamDeps

export function initTeam(d: TeamDeps): void {
  deps = d
}

// ---------- hierarchy helpers ----------
const all = (): Agent[] => getState().agents
export const childrenOf = (id: string): Agent[] => all().filter((a) => a.parentId === id)
export const inTeam = (a: Agent): boolean => !!a.parentId || childrenOf(a.id).length > 0

/** Would making `parentId` the lead of `id` create a loop? */
export function wouldCycle(id: string, parentId: string): boolean {
  let cur: string | undefined = parentId
  for (let i = 0; cur && i < 50; i++) {
    if (cur === id) return true
    cur = all().find((a) => a.id === cur)?.parentId
  }
  return false
}

const lines = (s?: string): [string, string][] =>
  (s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.search(/[=:]/)
      return (i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']) as [string, string]
    })

/** split "a b 'c d'" into args */
const splitArgs = (s?: string): string[] => (s?.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((a) => a.replace(/^['"]|['"]$/g, ''))

/** Does this agent get Hive's own MCP server (team tools, project memory, skills)? */
const wantsHive = (a: Agent): boolean => inTeam(a) || getState().settings.memoryMode !== 'off' || getState().skills.length > 0 || dbsFor(a.projectId).length > 0

/**
 * Writes the per-agent MCP config file and returns CLI args for Claude Code:
 * Hive's server (team, memory, skills) + every shared MCP server from Settings.
 */
export function mcpArgsFor(agent: Agent, port: number, inline = false): string | undefined {
  const servers: Record<string, object> = {}
  if (wantsHive(agent))
    servers.hive = { type: 'http', url: `http://127.0.0.1:${port}/mcp/${agent.id}`, headers: { Authorization: `Bearer ${TOKEN}` } }
  for (const m of getState().mcpServers.filter((x) => x.enabled && x.name.trim())) {
    const key = m.name.trim().replace(/[^\w-]/g, '-')
    if (m.type === 'http' && m.url) servers[key] = { type: 'http', url: m.url, headers: Object.fromEntries(lines(m.env)) }
    else if (m.command) servers[key] = { type: 'stdio', command: m.command, args: splitArgs(m.args), env: Object.fromEntries(lines(m.env)) }
  }
  if (!Object.keys(servers).length) return undefined
  const dir = join(app.getPath('userData'), 'mcp')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${agent.id}.json`)
  const config = { mcpServers: servers }
  if (inline) return `--mcp-config '${JSON.stringify(config).replace(/'/g, `'\\''`)}'`
  writeFileSync(file, JSON.stringify(config, null, 2))
  return `--mcp-config '${file.replace(/'/g, `'\\''`)}'`
}

// ---------- HTTP entry ----------
export function handleMcpHttp(req: IncomingMessage, res: ServerResponse): boolean {
  const m = req.url?.match(/^\/mcp\/([\w-]+)/)
  if (!m) return false
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end()
    return true
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' }).end() // no server-initiated stream
    return true
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', async () => {
    let msg: { id?: number | string; method?: string; params?: Record<string, unknown> }
    try {
      msg = JSON.parse(body)
    } catch {
      res.writeHead(400).end()
      return
    }
    if (msg.id === undefined) {
      res.writeHead(202).end() // notification
      return
    }
    const reply = (payload: object): void => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...payload }))
    }
    try {
      reply({ result: await rpc(m[1], msg.method ?? '', msg.params ?? {}) })
    } catch (err) {
      reply({ error: { code: -32603, message: (err as Error).message } })
    }
  })
  return true
}

// ---------- JSON-RPC ----------
async function rpc(callerId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const me = all().find((a) => a.id === callerId)
  if (!me) throw new Error('Unknown agent')
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: (params.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'hive', version: '0.3.0' },
        instructions: instructionsFor(me)
      }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: toolsFor(me) }
    case 'tools/call': {
      const name = params.name as string
      const args = (params.arguments ?? {}) as Record<string, unknown>
      try {
        const text = await callTool(me, name, args)
        return { content: [{ type: 'text', text }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
      }
    }
    default:
      throw new Error(`Method not found: ${method}`)
  }
}

function instructionsFor(me: Agent): string {
  const kids = childrenOf(me.id)
  const lead = all().find((a) => a.id === me.parentId)
  const parts: string[] = []
  const mode = getState().settings.memoryMode
  if (mode !== 'off') {
    const mem = (getState().memory[me.projectId] ?? '').trim()
    parts.push(
      'PROJECT MEMORY (shared by every agent in this project – decisions, architecture, pitfalls):\n' +
        (mem ? mem.slice(-6000) : '(empty)') +
        (mode === 'readwrite'
          ? '\nWhen you make or learn a decision other agents should know (architecture, conventions, gotchas), add it with remember (one short line).'
          : '')
    )
  }
  const skills = getState().skills
  if (skills.length)
    parts.push('SKILLS (step-by-step procedures; call get_skill before doing one of these):\n' + skills.map((s) => `- ${s.name}: ${s.description}`).join('\n'))
  if (kids.length)
    parts.push(
      `You are "${me.name}" (${me.role}), the LEAD of a team of AI coding agents running in Hive: ` +
        kids.map((k) => `"${k.name}" (${k.role})`).join(', ') +
        '. Break work into tasks, hand them out with send_task, use wait_for_agents to wait for results, ' +
        'check their work with get_agent_output, and summarise for the user. Each member works in its own folder/branch when isolated.'
    )
  if (lead)
    parts.push(
      `You report to "${lead.name}". When you finish a task, or are blocked, call report_to_lead with a short summary ` +
        '(what changed, which files, anything the lead must know).'
    )
  return parts.join('\n\n')
}

const agentProp = { type: 'string', description: 'Team member name (or id)' }

function toolsFor(me: Agent): object[] {
  const tools: object[] = []
  if (childrenOf(me.id).length) {
    tools.push(
      {
        name: 'list_team',
        description: 'List your team members with their role, status (working / waiting / done / error / idle), workspace and latest output line.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'send_task',
        description:
          'Give a team member a task or message. Starts the member if it is not running. If it is busy the task is queued and typed in as soon as it is free.',
        inputSchema: {
          type: 'object',
          properties: {
            agent: agentProp,
            task: { type: 'string', description: 'Clear, self-contained instructions' },
            new_session: { type: 'boolean', description: 'Restart the member with a fresh context first (default false)' }
          },
          required: ['agent', 'task']
        }
      },
      {
        name: 'wait_for_agents',
        description:
          'Block until the given members (default: whole team) have stopped working, or until the timeout. Returns their status, any reports and their latest output.',
        inputSchema: {
          type: 'object',
          properties: {
            agents: { type: 'array', items: { type: 'string' }, description: 'Member names; omit for all' },
            timeout_seconds: { type: 'number', description: 'Default 300, max 1800' }
          }
        }
      },
      {
        name: 'get_agent_output',
        description: "Read the last lines of a member's terminal (cleaned of colours/TUI noise).",
        inputSchema: {
          type: 'object',
          properties: { agent: agentProp, lines: { type: 'number', description: 'Default 60, max 400' } },
          required: ['agent']
        }
      },
      {
        name: 'read_reports',
        description: 'Return (and clear) the reports your members sent with report_to_lead.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'stop_agent',
        description: 'Stop a team member.',
        inputSchema: { type: 'object', properties: { agent: agentProp }, required: ['agent'] }
      }
    )
  }
  const mode = getState().settings.memoryMode
  if (mode !== 'off')
    tools.push({
      name: 'read_memory',
      description: "Read the project's shared memory (decisions, architecture, pitfalls written by you and other agents).",
      inputSchema: { type: 'object', properties: {} }
    })
  if (mode === 'readwrite')
    tools.push({
      name: 'remember',
      description: 'Add one short note to the shared project memory (a decision, convention, architecture fact or pitfall). Other agents will see it.',
      inputSchema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] }
    })
  if (dbsFor(me.projectId).length)
    tools.push(
      {
        name: 'db_list',
        description: 'List the databases you can query (name, type, read-only or not). Credentials are never shown.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'db_query',
        description:
          'Run ONE statement on a database. SQL for postgres / mysql; for mongodb a JSON object like {"collection":"users","find":{"active":true},"limit":20}, {"collection":"orders","aggregate":[...]}, {"collection":"x","count":{}} or {"collections":true}. Read-only connections reject writes.',
        inputSchema: {
          type: 'object',
          properties: { database: { type: 'string', description: 'Name from db_list' }, query: { type: 'string' }, limit: { type: 'number', description: 'Max rows, default 100' } },
          required: ['database', 'query']
        }
      }
    )
  if (secretNames(me.projectId).length)
    tools.push({
      name: 'list_secrets',
      description: 'Names of the secrets available to you as environment variables (values are never shown). Use them as $NAME in commands or process.env.NAME in code – never print them.',
      inputSchema: { type: 'object', properties: {} }
    })
  if (getState().skills.length)
    tools.push(
      { name: 'list_skills', description: 'List the reusable procedures (skills) available in Hive.', inputSchema: { type: 'object', properties: {} } },
      {
        name: 'get_skill',
        description: 'Get the full steps of a skill by name. Follow them when the task matches.',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
      }
    )
  if (me.parentId) {
    tools.push({
      name: 'report_to_lead',
      description: 'Send a short status report to your lead (done, blocked, question, summary of changes).',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message']
      }
    })
  }
  return tools
}

function member(me: Agent, ref: unknown): Agent {
  const q = String(ref ?? '').trim().toLowerCase()
  const kids = childrenOf(me.id)
  const hit =
    kids.find((a) => a.id === q || a.name.toLowerCase() === q) ??
    kids.find((a) => a.id.startsWith(q) || a.name.toLowerCase().includes(q))
  if (!hit) throw new Error(`No team member "${ref}". Team: ${kids.map((k) => k.name).join(', ') || '(empty)'}`)
  return hit
}

function describe(a: Agent): string {
  const rt = deps.agents.runtime(a.id)
  const line = pickActivity(deps.agents.screenLines(a.id, 80))
  return [
    `- ${a.name} (${a.role})`,
    `  status: ${rt.status}${rt.running ? '' : ' (not running)'}${rt.exitReason ? ` – ${rt.exitReason}` : ''}`,
    a.branch ? `  branch: ${a.branch}` : '',
    line ? `  latest: ${line}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

function takeReports(leadId: string, names?: Set<string>): TeamEvent[] {
  const box = inbox.get(leadId) ?? []
  const mine = names ? box.filter((e) => names.has(e.from)) : box
  inbox.set(leadId, box.filter((e) => !mine.includes(e)))
  return mine
}

async function callTool(me: Agent, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'list_team': {
      const kids = childrenOf(me.id)
      return kids.length ? kids.map(describe).join('\n') : 'You have no team members yet.'
    }

    case 'send_task': {
      const a = member(me, args.agent)
      const task = String(args.task ?? '').trim()
      if (!task) throw new Error('task is empty')
      const text = `[Task from your lead ${me.name}]\n${task}`
      deps.onEvent({ kind: 'task', from: me.name, to: a.name, text: task, at: Date.now() })
      if (args.new_session && deps.agents.isRunning(a.id)) {
        deps.agents.restart(a.id, () => deps.startAgent(a.id, false, text))
        return `Restarting ${a.name} with a fresh session; the task will be sent when it is ready.`
      }
      if (!deps.agents.isRunning(a.id)) {
        deps.startAgent(a.id, false, text)
        return `Started ${a.name}; the task will be typed in as soon as its CLI is ready.`
      }
      const how = deps.agents.deliver(a.id, text)
      return how === 'sent' ? `Sent to ${a.name}.` : `${a.name} is busy – task queued and will be sent when it is free.`
    }

    case 'wait_for_agents': {
      const list = Array.isArray(args.agents) && args.agents.length ? args.agents.map((x) => member(me, x)) : childrenOf(me.id)
      const timeout = Math.min(Math.max(Number(args.timeout_seconds) || 300, 5), 1800) * 1000
      const start = Date.now()
      const names = new Set(list.map((a) => a.name))
      const hasReport = (): boolean => (inbox.get(me.id) ?? []).some((e) => names.has(e.from))
      while (Date.now() - start < timeout && list.some((a) => deps.agents.isBusy(a.id)) && !hasReport()) {
        await new Promise((r) => setTimeout(r, 1000))
      }
      const timedOut = list.some((a) => deps.agents.isBusy(a.id))
      const reports = takeReports(me.id, names)
      return [
        timedOut ? `Timed out after ${Math.round((Date.now() - start) / 1000)}s – some members are still working.` : 'All listed members are idle.',
        '',
        ...list.map(describe),
        reports.length ? '\nReports:\n' + reports.map((r) => `- ${r.from}: ${r.text}`).join('\n') : ''
      ].join('\n')
    }

    case 'get_agent_output': {
      const a = member(me, args.agent)
      const n = Math.min(Math.max(Number(args.lines) || 60, 1), 400)
      const live = deps.agents.screenLines(a.id, n)
      const out = live.length ? live : lastLines(deps.agents.buffer(a.id), n, 400)
      return out.length ? out.join('\n') : `(no output from ${a.name} yet)`
    }

    case 'read_reports': {
      const r = takeReports(me.id)
      return r.length ? r.map((e) => `- ${e.from}: ${e.text}`).join('\n') : 'No new reports.'
    }

    case 'stop_agent': {
      const a = member(me, args.agent)
      deps.agents.stop(a.id)
      return `Stopping ${a.name}.`
    }

    case 'report_to_lead': {
      const lead = all().find((a) => a.id === me.parentId)
      if (!lead) throw new Error('You have no lead')
      const ev: TeamEvent = { kind: 'report', from: me.name, to: lead.name, text: String(args.message ?? ''), at: Date.now() }
      inbox.set(lead.id, [...(inbox.get(lead.id) ?? []), ev])
      deps.onEvent(ev)
      return `Report delivered to ${lead.name}.`
    }

    case 'read_memory':
      return (getState().memory[me.projectId] ?? '').trim() || 'The project memory is empty.'

    case 'remember': {
      if (getState().settings.memoryMode !== 'readwrite') throw new Error('Project memory is read-only')
      const note = String(args.note ?? '').replace(/\s+/g, ' ').trim()
      if (!note) throw new Error('note is empty')
      deps.remember(me.projectId, `- ${note} _(${me.name}, ${new Date().toISOString().slice(0, 10)})_`)
      return 'Saved to project memory.'
    }

    case 'db_list': {
      const l = dbsFor(me.projectId)
      return l.length ? l.map((d) => `- ${d.name} (${d.type}${d.readOnly ? ', read-only' : ', read-write'})`).join('\n') : 'No databases connected.'
    }

    case 'db_query':
      return runQuery(me.projectId, String(args.database ?? ''), String(args.query ?? ''), Math.min(Number(args.limit) || 100, 500))

    case 'list_secrets': {
      const n = secretNames(me.projectId)
      return n.length ? `Available as environment variables (values hidden):\n${n.map((x) => `- $${x}`).join('\n')}` : 'No secrets configured.'
    }

    case 'list_skills':
      return getState().skills.map((s) => `- ${s.name}: ${s.description}`).join('\n') || 'No skills.'

    case 'get_skill': {
      const q = String(args.name ?? '').toLowerCase().trim()
      const s = getState().skills.find((x) => x.name.toLowerCase() === q) ?? getState().skills.find((x) => x.name.toLowerCase().includes(q))
      if (!s) throw new Error(`No skill "${args.name}". Available: ${getState().skills.map((x) => x.name).join(', ')}`)
      return `# ${s.name}\n${s.description}\n\n${s.body}`
    }

    default:
      throw new Error(`Unknown tool ${name}`)
  }
}
