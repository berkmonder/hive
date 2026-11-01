import { useEffect, useMemo, useState } from 'react'
import type { DbConnection, McpServerDef, Skill } from '@shared/types'
import type { ProcInfo } from '@shared/procs'
import { ProjectAccounts, SkillFilesBar } from './More'
import { useStore } from '../store'
import { Icon, cleanError } from './common'
import { Character } from './Character'

type Tab = 'memory' | 'skills' | 'mcp' | 'procs' | 'auto' | 'secrets' | 'db'
const newId = (): string => Math.random().toString(36).slice(2, 10)

/** Project memory, skills, shared MCP servers and the process watchdog. */
export function WorkspaceView() {
  const [tab, setTab] = useState<Tab>('memory')
  const leftovers = useLeftovers()
  return (
    <div className="board-view ws">
      <header className="bv-head">
        <div className="seg sm tabs">
          <button className={tab === 'memory' ? 'on' : ''} onClick={() => setTab('memory')}><Icon name="brain" size={13} /> Memory</button>
          <button className={tab === 'skills' ? 'on' : ''} onClick={() => setTab('skills')}><Icon name="zap" size={13} /> Skills</button>
          <button className={tab === 'mcp' ? 'on' : ''} onClick={() => setTab('mcp')}><Icon name="plug" size={13} /> MCP servers</button>
          <button className={tab === 'auto' ? 'on' : ''} onClick={() => setTab('auto')}><Icon name="zap" size={13} /> Automation</button>
          <button className={tab === 'db' ? 'on' : ''} onClick={() => setTab('db')}><Icon name="database" size={13} /> Databases</button>
          <button className={tab === 'secrets' ? 'on' : ''} onClick={() => setTab('secrets')}><Icon name="lock" size={13} /> Secrets</button>
          <button className={tab === 'procs' ? 'on' : ''} onClick={() => setTab('procs')}>
            <Icon name="activity" size={13} /> Processes{leftovers > 0 && <span className="count-badge warn">{leftovers}</span>}
          </button>
        </div>
      </header>
      <div className="ws-body">
        {tab === 'memory' && <Memory />}
        {tab === 'skills' && <Skills />}
        {tab === 'mcp' && <McpServers />}
        {tab === 'procs' && <Processes />}
        {tab === 'auto' && <Automation />}
        {tab === 'secrets' && <Secrets />}
        {tab === 'db' && <Databases />}
      </div>
    </div>
  )
}

function useLeftovers(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const load = (): void => {
      window.api.procs.list().then((l) => setN(l.filter((p) => p.leftover).length)).catch(() => undefined)
    }
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])
  return n
}

function Memory() {
  const { app, selectedProjectId, toast } = useStore()
  const saved = selectedProjectId ? app.memory[selectedProjectId] ?? '' : ''
  const [text, setText] = useState(saved)
  useEffect(() => setText(saved), [saved])
  const mode = app.settings.memoryMode
  const project = app.projects.find((p) => p.id === selectedProjectId)
  return (
    <div className="ws-pane">
      <div className="ws-intro">
        <h2><Icon name="brain" size={16} /> Project memory · {project?.name}</h2>
        <p className="muted small">
          Shared notes every Claude Code agent in this project gets at start: decisions, architecture, conventions, pitfalls.
          {mode === 'readwrite' ? ' Agents add to it themselves with the remember tool.' : mode === 'read' ? ' Agents can read it (read-only).' : ' Memory is off (Settings → Agents).'}
          {' '}Changes reach agents on their next start.
        </p>
      </div>
      <textarea className="mono ws-memory" value={text} placeholder={'- We use pnpm, never npm\n- API errors always return { error: { code, message } }\n- Don’t touch legacy/ – it is being replaced'} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <span className="muted small">{text.split('\n').filter((l) => l.trim()).length} lines</span>
        <div className="spacer" />
        {text !== saved && <button className="btn ghost sm" onClick={() => setText(saved)}>Discard</button>}
        <button className="btn sm" disabled={text === saved || !selectedProjectId} onClick={() => window.api.memory.save(selectedProjectId!, text).then(() => toast('Memory saved', 'success'))}>Save</button>
      </div>
    </div>
  )
}

