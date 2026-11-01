import type { Agent } from '@shared/types'
import { useStore } from '../store'
import { cleanError } from './common'

/** All agent actions in one place so the context menu, buttons and shortcuts behave the same. */
export function agentCommands(agent: Agent) {
  const { toast, focusAgent } = useStore.getState()
  const run = (p: Promise<unknown>, ok?: string): void => {
    p.then(() => ok && toast(ok, 'success')).catch((e) => toast(cleanError(e), 'error'))
  }
  return {
    open: () => focusAgent(agent.id),
    start: () => run(window.api.startAgent(agent.id, false)),
    resume: () => run(window.api.startAgent(agent.id, true)),
    stop: () => run(window.api.stopAgent(agent.id), `${agent.name} stopped`),
    restart: () => run(window.api.restartAgent(agent.id), `${agent.name} restarted`),
    interrupt: () => window.api.input(agent.id, '\x1b'),
    edit: () => useStore.getState().setEditingAgent(agent.id),
    duplicate: () => run(window.api.duplicateAgent(agent.id), `Duplicated ${agent.name}`),
    openFolder: async () => window.api.openPath(await window.api.agentCwd(agent.id)),
    copyPath: async () => {
      await window.api.copyText(await window.api.agentCwd(agent.id))
      toast('Path copied', 'success')
    },
    fork: () =>
      window.api
        .forkAgent(agent.id)
        .then((a) => {
          toast(`Forked into ${a.name}`, 'success')
          focusAgent(a.id)
        })
        .catch((e) => toast(cleanError(e), 'error')),
    ask: () => useStore.setState({ askTarget: agent.id }),
    morph: (x: number, y: number) => useStore.setState({ morphTarget: { agentId: agent.id, x, y } }),
    pause: () => run(window.api.pauseAgent(agent.id), `${agent.name} will pause after its current turn`),
    schedule: () => {
      useStore.setState({ scheduleFor: agent.id })
      useStore.getState().setView('board')
    },
    planMode: () => run(window.api.automation.planMode(agent.id), `${agent.name} restarted in plan mode`),
    runTests: () => run(window.api.automation.runTests(agent.id)),
    remove: () => {
      const extra = agent.worktreePath ? '\n\nIts worktree folder will be removed too (the branch is kept).' : ''
      if (confirm(`Remove agent "${agent.name}"?${extra}`)) run(window.api.removeAgent(agent.id), `${agent.name} removed`)
    }
  }
}
