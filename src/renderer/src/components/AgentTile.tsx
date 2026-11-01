import type { Agent } from '@shared/types'
import { useStore } from '../store'
import { Terminal } from './Terminal'
import { Character } from './Character'
import { Icon, StatusPill } from './common'
import { agentCommands } from './agentCommands'
import { AgentActions } from './AgentActions'

export function AgentTile({ agent }: { agent: Agent }) {
  const rt = useStore((s) => s.runtimes[agent.id])
  const provider = useStore((s) => s.app.providers.find((p) => p.id === agent.providerId))
  const focusAgent = useStore((s) => s.focusAgent)
  const status = rt?.status ?? 'idle'

  return (
    <div className={`tile status-${status}`} style={{ ['--agent' as string]: agent.color }}>
      <header className="tile-head" onDoubleClick={() => focusAgent(agent.id)} onContextMenu={(e) => useStore.getState().openMenu(e, agent.id)}>
        <span className="avatar"><Character head seed={agent.id} color={agent.color} status={status} size={30} /></span>
        <div className="agent-meta">
          <div className="agent-title">{agent.name}</div>
          <div className="sub">
            {agent.role} · {provider?.name ?? agent.providerId}
            {agent.branch && (
              <span className="branch">
                <Icon name="branch" size={11} /> {agent.branch}
              </span>
            )}
          </div>
        </div>
        <StatusPill status={status} />
        <AgentActions agent={agent} compact />
        <button className="icon-btn" title="Open" onClick={() => focusAgent(agent.id)}>
          <Icon name="expand" />
        </button>
      </header>
      <div className="tile-body">
        {rt ? (
          <Terminal agentId={agent.id} compact />
        ) : (
          <div className="empty-term">
            <p>Not running</p>
            <div className="row">
              <button className="btn" onClick={() => agentCommands(agent).start()}>
                <Icon name="play" /> Start
              </button>
              <button className="btn ghost" onClick={() => agentCommands(agent).resume()}>
                <Icon name="restart" /> Resume
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
