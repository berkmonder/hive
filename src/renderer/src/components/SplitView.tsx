import { useStore } from '../store'
import { useLayout } from '../layout'
import { Terminal } from './Terminal'
import { Composer } from './Composer'
import { Character } from './Character'
import { Icon, StatusPill } from './common'
import { agentCommands } from './agentCommands'

/** Several agents side by side (columns) or stacked (rows), each with its own prompt box. */
export function SplitView() {
  const { app, runtimes, selectedProjectId } = useStore()
  const L = useLayout()
  const agents = app.agents.filter((a) => a.projectId === selectedProjectId)
  const ids = L.splitIds.filter((id) => agents.some((a) => a.id === id))
  const shown = ids.length ? ids : agents.slice(0, 2).map((a) => a.id)
  const toggle = (id: string): void => {
    const cur = shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id].slice(-4)
    L.set({ splitIds: cur })
  }
  return (
    <div className="split-view">
      <header className="split-bar">
        <span className="muted small">Show</span>
        {agents.map((a) => (
          <button key={a.id} className={`split-chip ${shown.includes(a.id) ? 'on' : ''}`} style={{ ['--agent' as string]: a.color }} onClick={() => toggle(a.id)}>
            <Character head seed={a.id} color={a.color} status={runtimes[a.id]?.status ?? 'idle'} size={18} /> {a.name}
          </button>
        ))}
        <div className="spacer" />
        <div className="seg sm">
          <button className={L.splitDir === 'cols' ? 'on' : ''} title="Columns" onClick={() => L.set({ splitDir: 'cols' })}><Icon name="columns" size={13} /></button>
          <button className={L.splitDir === 'rows' ? 'on' : ''} title="Rows" onClick={() => L.set({ splitDir: 'rows' })}><Icon name="rows" size={13} /></button>
        </div>
      </header>
      <div className={`split-panes ${L.splitDir}`} style={{ [L.splitDir === 'cols' ? 'gridTemplateColumns' : 'gridTemplateRows']: `repeat(${shown.length || 1}, minmax(0, 1fr))` }}>
        {shown.map((id) => {
          const a = agents.find((x) => x.id === id)
          if (!a) return null
          const rt = runtimes[id]
          const c = agentCommands(a)
          return (
            <section key={id} className={`split-pane status-${rt?.status ?? 'idle'}`} style={{ ['--agent' as string]: a.color }}>
              <header onContextMenu={(e) => useStore.getState().openMenu(e, a.id)}>
                <Character head seed={a.id} color={a.color} status={rt?.status ?? 'idle'} size={24} />
                <b>{a.name}</b>
                <span className="muted small">{a.role}</span>
                <StatusPill status={rt?.status ?? 'idle'} />
                <div className="spacer" />
                {!rt?.running && <button className="icon-btn" title="Start" onClick={c.start}><Icon name="play" size={14} /></button>}
                <button className="icon-btn" title="Open" onClick={c.open}><Icon name="expand" size={14} /></button>
                <button className="icon-btn" title="Hide from split" onClick={() => toggle(id)}><Icon name="x" size={14} /></button>
              </header>
              <div className="split-term">{rt ? <Terminal agentId={id} /> : <div className="empty-term small muted">Not running</div>}</div>
              <Composer agentId={id} compact />
            </section>
          )
        })}
        {!shown.length && <div className="welcome muted">No agents in this project yet.</div>}
      </div>
    </div>
  )
}
