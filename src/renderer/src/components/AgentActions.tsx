import type { Agent } from '@shared/types'
import { useStore } from '../store'
import { agentCommands } from './agentCommands'
import { Icon } from './common'

export function AgentActions({ agent, compact }: { agent: Agent; compact?: boolean }) {
  const running = useStore((s) => !!s.runtimes[agent.id]?.running)
  const openMenu = useStore((s) => s.openMenu)
  const c = agentCommands(agent)

  return (
    <div className="agent-actions">
      {running ? (
        <>
          <button className="icon-btn" title="Restart" onClick={c.restart}><Icon name="restart" /></button>
          <button className="icon-btn danger" title="Stop agent" onClick={c.stop}><Icon name="power" /></button>
        </>
      ) : (
        <>
          <button className="icon-btn" title="Start new session" onClick={c.start}><Icon name="play" /></button>
          <button className="icon-btn" title="Resume last session" onClick={c.resume}><Icon name="restart" /></button>
        </>
      )}
      {!compact && <button className="icon-btn" title="Open folder" onClick={c.openFolder}><Icon name="folder" /></button>}
      <button className="icon-btn" title="More" onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        openMenu({ clientX: r.left, clientY: r.bottom + 4, preventDefault() {}, stopPropagation() {} }, agent.id)
      }}>
        <Icon name="more" />
      </button>
    </div>
  )
}
