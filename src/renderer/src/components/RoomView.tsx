import type { Agent } from '@shared/types'
import { useStore } from '../store'
import { Character } from './Character'
import { Icon, STATUS_LABEL } from './common'
import { Office } from './office/Office'
import { useLayout } from '../layout'

function Desk({ agent, lead }: { agent: Agent; lead?: boolean }) {
  const status = useStore((s) => s.runtimes[agent.id]?.status ?? 'idle')
  const line = useStore((s) => s.lastLines[agent.id])
  const provider = useStore((s) => s.app.providers.find((p) => p.id === agent.providerId))
  const focusAgent = useStore((s) => s.focusAgent)
  const openMenu = useStore((s) => s.openMenu)
  const reason = useStore((s) => s.runtimes[agent.id]?.exitReason)
  const speech =
    status === 'waiting' ? 'Your turn!'
    : status === 'done' ? 'Done — ready for review'
    : status === 'idle' ? 'On a break…'
    : status === 'error' ? (reason ?? 'Something went wrong')
    : line || 'Working…'

  return (
    <button className={`desk status-${status}`} style={{ ['--agent' as string]: agent.color }} onClick={() => focusAgent(agent.id)}
      onContextMenu={(e) => openMenu(e, agent.id)} title={reason ?? 'Click to open · right-click for actions'}>
      <div className="speech">{status === 'working' && line ? <code>{speech}</code> : speech}</div>
      <div className="spot" />
      <Character seed={agent.id} color={agent.color} status={status} size={170} />
      {lead && <span className="desk-crown" title="Team lead"><Icon name="crown" size={14} /></span>}
      <div className="nameplate">
        <span className="dot" />
        <strong>{agent.name}</strong>
      </div>
      <div className="desk-sub">
        {agent.role} · {provider?.name ?? agent.providerId} · <span className="st">{STATUS_LABEL[status]}</span>
      </div>
    </button>
  )
}

export function RoomView({ agents }: { agents: Agent[] }) {
  const mode = useLayout((s) => s.roomMode)
  const setL = useLayout((s) => s.set)
  const toggle = (
    <div className="seg sm room-mode">
      <button className={mode === 'office' ? 'on' : ''} onClick={() => setL({ roomMode: 'office' })}>Office</button>
      <button className={mode === 'desks' ? 'on' : ''} onClick={() => setL({ roomMode: 'desks' })}>Desks</button>
    </div>
  )
  if (mode === 'office') return <div className="room office-room">{toggle}<Office agents={agents} /></div>
  return <DeskRoom agents={agents} toggle={toggle} />
}

function DeskRoom({ agents, toggle }: { agents: Agent[]; toggle: React.ReactNode }) {
  const setShowNewAgent = useStore((s) => s.setShowNewAgent)
  const addMember = useStore((s) => s.addMember)
  const running = useStore((s) => agents.filter((a) => s.runtimes[a.id]?.running).length)

  const ids = new Set(agents.map((a) => a.id))
  const rootOf = (a: Agent): Agent => {
    let cur = a
    for (let i = 0; cur.parentId && ids.has(cur.parentId) && i < 50; i++) cur = agents.find((x) => x.id === cur.parentId)!
    return cur
  }
  const teams = new Map<string, Agent[]>()
  for (const a of agents) {
    const r = rootOf(a)
    teams.set(r.id, [...(teams.get(r.id) ?? []), a])
  }
  const pods = [...teams.entries()].filter(([, m]) => m.length > 1)
  const solo = [...teams.entries()].filter(([, m]) => m.length === 1).map(([, m]) => m[0])
  // lead first, then members in hierarchy order
  const ordered = (members: Agent[], leadId: string): Agent[] => {
    const out: Agent[] = []
    const walk = (id: string): void => {
      const a = members.find((m) => m.id === id)
      if (a) out.push(a)
      members.filter((m) => m.parentId === id).forEach((m) => walk(m.id))
    }
    walk(leadId)
    return out
  }

  return (
    <div className="room">
      {toggle}
      <div className="wall">
        <div className="window"><span /><span /></div>
        <div className="poster">{agents.length} agents · {running} active</div>
        <div className="clock"><span className="h" /><span className="m" /></div>
      </div>
      <div className="floor">
        {pods.map(([leadId, members]) => {
          const lead = members.find((m) => m.id === leadId)!
          return (
            <section key={leadId} className="pod" style={{ ['--agent' as string]: lead.color }}>
              <header className="pod-head">
                <Icon name="crown" size={13} /> {lead.name}&apos;s team
                <span className="muted">· {members.length} agents</span>
                <button className="icon-btn" title="Add team member" onClick={() => addMember(lead.id)}>
                  <Icon name="userPlus" size={14} />
                </button>
              </header>
              <div className="pod-desks">
                {ordered(members, leadId).map((a) => (
                  <Desk key={a.id} agent={a} lead={members.some((m) => m.parentId === a.id)} />
                ))}
              </div>
            </section>
          )
        })}
        <div className="open-office">
          {solo.map((a) => <Desk key={a.id} agent={a} />)}
          <button className="desk empty" onClick={() => setShowNewAgent(true)}>
            <div className="plus">+</div>
            <div className="desk-sub">Empty desk · add an agent</div>
          </button>
        </div>
      </div>
    </div>
  )
}