function Skills() {
  const { app, toast } = useStore()
  const [sel, setSel] = useState<string | null>(app.skills[0]?.id ?? null)
  const cur = app.skills.find((s) => s.id === sel)
  const [draft, setDraft] = useState<Skill | null>(cur ?? null)
  useEffect(() => setDraft(cur ?? null), [sel, cur])
  const add = (): void => {
    const s: Skill = { id: newId(), name: 'new-skill', description: 'When to use it', body: '1. …' }
    window.api.skills.save(s).then(() => setSel(s.id))
  }
  return (
    <div className="ws-pane split2">
      <div className="lib-list">
        <button className="btn sm" onClick={add}><Icon name="plus" size={13} /> New skill</button>
        <SkillFilesBar projectId={useStore.getState().selectedProjectId ?? undefined} />
        {app.skills.map((s) => (
          <button key={s.id} className={`lib-item ${s.id === sel ? 'on' : ''}`} onClick={() => setSel(s.id)}>
            <b><Icon name="zap" size={12} /> {s.name}</b>
            <span>{s.description}</span>
          </button>
        ))}
      </div>
      {draft ? (
        <div className="lib-edit">
          <p className="muted small">Claude Code agents see the list and fetch the steps with <code>get_skill</code> when a task matches. You can also insert a skill into any prompt from ⌘K.</p>
          <label>Name<input className="mono" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.replace(/\s+/g, '-').toLowerCase() })} /></label>
          <label>When to use<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <label>Steps<textarea rows={14} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
          <div className="modal-foot">
            <button className="btn ghost sm danger-text" onClick={() => confirm(`Delete skill ${draft.name}?`) && window.api.skills.remove(draft.id).then(() => setSel(null))}><Icon name="trash" size={13} /> Delete</button>
            <div className="spacer" />
            <button className="btn sm" disabled={JSON.stringify(draft) === JSON.stringify(cur)} onClick={() => window.api.skills.save(draft).then(() => toast('Skill saved', 'success'))}>Save</button>
          </div>
        </div>
      ) : (
        <div className="lib-edit muted">Pick or create a skill.</div>
      )}
    </div>
  )
}

