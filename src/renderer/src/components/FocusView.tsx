import { useRef, useState } from 'react'
import { Resizer } from './Resizer'
import { clamp, useLayout } from '../layout'
import { Composer } from './Composer'
import { AgentSignals } from './PlanReview'
import { ChatView, ContextBadge, useConversation } from './ChatView'
import { fmtTok, fmtUsd, useUsage } from './UsageView'
import { useStore } from '../store'
import { Terminal } from './Terminal'
import { Character } from './Character'
import { ChangesPanel } from './ChangesPanel'
import { AgentActions } from './AgentActions'
import { Icon, StatusPill } from './common'
import { agentCommands } from './agentCommands'

export function FocusView() {
  const { app, runtimes, focusedAgentId } = useStore()
  const [changes, setChanges] = useState<'hidden' | 'side' | 'full'>('hidden')
  const showChanges = changes !== 'hidden'
  const setShowChanges = (v: boolean): void => setChanges(v ? 'side' : 'hidden')
  const L = useLayout()
  const base = useRef(0)
  const agent = app.agents.find((a) => a.id === focusedAgentId)
  const conv = useConversation(focusedAgentId ?? '', !!agent && agent.providerId === 'claude')
  if (!agent) return null
  const rt = runtimes[agent.id]
  const status = rt?.status ?? 'idle'
  const provider = app.providers.find((p) => p.id === agent.providerId)
  const c = agentCommands(agent)
  const start = (resume: boolean) => (resume ? c.resume() : c.start())

  return (
    <div className="focus" style={{ ['--agent' as string]: agent.color }}>
      <section className={`focus-main ${changes === 'full' ? 'hidden' : ''}`}>
        <header className="agent-head" onContextMenu={(e) => useStore.getState().openMenu(e, agent.id)}>
          <span className={`av-lg st-${status}`}>
            <Character head seed={agent.id} color={agent.color} status={status} size={46} />
          </span>
          <div className="agent-meta">
            <div className="agent-title">{agent.name}</div>
            <div className="chips">
              <span className="chip role"><i className="dot" style={{ background: agent.color }} />{agent.role}</span>
              <StatusPill status={status} />
              {rt?.pausing && <span className="chip pausing"><Icon name="pause" size={11} /> pausing after this turn</span>}
              {agent.paused && !rt?.running && <span className="chip pausing"><Icon name="pause" size={11} /> paused</span>}
              <ContextBadge conv={conv} />
              <UsageChip agentId={agent.id} />
              {agent.branch && <span className="chip mono"><Icon name="branch" size={11} />{agent.branch}</span>}
              <span className="chip">{provider?.name ?? agent.providerId}</span>
            </div>
          </div>
          {agent.providerId === 'claude' && (
            <div className="seg sm view-toggle">
              <button className={L.focusMode === 'terminal' ? 'on' : ''} title="Terminal" onClick={() => L.set({ focusMode: 'terminal' })}><Icon name="terminal" size={13} /></button>
              <button className={L.focusMode === 'chat' ? 'on' : ''} title="Conversation view" onClick={() => L.set({ focusMode: 'chat' })}><Icon name="message" size={13} /></button>
            </div>
          )}
          {agent.providerId === 'claude' && (
            <button className="icon-btn" title="Ask a side question (doesn't interrupt)" onClick={c.ask}><Icon name="bubble" /></button>
          )}
          <button className="btn ghost sm" title="Browse and edit this agent's files" onClick={() => useStore.getState().openCode(agent.worktreePath ?? app.projects.find((p) => p.id === agent.projectId)?.path)}>
            <Icon name="code" size={14} /> Code
          </button>
          <AgentActions agent={agent} />
          <button className={`icon-btn ${showChanges ? 'on' : ''}`} title="Files & changes" onClick={() => setShowChanges(!showChanges)}>
            <Icon name="panel" />
          </button>
          <button className="icon-btn" title="Close" onClick={() => useStore.getState().focusAgent(null)}>
            <Icon name="x" />
          </button>
        </header>

        <TeamStrip agentId={agent.id} />
        <AgentSignals agentId={agent.id} />
        <div className="term-wrap">
          {rt && agent.providerId === 'claude' && L.focusMode === 'chat' ? (
            <ChatView agentId={agent.id} conv={conv} />
          ) : rt ? (
            <Terminal key={agent.id} agentId={agent.id} autoFocus />
          ) : (
            <div className="empty-term">
              <Character seed={agent.id} color={agent.color} status="idle" size={150} />
              <p>{agent.name} is not running</p>
              <div className="row">
                <button className="btn" onClick={() => start(false)}><Icon name="play" /> New session</button>
                <button className="btn ghost" onClick={() => start(true)}><Icon name="restart" /> Resume last session</button>
              </div>
            </div>
          )}
        </div>

        {rt && !rt.running && (
          <div className={`exit-bar status-${status}`}>
            <i className="dot" />
            <span>{status === 'error' ? (rt.exitReason ?? 'The agent exited with an error') : status === 'done' ? 'The agent finished and exited.' : 'Agent stopped.'}</span>
            <div className="spacer" />
            <button className="btn ghost" onClick={() => start(true)}><Icon name="restart" /> Resume</button>
            <button className="btn" onClick={() => start(false)}><Icon name="play" /> New session</button>
          </div>
        )}
        <Composer agentId={agent.id} />
      </section>

      {showChanges ? (
        <>
          {changes === 'side' && (
            <Resizer axis="x" className="panel-resizer" onStart={() => (base.current = L.changesW)}
              onDrag={(d) => L.set({ changesW: clamp(base.current - d, 300, Math.max(320, window.innerWidth - L.sidebarW - 480)) })}
              onReset={() => L.reset('changesW')} />
          )}
          <ChangesPanel agent={agent} mode={changes === 'full' ? 'full' : 'side'} onMode={setChanges} onClose={() => setChanges('hidden')} />
        </>
      ) : (
        <button className="rail" onClick={() => setShowChanges(true)}>
          <Icon name="panel" />
          <span>Files &amp; changes</span>
        </button>
      )}
    </div>
  )
}

