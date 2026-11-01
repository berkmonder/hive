import { useState, type ReactElement } from 'react'
import type { Agent, AgentStatus } from '@shared/types'
import { useStore } from '../store'
import { CloneRepoModal } from './More'
import { Character } from './Character'
import { Icon, STATUS_LABEL, timeAgo } from './common'
import { agentCommands } from './agentCommands'

const GROUPS: { status: AgentStatus[]; title: string; cls: string }[] = [
  { status: ['waiting'], title: 'Needs you', cls: 'g-waiting' },
  { status: ['error'], title: 'Errors', cls: 'g-error' },
  { status: ['working'], title: 'Working', cls: 'g-working' },
  { status: ['done'], title: 'To review', cls: 'g-done' },
  { status: ['idle'], title: 'Inactive', cls: 'g-idle' }
]

export function Sidebar() {
  const { app, runtimes, selectedProjectId, selectProject, focusedAgentId, view, setShowNewAgent, groupBy, setGroupBy } = useStore()
  const [query, setQuery] = useState('')
  const [projOpen, setProjOpen] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const project = app.projects.find((p) => p.id === selectedProjectId)
  const agents = app.agents.filter(
    (a) => a.projectId === selectedProjectId && (a.name + a.role).toLowerCase().includes(query.toLowerCase())
  )
  const st = (id: string): AgentStatus => runtimes[id]?.status ?? 'idle'
  const count = (s: AgentStatus) => app.agents.filter((a) => a.projectId === selectedProjectId && st(a.id) === s).length

  return (
    <aside className="sidebar">
      {cloning && <CloneRepoModal onClose={() => setCloning(false)} />}
      {/* project switcher */}
      <div className="card">
        <div className="card-title">Project</div>
        <button className="project-switch" onClick={() => setProjOpen(!projOpen)}>
          <Icon name="folder" />
          <span className="name">{project?.name ?? 'Select project'}</span>
          <Icon name="chevron" />
        </button>
        {projOpen && (
          <div className="project-menu">
            {app.projects.map((p) => (
              <button key={p.id} className={p.id === selectedProjectId ? 'on' : ''}
                onClick={() => { selectProject(p.id); setProjOpen(false) }} title={p.path}>
                <Icon name="folder" /> {p.name}
                <span className="n">{app.agents.filter((a) => a.projectId === p.id).length}</span>
              </button>
            ))}
            <button className="add" onClick={() => { window.api.addProject(); setProjOpen(false) }}>
              <Icon name="plus" /> Add folder…
            </button>
            <button className="add" onClick={() => { setCloning(true); setProjOpen(false) }}>
              <Icon name="github" /> Clone from Git…
            </button>
          </div>
        )}

        <div className="card-title" style={{ marginTop: 14 }}>Agents</div>
        <div className="stats">
          <div><b><i className="dot waiting" />{count('waiting')}</b><span>Needs you</span></div>
          <div><b><i className="dot done" />{count('done')}</b><span>To review</span></div>
          <div><b><i className="dot working" />{count('working')}</b><span>Working</span></div>
        </div>
      </div>

      <div className="card search">
        <Icon name="search" size={16} />
        <input placeholder="Search agents…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="group-mode">
        <button className={groupBy === 'status' ? 'on' : ''} onClick={() => setGroupBy('status')}>By status</button>
        <button className={groupBy === 'team' ? 'on' : ''} onClick={() => setGroupBy('team')}>
          <Icon name="users" size={12} /> By team
        </button>
      </div>

      <div className="agent-list">
        {project && agents.length === 0 && <p className="muted small pad">No agents yet.</p>}
        {groupBy === 'team' ? (
          <TeamTree agents={agents} all={app.agents.filter((a) => a.projectId === selectedProjectId)} />
        ) : (
          GROUPS.map((g) => {
            const items = agents.filter((a) => g.status.includes(st(a.id)))
            if (!items.length) return null
            const closed = collapsed[g.title]
            return (
              <div key={g.title} className={`group ${g.cls}`}>
                <button className="group-head" onClick={() => setCollapsed({ ...collapsed, [g.title]: !closed })}>
                  <span className={`chev ${closed ? 'closed' : ''}`}><Icon name="chevron" size={12} /></span>
                  {g.title}
                  <span className="line" />
                  <span className="n">{items.length}</span>
                </button>
                {!closed && items.map((a) => <AgentRow key={a.id} agent={a} />)}
              </div>
            )
          })
        )}
      </div>

      <div className="sidebar-foot">
        <button className="btn-new" disabled={!project} onClick={() => setShowNewAgent(true)}>
          <Icon name="plus" /> New agent
        </button>
      </div>
    </aside>
  )
}