function McpServers() {
  const { app, toast } = useStore()
  const [list, setList] = useState<McpServerDef[]>(app.mcpServers)
  useEffect(() => setList(app.mcpServers), [app.mcpServers])
  const dirty = JSON.stringify(list) !== JSON.stringify(app.mcpServers)
  const patch = (i: number, p: Partial<McpServerDef>): void => setList(list.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="ws-pane">
      <div className="ws-intro">
        <h2><Icon name="plug" size={16} /> Shared MCP servers</h2>
        <p className="muted small">Define once – every Claude Code and Codex agent gets them at start (on top of your own config). Restart running agents to pick up changes.</p>
      </div>
      <div className="cli-list">
        {list.map((m, i) => (
          <div key={m.id} className="cli-card">
            <div className="cli-head">
              <button role="switch" aria-checked={m.enabled} className={`switch ${m.enabled ? 'on' : ''}`} onClick={() => patch(i, { enabled: !m.enabled })}><i /></button>
              <input className="cli-name mono" value={m.name} onChange={(e) => patch(i, { name: e.target.value })} />
              <div className="seg sm">
                <button className={m.type === 'stdio' ? 'on' : ''} style={{ width: 'auto', padding: '0 10px' }} onClick={() => patch(i, { type: 'stdio' })}>Command</button>
                <button className={m.type === 'http' ? 'on' : ''} style={{ width: 'auto', padding: '0 10px' }} onClick={() => patch(i, { type: 'http' })}>HTTP</button>
              </div>
              <div className="spacer" />
              <button className="icon-btn danger" title="Remove" onClick={() => setList(list.filter((_, j) => j !== i))}><Icon name="trash" size={13} /></button>
            </div>
            {m.type === 'stdio' ? (
              <div className="cli-fields two">
                <label>Command<input className="mono" value={m.command ?? ''} placeholder="npx" onChange={(e) => patch(i, { command: e.target.value })} /></label>
                <label>Arguments<input className="mono" value={m.args ?? ''} placeholder="-y @modelcontextprotocol/server-github" onChange={(e) => patch(i, { args: e.target.value })} /></label>
              </div>
            ) : (
              <div className="cli-fields one">
                <label>URL<input className="mono" value={m.url ?? ''} placeholder="https://mcp.example.com/mcp" onChange={(e) => patch(i, { url: e.target.value })} /></label>
              </div>
            )}
            <label className="mcp-env">{m.type === 'stdio' ? 'Environment (KEY=value per line)' : 'Headers (Name: value per line)'}
              <textarea className="mono" rows={2} value={m.env ?? ''} placeholder={m.type === 'stdio' ? 'GITHUB_TOKEN=…' : 'Authorization: Bearer …'} onChange={(e) => patch(i, { env: e.target.value })} />
            </label>
          </div>
        ))}
        {!list.length && <p className="muted small">No shared servers yet.</p>}
      </div>
      <div className="row">
        <button className="btn ghost sm" onClick={() => setList([...list, { id: newId(), name: 'server', type: 'stdio', command: 'npx', args: '', enabled: true }])}><Icon name="plus" size={13} /> Add server</button>
        <div className="spacer" />
        {dirty && <button className="btn ghost sm" onClick={() => setList(app.mcpServers)}>Discard</button>}
        <button className="btn sm" disabled={!dirty} onClick={() => window.api.mcp.save(list).then(() => toast('MCP servers saved – restart agents to use them', 'success'))}>Save</button>
      </div>
    </div>
  )
}

