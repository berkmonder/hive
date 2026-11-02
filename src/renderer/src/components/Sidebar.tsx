import { useState, type ReactElement } from 'react'
import type { Agent, AgentStatus } from '@shared/types'
import { useStore } from '../store'
import { decodeAgent } from '@shared/library'
import { CloneRepoModal, ImportSessionsModal } from './More'
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
  const unread = useStore((st) => st.unread)
  const [cloning, setCloning] = useState(false)
  const [importing, setImporting] = useState(false)
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
      {importing && <ImportSessionsModal onClose={() => setImporting(false)} />}
      {/* project switcher */}
      <div className="card">
        <div className="card-title">Project</div>
        <button className="project-switch" onClick={() => setProjOpen(!projOpen)}>
          <Icon name="folder" />
          <span className="name">{project?.name ?? 'Select project'}</span>
          {app.agents.some((a) => a.projectId !== selectedProjectId && unread[a.id]) && <i className="unread-dot" title="Unread replies in another project" />}
          <Icon name="chevron" />
        </button>
        {projOpen && (
          <div className="project-menu">
            {app.projects.map((p) => (
              <button key={p.id} className={p.id === selectedProjectId ? 'on' : ''}
                onClick={() => { selectProject(p.id); setProjOpen(false) }} title={p.path}>
                <Icon name="folder" /> {p.name}
                {p.id !== selectedProjectId && app.agents.some((a) => a.projectId === p.id && unread[a.id]) && <i className="unread-dot" title="Unread replies" />}
                <span className="n">{app.agents.filter((a) => a.projectId === p.id).length}</span>
              </button>
            ))}
            <button className="add" onClick={() => { window.api.addProject(); setProjOpen(false) }}>
              <Icon name="plus" /> Add folder…
            </button>
            <button className="add" onClick={() => { setCloning(true); setProjOpen(false) }}>
              <Icon name="github" /> Clone from Git…
            </button>
            {selectedProjectId && (
              <button className="add" onClick={() => { setImporting(true); setProjOpen(false) }}>
                <Icon name="terminal" /> Continue a terminal session…
              </button>
            )}
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
        <button className={`icon-btn ${groupBy === 'team' ? 'on' : ''}`} title={groupBy === 'team' ? 'Grouped by team – click to group by status' : 'Grouped by status – click to group by team'} onClick={() => setGroupBy(groupBy === 'team' ? 'status' : 'team')}>
          <Icon name="users" size={15} />
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

      <Dock onImport={() => setImporting(true)} onClone={() => setCloning(true)} />
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
  const unread = useStore((st) => !!st.unread[a.id])
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
        <b>{a.name}{unread && <i className="unread-dot" title="New reply you haven't seen" />}</b>
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

/** Bottom dock: live preview, automations, team, new agent, tools and knowledge shortcuts. */
function Dock({ onImport, onClone }: { onImport: () => void; onClone: () => void }) {
  const st = useStore()
  const { app, selectedProjectId: pid, runtimes, serverRuntimes, unread } = st
  const [menu, setMenu] = useState(false)
  const [paste, setPaste] = useState<string | null>(null)
  const addShared = async (text: string): Promise<void> => {
    if (!pid) return
    try {
      const a = decodeAgent(text)
      if (a.instructions && !app.roles.some((r) => r.name.toLowerCase() === a.role.toLowerCase()))
        await window.api.library.saveRole({ id: `r-${Math.random().toString(36).slice(2, 9)}`, name: a.role, color: a.color, instructions: a.instructions })
      const created = await window.api.createAgent({ projectId: pid, name: a.name, role: a.role, color: a.color, providerId: app.providers.some((p) => p.id === a.providerId) ? a.providerId : app.settings.defaultProviderId, initialPrompt: a.initialPrompt, useWorktree: false })
      setPaste(null)
      st.focusAgent(created.id)
      st.toast(`Added ${a.name}`, 'success')
    } catch (e) {
      st.toast(`Could not add the agent: ${(e as Error).message}`, 'error')
    }
  }
  const agents = app.agents.filter((a) => a.projectId === pid)
  const ids = new Set(agents.map((a) => a.id))
  const running = agents.filter((a) => runtimes[a.id]?.running).length
  const servers = app.servers.filter((s) => s.projectId === pid)
  const live = servers.map((s) => ({ s, r: serverRuntimes[s.id] })).find((x) => x.r?.running)
  const liveUrl = live ? live.s.url || live.r?.url : undefined
  const autos = app.schedules.filter((x) => ids.has(x.agentId)).length + app.triggers.filter((x) => ids.has(x.agentId)).length + app.workflows.filter((w) => w.projectId === pid).length
  const unreadIds = agents.filter((a) => unread[a.id]).map((a) => a.id)
  const ideas = app.ideas.filter((i) => i.projectId === pid).length
  const hasMemory = !!(pid && app.memory[pid]?.trim())
  const btn = (icon: Parameters<typeof Icon>[0]['name'], title: string, onClick: () => void, badge?: number | string, dot?: boolean, on?: boolean) => (
    <button className={`dock-btn ${on ? 'on' : ''}`} title={title} disabled={!pid} onClick={onClick}>
      <Icon name={icon} size={17} />
      {badge ? <span className="dock-badge">{badge}</span> : null}
      {dot && <i className="dock-dot" />}
    </button>
  )
  return (
    <div className="dock">
      {liveUrl && (
        <button className="dock-live" title="Open the live preview" onClick={() => st.setView('servers')}>
          <i className="live-dot" /> <span>Live preview</span> <span className="mono muted">{liveUrl.replace(/^https?:\/\//, '')}</span>
          <span className="spacer" />
          <span title="Open in browser" onClick={(e) => { e.stopPropagation(); window.api.openLink(liveUrl) }}><Icon name="external" size={13} /></span>
        </button>
      )}
      <div className="dock-row">
        <button className="dock-pill" disabled={!pid} title="Schedules, webhooks and workflows" onClick={() => st.openTab('board', 'schedules')}>
          <Icon name="clock" size={15} /> <span>Automations</span>{autos > 0 && <sup>{autos}</sup>}
        </button>
        <div className="dock-new">
          <button className="dock-new-main" disabled={!pid} onClick={() => st.setShowNewAgent(true)}><Icon name="plus" size={15} /> New agent</button>
          <button className="dock-new-more" disabled={!pid} title="More ways to add an agent" onClick={() => setMenu(!menu)}><span className={`chev ${menu ? '' : 'closed'}`}><Icon name="chevronUp" size={13} /></span></button>
          {menu && (
            <div className="dock-menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => { setMenu(false); st.setShowNewAgent(true) }}><Icon name="plus" size={14} /> New agent</button>
              <button onClick={() => { setMenu(false); onImport() }}><Icon name="terminal" size={14} /> Continue a terminal session…</button>
              <button onClick={() => { setMenu(false); st.setShowLibrary('roles') }}><Icon name="book" size={14} /> Roles & prompts…</button>
              <button onClick={() => { setMenu(false); setPaste('') }}><Icon name="inbox" size={14} /> Paste a shared agent…</button>
              <button onClick={() => { setMenu(false); onClone() }}><Icon name="github" size={14} /> New project from Git…</button>
            </div>
          )}
        </div>
      </div>
      {paste !== null && (
        <div className="backdrop" onMouseDown={() => setPaste(null)}>
          <div className="modal small-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Paste a shared agent</h2>
            <p className="muted small">A teammate copies an agent with right-click → <b>Share agent</b>. Its role comes along if you don't have it yet.</p>
            <textarea rows={5} className="mono" autoFocus value={paste} placeholder="hive-agent:…" onChange={(e) => setPaste(e.target.value)} />
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setPaste(null)}>Cancel</button>
              <button className="btn" disabled={!paste.trim()} onClick={() => addShared(paste)}>Add agent</button>
            </div>
          </div>
        </div>
      )}
      <div className="dock-groups">
        <div className="dock-group">
          <div className="dock-icons">
            {btn('terminal', 'Terminal grid – running agents', () => st.setView('grid'), running || undefined, false, st.view === 'grid')}
            {btn('activity', 'Dev servers & live preview', () => st.setView('servers'), undefined, !!live, st.view === 'servers')}
            {btn('inbox', 'Idea radar', () => st.openTab('board', 'ideas'), ideas || undefined)}
            {btn('bell', unreadIds.length ? 'Open the next unread reply' : 'No unread replies', () => unreadIds[0] && st.focusAgent(unreadIds[0]), unreadIds.length || undefined)}
          </div>
          <span className="dock-label tools">Tools</span>
        </div>
        <div className="dock-group">
          <div className="dock-icons">
            {btn('book', 'Prompt library', () => st.setShowLibrary('prompts'), app.prompts.length || undefined)}
            {btn('zap', 'Skills', () => st.openTab('project', 'skills'), app.skills.length || undefined)}
            {btn('brain', 'Project memory', () => st.openTab('project', 'memory'), undefined, hasMemory)}
            {btn('plug', 'MCP servers', () => st.openTab('project', 'mcp'), app.mcpServers.filter((m) => m.enabled).length || undefined)}
          </div>
          <span className="dock-label knowledge">Knowledge</span>
        </div>
      </div>
    </div>
  )
}