/** Leads with their members nested underneath (any depth). */
function TeamTree({ agents, all }: { agents: Agent[]; all: Agent[] }) {
  const visible = new Set(agents.map((a) => a.id))
  const ids = new Set(all.map((a) => a.id))
  const roots = all.filter((a) => !a.parentId || !ids.has(a.parentId))
  const teams = roots.filter((r) => all.some((a) => a.parentId === r.id))
  const solo = roots.filter((r) => !teams.includes(r))

  const branch = (a: Agent, depth: number): ReactElement[] => {
    const kids = all.filter((k) => k.parentId === a.id)
    const self = visible.has(a.id) ? [<AgentRow key={a.id} agent={a} depth={depth} lead={kids.length > 0} />] : []
    return [...self, ...kids.flatMap((k) => branch(k, depth + 1))]
  }

  return (
    <>
      {teams.map((lead) => {
        const size = all.filter((a) => a.parentId === lead.id).length
        return (
          <div key={lead.id} className="group team-group" style={{ ['--agent' as string]: lead.color }}>
            <div className="group-head team-head">
              <Icon name="crown" size={12} />
              {lead.name}&apos;s team
              <span className="line" />
              <span className="n">{size + 1}</span>
            </div>
            <div className="team-tree">{branch(lead, 0)}</div>
          </div>
        )
      })}
      {solo.some((a) => visible.has(a.id)) && (
        <div className="group g-idle">
          <div className="group-head">
            No team
            <span className="line" />
            <span className="n">{solo.length}</span>
          </div>
          {solo.filter((a) => visible.has(a.id)).map((a) => <AgentRow key={a.id} agent={a} />)}
          <p className="muted small hint">Tip: right-click an agent → <b>Add team member</b>, or set <b>Reports to</b> in Edit.</p>
        </div>
      )}
    </>
  )
}

function AgentRow({ agent: a, depth = 0, lead }: { agent: Agent; depth?: number; lead?: boolean }) {
  const { runtimes, lastLines, focusedAgentId, focusAgent, view, openMenu } = useStore()
  const menuFor = useStore((s) => s.menu?.agentId)
  const isLead = useStore((s) => lead ?? s.app.agents.some((x) => x.parentId === a.id))
  const rt = runtimes[a.id]
  const s: AgentStatus = rt?.status ?? 'idle'
  return (
    <div role="button" tabIndex={0}
      className={`agent-row ${a.id === focusedAgentId && view === 'focus' ? 'active' : ''} ${menuFor === a.id ? 'menu-open' : ''} ${depth ? 'nested' : ''}`}
      style={{ ['--agent' as string]: a.color, ['--depth' as string]: depth }} onClick={() => focusAgent(a.id)}
      onKeyDown={(e) => e.key === 'Enter' && focusAgent(a.id)}
      onContextMenu={(e) => openMenu(e, a.id)}>
      <span className="av">
        <Character head seed={a.id} color={a.color} status={s} size={depth ? 32 : 38} />
        <i className={`badge dot ${s}`} />
        {isLead && <span className="crown" title="Team lead"><Icon name="crown" size={11} /></span>}
      </span>
      <span className="txt">
        <b>{a.name}</b>
        <small className={s === 'error' ? 'err' : ''} title={rt?.exitReason}>
          {s === 'working' ? (lastLines[a.id] || 'Working…') : s === 'error' ? (rt?.exitReason ?? 'Error') : `${a.role} · ${STATUS_LABEL[s]}`}
        </small>
      </span>
      {rt?.running && <span className="ago">{timeAgo(rt.lastActivity)}</span>}
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        {rt?.running ? (
          <button className="icon-btn danger" title="Stop agent" onClick={() => agentCommands(a).stop()}>
            <Icon name="power" size={14} />
          </button>
        ) : (
          <button className="icon-btn" title="Start" onClick={() => agentCommands(a).start()}>
            <Icon name="play" size={14} />
          </button>
        )}
        <button className="icon-btn" title="More" onClick={(e) => openMenu(e, a.id)}>
          <Icon name="more" size={14} />
        </button>
      </span>
    </div>
  )
}