function TeamStrip({ agentId }: { agentId: string }) {
  const { app, runtimes, focusAgent, teamEvents, addMember } = useStore()
  const me = app.agents.find((a) => a.id === agentId)!
  const lead = app.agents.find((a) => a.id === me.parentId)
  const members = app.agents.filter((a) => a.parentId === agentId)
  if (!lead && !members.length) return null
  const names = new Set([me.name, ...members.map((m) => m.name)])
  const last = [...teamEvents].reverse().find((e) => names.has(e.from) && names.has(e.to))
  return (
    <div className="team-strip">
      {lead && (
        <button className="team-chip lead" style={{ ['--agent' as string]: lead.color }} onClick={() => focusAgent(lead.id)}>
          <Icon name="crown" size={12} /> Reports to <b>{lead.name}</b>
        </button>
      )}
      {members.length > 0 && (
        <>
          <span className="team-label"><Icon name="crown" size={12} /> Leads</span>
          {members.map((m) => (
            <button key={m.id} className={`team-chip status-${runtimes[m.id]?.status ?? 'idle'}`} style={{ ['--agent' as string]: m.color }}
              onClick={() => focusAgent(m.id)} title={`${m.role} · ${runtimes[m.id]?.status ?? 'idle'}`}>
              <Character head seed={m.id} color={m.color} status={runtimes[m.id]?.status ?? 'idle'} size={18} />
              {m.name}
              <i className="dot" />
            </button>
          ))}
          <button className="icon-btn" title="Add team member" onClick={() => addMember(agentId)}>
            <Icon name="userPlus" size={14} />
          </button>
        </>
      )}
      {last && (
        <span className="team-last" title={last.text}>
          {last.kind === 'task' ? '→' : '←'} {last.kind === 'task' ? `${last.from} → ${last.to}` : `${last.from} reported`}: {last.text}
        </span>
      )}
    </div>
  )
}

function UsageChip({ agentId }: { agentId: string }) {
  const projectId = useStore((s) => s.app.agents.find((a) => a.id === agentId)?.projectId)
  const { report } = useUsage(projectId, 30000)
  const u = report?.agents.find((x) => x.agentId === agentId)
  if (!u || !u.sessions) return null
  return (
    <span className="chip usage-chip" title={`${u.sessions} sessions · input ${fmtTok(u.input)} · output ${fmtTok(u.output)} · cache ${fmtTok(u.cacheRead + u.cacheWrite)} (estimated API cost)`}
      onClick={() => useStore.getState().setView('usage')} style={{ cursor: 'pointer' }}>
      <Icon name="chart" size={11} /> {fmtUsd(u.cost)} · {fmtTok(u.input + u.output + u.cacheRead + u.cacheWrite)}
    </span>
  )
}