function Processes() {
  const { app, toast } = useStore()
  const [list, setList] = useState<ProcInfo[] | null>(null)
  const load = (): void => {
    window.api.procs.list().then(setList).catch(() => setList([]))
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [])
  const sorted = useMemo(() => [...(list ?? [])].sort((a, b) => Number(b.leftover) - Number(a.leftover) || b.cpu - a.cpu), [list])
  const kill = (p: ProcInfo): void => {
    window.api.procs.kill(p.pid).then(() => (toast(`Stopped ${p.pid}`, 'success'), setTimeout(load, 800))).catch((e) => toast(cleanError(e), 'error'))
  }
  return (
    <div className="ws-pane">
      <div className="ws-intro">
        <h2><Icon name="activity" size={16} /> Process watchdog</h2>
        <p className="muted small">Processes started by agents' tool calls – test runners, servers, watchers. <b>Leftovers</b> kept running after their agent moved on or stopped. Dev servers from the Servers view are never listed.</p>
      </div>
      {list === null ? (
        <p className="muted small">Scanning…</p>
      ) : !sorted.length ? (
        <div className="sched-empty"><Icon name="check" size={26} /><p>Nothing running besides the agents themselves.</p></div>
      ) : (
        <table className="usage-table procs">
          <thead><tr><th>Agent</th><th>Process</th><th>PID</th><th>CPU</th><th>Memory</th><th>Running for</th><th /></tr></thead>
          <tbody>
            {sorted.map((p) => {
              const a = app.agents.find((x) => x.id === p.agentId)
              return (
                <tr key={p.pid} className={p.leftover ? 'leftover' : ''}>
                  <td><div className="ut-agent">{a && <Character head seed={a.id} color={a.color} status="idle" size={20} />}<div><b>{a?.name ?? '?'}</b>{p.leftover && <small className="warn-text">leftover</small>}</div></div></td>
                  <td className="mono cmd" title={p.command}>{p.command}</td>
                  <td className="mono">{p.pid}</td>
                  <td>{p.cpu.toFixed(1)}%</td>
                  <td>{p.memMb} MB</td>
                  <td className="mono">{p.elapsed}</td>
                  <td><button className="btn ghost sm danger-text" onClick={() => kill(p)}><Icon name="stop" size={12} /> Stop</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Automation() {
  const { app, selectedProjectId, budget, toast } = useStore()
  const saved = (selectedProjectId && app.projectSettings[selectedProjectId]) || {}
  const [s, setS] = useState(saved)
  const [detected, setDetected] = useState('')
  useEffect(() => setS(saved), [selectedProjectId, JSON.stringify(saved)]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedProjectId) window.api.automation.detectTest(selectedProjectId).then(setDetected)
  }, [selectedProjectId])
  if (!selectedProjectId) return null
  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const spent = budget[selectedProjectId] ?? 0
  return (
    <div className="ws-pane">
      <ProjectAccounts projectId={selectedProjectId} />
      <section className="set-group">
        <header>
          <h2>🧪 Test guard</h2>
          <p className="muted small">When an agent finishes a turn that changed files, Hive runs the tests in its folder. Failures go straight back to the agent to fix (up to the retry limit); you only hear about it if it can't.</p>
        </header>
        <div className="set-rows">
          <div className="set-row"><div className="set-label"><b>Run tests after each turn</b></div>
            <button role="switch" aria-checked={!!s.testGuard} className={`switch ${s.testGuard ? 'on' : ''}`} onClick={() => setS({ ...s, testGuard: !s.testGuard })}><i /></button></div>
          <div className="set-row"><div className="set-label"><b>Test command</b><span>{detected ? <>Detected: <span className="mono">{detected}</span></> : 'Nothing detected – enter one'}</span></div>
            <input className="mono" style={{ width: 280 }} placeholder={detected || 'npm test'} value={s.testCommand ?? ''} onChange={(e) => setS({ ...s, testCommand: e.target.value })} /></div>
          <div className="set-row"><div className="set-label"><b>Automatic fix attempts</b><span>in a row, before Hive asks you</span></div>
            <input type="number" min={0} max={10} style={{ width: 80 }} value={s.testRetries ?? 3} onChange={(e) => setS({ ...s, testRetries: Number(e.target.value) })} /></div>
        </div>
      </section>
      <section className="set-group">
        <header>
          <h2>🧠 Defaults for this project</h2>
          <p className="muted small">Agents without their own setting use these.</p>
        </header>
        <div className="set-rows">
          <div className="set-row"><div className="set-label"><b>Reasoning effort</b><span>Claude Code and Codex · overrides the CLI default</span></div>
            <select style={{ width: 160 }} value={s.effort ?? ''} onChange={(e) => setS({ ...s, effort: (e.target.value || undefined) as typeof s.effort })}>
              <option value="">CLI default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select></div>
          <div className="set-row"><div className="set-label"><b>Sync memory with a folder</b><span>e.g. your Obsidian vault – project memory is mirrored to <span className="mono">Hive Memory – {app.projects.find((p) => p.id === selectedProjectId)?.name}.md</span> there, both ways</span></div>
            <div className="row">
              <input className="mono" style={{ width: 260 }} placeholder="~/Obsidian/Work" value={s.memorySync ?? ''} onChange={(e) => setS({ ...s, memorySync: e.target.value || undefined })} />
            </div></div>
        </div>
      </section>
      <section className="set-group">
        <header>
          <h2>💸 Daily budget</h2>
          <p className="muted small">Estimated Claude Code spend per day for this project (API list prices). You get alerts at 50% and 75%; at 100% every agent pauses after its current turn.</p>
        </header>
        <div className="set-rows">
          <div className="set-row"><div className="set-label"><b>Limit (USD / day)</b><span>Today so far: ${spent.toFixed(2)} · empty = no limit</span></div>
            <input type="number" min={0} step={1} style={{ width: 120 }} placeholder="e.g. 20" value={s.dailyBudget ?? ''} onChange={(e) => setS({ ...s, dailyBudget: e.target.value ? Number(e.target.value) : undefined })} /></div>
        </div>
      </section>
      <div className="row">
        <div className="spacer" />
        {dirty && <button className="btn ghost sm" onClick={() => setS(saved)}>Discard</button>}
        <button className="btn sm" disabled={!dirty} onClick={() => window.api.automation.saveProject(selectedProjectId, s).then(() => toast('Automation saved', 'success'))}>Save</button>
      </div>
    </div>
  )
}

function Secrets() {
  const { app, selectedProjectId, toast } = useStore()
  const [list, setList] = useState<{ name: string; projectId?: string; updatedAt: number; length: number }[]>([])
  const [enc, setEnc] = useState(true)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [scope, setScope] = useState<'all' | 'project'>('project')
  const load = (): void => {
    window.api.secrets.list().then(setList)
    window.api.secrets.encrypted().then(setEnc)
  }
  useEffect(load, [])
  const add = (): void => {
    window.api.secrets
      .set(name.trim(), value, scope === 'project' ? selectedProjectId ?? undefined : undefined)
      .then(() => {
        toast(`${name} saved – restart agents to pick it up`, 'success')
        setName('')
        setValue('')
        load()
      })
      .catch((e) => toast(cleanError(e), 'error'))
  }
  const proj = (id?: string): string => (id ? app.projects.find((p) => p.id === id)?.name ?? '?' : 'All projects')
  return (
    <div className="ws-pane">
      <div className="ws-intro">
        <h2><Icon name="lock" size={16} /> Secrets</h2>
        <p className="muted small">
          API keys and passwords for your agents. They get them as <b>environment variables</b> (<code>$STRIPE_KEY</code>), Claude agents can list the
          names with <code>list_secrets</code>, and values are masked (••••••) wherever Hive shows terminal output. Stored {enc ? 'encrypted with your system keychain' : 'unencrypted (no keychain available)'}.
        </p>
      </div>
      <div className="secret-add">
        <input className="mono" placeholder="NAME (e.g. STRIPE_API_KEY)" value={name} onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} />
        <input type="password" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name && value && add()} />
        <div className="seg sm">
          <button className={scope === 'project' ? 'on' : ''} style={{ width: 'auto', padding: '0 10px' }} onClick={() => setScope('project')}>This project</button>
          <button className={scope === 'all' ? 'on' : ''} style={{ width: 'auto', padding: '0 10px' }} onClick={() => setScope('all')}>All</button>
        </div>
        <button className="btn sm" disabled={!name.trim() || !value} onClick={add}><Icon name="plus" size={12} /> Add</button>
      </div>
      <div className="secret-list">
        {list.map((s) => (
          <div key={s.name} className="secret-row">
            <Icon name="lock" size={13} />
            <code>{s.name}</code>
            <span className="mono muted">{'•'.repeat(Math.min(12, s.length))}</span>
            <span className="chip">{proj(s.projectId)}</span>
            <div className="spacer" />
            <span className="muted small">{new Date(s.updatedAt).toLocaleDateString()}</span>
            <button className="icon-btn danger" title="Delete" onClick={() => confirm(`Delete ${s.name}?`) && window.api.secrets.remove(s.name).then(load)}><Icon name="trash" size={13} /></button>
          </div>
        ))}
        {!list.length && <p className="muted small">No secrets yet.</p>}
      </div>
      <p className="muted small">Note: an agent can still print a variable it has access to – masking only hides values in Hive's views. Give each project only the secrets it needs.</p>
    </div>
  )
}

const DB_TYPES: { id: DbConnection['type']; name: string; short: string; color: string; hint: string; example: string }[] = [
  { id: 'postgres', name: 'PostgreSQL', short: 'PG', color: '#336791', hint: 'postgres://user:password@host:5432/dbname', example: "select * from users order by created_at desc limit 10" },
  { id: 'mysql', name: 'MySQL', short: 'My', color: '#e48e00', hint: 'mysql://user:password@host:3306/dbname', example: 'select * from orders limit 10' },
  { id: 'mongodb', name: 'MongoDB', short: 'Mo', color: '#47a248', hint: 'mongodb+srv://user:password@cluster.example.net/dbname', example: '{"collection":"users","find":{},"limit":10}' }
]
const dbType = (t: DbConnection['type']) => DB_TYPES.find((x) => x.id === t)!

function DbLogo({ type, size = 38 }: { type: DbConnection['type']; size?: number }) {
  const d = dbType(type)
  return <span className="db-logo" style={{ ['--c' as string]: d.color, width: size, height: size, fontSize: size * 0.36 }}>{d.short}</span>
}

function Databases() {
  const { app, selectedProjectId, toast } = useStore()
  const [list, setList] = useState<DbConnection[]>([])
  const [edit, setEdit] = useState<(DbConnection & { url: string }) | null>(null)
  const [q, setQ] = useState<{ id: string; text: string; out?: string; ok?: boolean; busy?: boolean } | null>(null)
  const load = (): void => {
    window.api.db.list().then(setList)
  }
  useEffect(load, [])
  const visible = list.filter((d) => !d.projectId || d.projectId === selectedProjectId)
  const others = list.length - visible.length
  const startNew = (type: DbConnection['type'] = 'postgres'): void =>
    setEdit({ id: newId(), name: type === 'mongodb' ? 'app-mongo' : 'app-db', type, readOnly: true, projectId: selectedProjectId ?? undefined, url: '' })
  const run = async (): Promise<void> => {
    if (!q) return
    setQ({ ...q, busy: true, out: undefined })
    try {
      setQ({ ...q, busy: false, ok: true, out: await window.api.db.query(q.id, q.text) })
    } catch (e) {
      setQ({ ...q, busy: false, ok: false, out: cleanError(e) })
    }
  }
  const qDb = list.find((d) => d.id === q?.id)
  return (
    <div className="ws-pane">
      <header className="pane-hero">
        <div className="ph-icon"><Icon name="database" size={22} /></div>
        <div className="ph-text">
          <h2>Databases</h2>
          <p>Let agents look at real data – safely. Claude agents use <code>db_list</code> and <code>db_query</code>.</p>
          <div className="ph-badges">
            <span><Icon name="lock" size={12} /> Credentials encrypted, never shown to agents</span>
            <span><Icon name="eye" size={12} /> Read-only by default</span>
            <span><Icon name="terminal" size={12} /> One statement per call</span>
          </div>
        </div>
        {visible.length > 0 && <button className="btn" onClick={() => startNew()}><Icon name="plus" size={14} /> Add database</button>}
      </header>

      {visible.length === 0 ? (
        <div className="db-empty">
          <div className="db-empty-art"><Icon name="database" size={30} /></div>
          <h3>No databases connected</h3>
          <p className="muted">Pick a type to connect. You can keep it read-only and limit it to this project.</p>
          <div className="db-types">
            {DB_TYPES.map((d) => (
              <button key={d.id} className="db-type" onClick={() => startNew(d.id)}>
                <DbLogo type={d.id} size={44} />
                <b>{d.name}</b>
                <span className="muted small">Connect <Icon name="chevronRight" size={11} /></span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="db-grid">
          {visible.map((d) => (
            <article key={d.id} className="db-card">
              <div className="db-card-head">
                <DbLogo type={d.type} />
                <div className="db-card-title">
                  <b>{d.name}</b>
                  <span className="mono">{d.host || dbType(d.type).name}</span>
                </div>
                <button className="icon-btn" title="Edit" onClick={() => setEdit({ ...d, url: '' })}><Icon name="edit" size={14} /></button>
                <button className="icon-btn danger" title="Remove" onClick={() => confirm(`Remove ${d.name}?`) && window.api.db.remove(d.id).then(load)}><Icon name="trash" size={14} /></button>
              </div>
              <div className="db-card-tags">
                <span className={`tag ${d.readOnly ? 'ok' : 'warn'}`}><Icon name={d.readOnly ? 'eye' : 'edit'} size={11} /> {d.readOnly ? 'Read-only' : 'Read & write'}</span>
                <span className="tag">{dbType(d.type).name}</span>
                <span className="tag">{d.projectId ? 'This project' : 'All projects'}</span>
              </div>
              <button className="btn ghost sm db-try" onClick={() => setQ({ id: d.id, text: dbType(d.type).example })}><Icon name="play" size={12} /> Try a query</button>
            </article>
          ))}
          <button className="db-card db-add" onClick={() => startNew()}>
            <Icon name="plus" size={20} />
            <span>Add database</span>
          </button>
        </div>
      )}
      {others > 0 && <p className="muted small">{others} more connection{others > 1 ? 's' : ''} in other projects.</p>}

      {q && qDb && (
        <section className="db-console">
          <header>
            <DbLogo type={qDb.type} size={24} />
            <b>{qDb.name}</b>
            <span className="muted small">same rules as for agents{qDb.readOnly ? ' · read-only' : ''}</span>
            <div className="spacer" />
            <button className="icon-btn" title="Close" onClick={() => setQ(null)}><Icon name="x" size={14} /></button>
          </header>
          <textarea className="mono" rows={3} value={q.text} spellCheck={false} onChange={(e) => setQ({ ...q, text: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && run()} />
          <div className="row">
            <span className="muted small"><span className="kbd">⌘⏎</span> run</span>
            <div className="spacer" />
            <button className="btn sm" disabled={q.busy} onClick={run}><Icon name={q.busy ? 'refresh' : 'play'} size={12} /> {q.busy ? 'Running…' : 'Run'}</button>
          </div>
          {q.out && <pre className={`mono ${q.ok ? '' : 'err'}`}>{q.out}</pre>}
        </section>
      )}

      {edit && (
        <div className="backdrop" onMouseDown={() => setEdit(null)}>
          <div className="modal db-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>{list.some((d) => d.id === edit.id) ? 'Edit database' : 'Connect a database'}</h2>
            <div className="db-type-pick">
              {DB_TYPES.map((d) => (
                <button key={d.id} type="button" className={edit.type === d.id ? 'on' : ''} onClick={() => setEdit({ ...edit, type: d.id })}>
                  <DbLogo type={d.id} size={28} /> {d.name}
                </button>
              ))}
            </div>
            <label>Name · how agents refer to it
              <input className="mono" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value.replace(/\s+/g, '-') })} />
            </label>
            <label>{list.some((d) => d.id === edit.id) ? 'Connection string · leave empty to keep the saved one' : 'Connection string'}
              <input type="password" className="mono" value={edit.url} placeholder={dbType(edit.type).hint} onChange={(e) => setEdit({ ...edit, url: e.target.value })} />
            </label>
            <div className="db-opts">
              <button type="button" className={`db-opt ${edit.readOnly ? 'on' : ''}`} onClick={() => setEdit({ ...edit, readOnly: true })}>
                <Icon name="eye" size={16} /><b>Read-only</b><span>Recommended. Writes are rejected.</span>
              </button>
              <button type="button" className={`db-opt ${!edit.readOnly ? 'on warn' : ''}`} onClick={() => setEdit({ ...edit, readOnly: false })}>
                <Icon name="edit" size={16} /><b>Read & write</b><span>Agents can change data.</span>
              </button>
            </div>
            <label className="check"><input type="checkbox" checked={!edit.projectId} onChange={(e) => setEdit({ ...edit, projectId: e.target.checked ? undefined : selectedProjectId ?? undefined })} /> Available in every project
              {edit.projectId && <small className="muted">&nbsp;(now: {app.projects.find((p) => p.id === edit.projectId)?.name})</small>}
            </label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={!edit.name.trim() || (!edit.url && !list.some((d) => d.id === edit.id))} onClick={() => {
                const { url, ...d } = edit
                window.api.db.save(d, url || undefined).then(() => (setEdit(null), load(), toast('Database saved – restart Claude agents to give them access', 'success'))).catch((e) => toast(cleanError(e), 'error'))
              }}><Icon name="check" size={14} /> Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
