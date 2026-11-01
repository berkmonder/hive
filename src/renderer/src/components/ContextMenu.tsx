import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { agentCommands } from './agentCommands'
import { Icon } from './common'
import { Character } from './Character'

type Item = { label: string; icon: Parameters<typeof Icon>[0]['name']; run: () => void; danger?: boolean; hint?: string } | '-'

export function ContextMenu() {
  const menu = useStore((s) => s.menu)
  const close = useStore((s) => s.closeMenu)
  const agent = useStore((s) => s.app.agents.find((a) => a.id === s.menu?.agentId))
  const rt = useStore((s) => (s.menu ? s.runtimes[s.menu.agentId] : undefined))
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [menu, close])

  // keep the menu on screen
  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8)
    })
  }, [menu])

  if (!menu || !agent) return null
  const c = agentCommands(agent)
  const all = useStore.getState().app.agents
  const team: typeof all = []
  const collect = (id: string): void => all.filter((a) => a.parentId === id).forEach((a) => (team.push(a), collect(a.id)))
  collect(agent.id)
  const running = !!rt?.running
  const items: Item[] = [
    { label: 'Open', icon: 'expand', run: c.open },
    '-',
    ...(running
      ? ([
          { label: 'Stop agent', icon: 'stop', run: c.stop },
          { label: 'Restart', icon: 'restart', run: c.restart },
          { label: 'Interrupt (Esc)', icon: 'x', run: c.interrupt }
        ] as Item[])
      : ([
          { label: 'Start new session', icon: 'play', run: c.start },
          { label: 'Resume last session', icon: 'restart', run: c.resume }
        ] as Item[])),
    '-',
    { label: 'Send prompt…', icon: 'book', run: () => useStore.setState({ promptTarget: { agentIds: [agent.id], x: menu.x, y: menu.y } }) },
    ...(team.length
      ? ([{ label: `Send prompt to team (${team.length + 1})…`, icon: 'users', run: () => useStore.setState({ promptTarget: { agentIds: [agent.id, ...team.map((t) => t.id)], x: menu.x, y: menu.y } }) }] as Item[])
      : []),
    '-',
    ...(agent.providerId === 'claude'
      ? ([
          { label: 'Ask (side question)…', icon: 'bubble', run: c.ask },
          { label: 'Fork conversation', icon: 'fork', run: c.fork },
          { label: 'Session replay', icon: 'activity', run: c.replay }
        ] as Item[])
      : []),
    ...(agent.providerId === 'claude' ? ([{ label: 'Restart in plan mode', icon: 'list', run: c.planMode }] as Item[]) : []),
    { label: 'Run tests now', icon: 'check', run: c.runTests },
    { label: 'Change role…', icon: 'restart', run: () => c.morph(menu.x, menu.y) },
    { label: 'Schedule a task…', icon: 'clock', run: c.schedule },
    ...(running ? ([{ label: 'Pause after this turn', icon: 'pause', run: c.pause }] as Item[]) : []),
    '-',
    { label: 'Edit…', icon: 'edit', run: c.edit },
    { label: 'Add team member…', icon: 'userPlus', run: () => useStore.getState().addMember(agent.id) },
    { label: 'Duplicate', icon: 'copy', run: c.duplicate },
    { label: 'Open folder', icon: 'folder', run: c.openFolder },
    { label: 'Copy path', icon: 'copy', run: c.copyPath },
    '-',
    { label: 'Remove agent', icon: 'trash', run: c.remove, danger: true }
  ]

  return (
    <div className="ctx-layer" onMouseDown={close} onContextMenu={(e) => (e.preventDefault(), close())}>
      <div className="ctx" ref={ref} style={{ left: pos.x || menu.x, top: pos.y || menu.y }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="ctx-head" style={{ ['--agent' as string]: agent.color }}>
          <Character head seed={agent.id} color={agent.color} status={rt?.status ?? 'idle'} size={28} />
          <div>
            <b>{agent.name}</b>
            <small>{agent.role}</small>
          </div>
        </div>
        {items.map((it, i) =>
          it === '-' ? (
            <div key={i} className="ctx-sep" />
          ) : (
            <button key={i} className={`ctx-item ${it.danger ? 'danger' : ''}`} onClick={() => (close(), it.run())}>
              <Icon name={it.icon} size={14} />
              <span>{it.label}</span>
            </button>
          )
        )}
      </div>
    </div>
  )
}
