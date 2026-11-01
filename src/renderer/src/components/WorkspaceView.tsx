import { useEffect, useMemo, useState } from 'react'
import type { DbConnection, McpServerDef, Skill } from '@shared/types'
import type { ProcInfo } from '@shared/procs'
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
        <p className="muted small">Define once – every Claude Code agent gets them at start (on top of your own ~/.claude config). Restart running agents to pick up changes.</p>
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

const DB_HINT: Record<DbConnection['type'], string> = {
  postgres: 'postgres://user:password@host:5432/dbname',
  mysql: 'mysql://user:password@host:3306/dbname',
  mongodb: 'mongodb+srv://user:password@cluster.example.net/dbname'
}

function Databases() {
  const { app, selectedProjectId, toast } = useStore()
  const [list, setList] = useState<DbConnection[]>([])
  const [edit, setEdit] = useState<(DbConnection & { url: string }) | null>(null)
  const [q, setQ] = useState<{ id: string; text: string; out?: string; busy?: boolean } | null>(null)
  const load = (): void => {
    window.api.db.list().then(setList)
  }
  useEffect(load, [])
  const run = async (): Promise<void> => {
    if (!q) return
    setQ({ ...q, busy: true, out: undefined })
    try {
      setQ({ ...q, busy: false, out: await window.api.db.query(q.id, q.text) })
    } catch (e) {
      setQ({ ...q, busy: false, out: `Error: ${cleanError(e)}` })
    }
  }
  return (
    <div className="ws-pane">
      <div className="ws-intro">
        <h2><Icon name="database" size={16} /> Databases</h2>
        <p className="muted small">PostgreSQL, MySQL and MongoDB. Claude agents query them with <code>db_list</code> / <code>db_query</code> – one statement per call, read-only by default
          (enforced with read-only transactions), and the connection string (with its password) is stored encrypted and never shown to the agent.</p>
      </div>
      <div className="secret-list">
        {list.map((d) => (
          <div key={d.id} className="secret-row">
            <Icon name="database" size={14} />
            <b>{d.name}</b>
            <span className="chip">{d.type}</span>
            <span className="mono muted small">{d.host}</span>
            <span className={`chip ${d.readOnly ? '' : 'warn-text'}`}>{d.readOnly ? 'read-only' : 'read-write'}</span>
            <span className="chip">{d.projectId ? app.projects.find((p) => p.id === d.projectId)?.name : 'All projects'}</span>
            <div className="spacer" />
            <button className="btn ghost sm" onClick={() => setQ({ id: d.id, text: d.type === 'mongodb' ? '{"collections": true}' : d.type === 'postgres' ? "select table_name from information_schema.tables where table_schema = 'public'" : 'show tables' })}>Query</button>
            <button className="icon-btn" title="Edit" onClick={() => setEdit({ ...d, url: '' })}><Icon name="edit" size={13} /></button>
            <button className="icon-btn danger" title="Delete" onClick={() => confirm(`Remove ${d.name}?`) && window.api.db.remove(d.id).then(load)}><Icon name="trash" size={13} /></button>
          </div>
        ))}
        {!list.length && <p className="muted small">No databases yet.</p>}
      </div>
      <div className="row">
        <button className="btn sm" onClick={() => setEdit({ id: newId(), name: 'app-db', type: 'postgres', readOnly: true, projectId: selectedProjectId ?? undefined, url: '' })}>
          <Icon name="plus" size={12} /> Add database
        </button>
      </div>
      {q && (
        <div className="db-console">
          <textarea className="mono" rows={3} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && run()} />
          <div className="row">
            <span className="muted small">⌘⏎ to run · same rules as for agents</span>
            <div className="spacer" />
            <button className="btn ghost sm" onClick={() => setQ(null)}>Close</button>
            <button className="btn sm" disabled={q.busy} onClick={run}>{q.busy ? 'Running…' : 'Run'}</button>
          </div>
          {q.out && <pre className="mono">{q.out}</pre>}
        </div>
      )}
      {edit && (
        <div className="backdrop" onMouseDown={() => setEdit(null)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2><Icon name="database" size={15} /> Database</h2>
            <div className="row">
              <label style={{ flex: 1 }}>Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value.replace(/\s+/g, '-') })} /></label>
              <label>Type
                <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as DbConnection['type'] })}>
                  <option value="postgres">PostgreSQL</option><option value="mysql">MySQL</option><option value="mongodb">MongoDB</option>
                </select>
              </label>
            </div>
            <label>Connection string{list.some((d) => d.id === edit.id) && <small className="muted"> – leave empty to keep the saved one</small>}
              <input type="password" className="mono" value={edit.url} placeholder={DB_HINT[edit.type]} onChange={(e) => setEdit({ ...edit, url: e.target.value })} />
            </label>
            <label className="check"><input type="checkbox" checked={edit.readOnly} onChange={(e) => setEdit({ ...edit, readOnly: e.target.checked })} /> Read-only (recommended)</label>
            <label className="check"><input type="checkbox" checked={!edit.projectId} onChange={(e) => setEdit({ ...edit, projectId: e.target.checked ? undefined : selectedProjectId ?? undefined })} /> Available in every project</label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={!edit.name.trim() || (!edit.url && !list.some((d) => d.id === edit.id))} onClick={() => {
                const { url, ...d } = edit
                window.api.db.save(d, url || undefined).then(() => (setEdit(null), load(), toast('Database saved – restart Claude agents to give them access', 'success'))).catch((e) => toast(cleanError(e), 'error'))
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
