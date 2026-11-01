import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Icon, cleanError } from './common'
import { Character } from './Character'
import { promptFor, sendPrompt } from './Library'

type IconName = Parameters<typeof Icon>[0]['name']
interface Cmd {
  id: string
  group: string
  label: string
  hint?: string
  icon?: IconName
  agent?: { id: string; color: string }
  run: (alt: boolean) => void
}

const fuzzy = (q: string, s: string): number => {
  if (!q) return 1
  const t = s.toLowerCase()
  const i = t.indexOf(q)
  if (i >= 0) return 100 - i
  let j = 0
  for (const c of t) if (c === q[j]) j++
  return j === q.length ? 10 : 0
}

/** ⌘K: agents, files, prompts, skills, cards, dev servers, views and actions in one box. */
export function Palette() {
  const open = useStore((s) => s.paletteOpen)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const st = useStore()
  const project = st.app.projects.find((p) => p.id === st.selectedProjectId)
  const focused = st.app.agents.find((a) => a.id === st.focusedAgentId)

  useEffect(() => {
    if (!open) return
    setQ('')
    setSel(0)
    setTimeout(() => input.current?.focus(), 10)
    if (project) window.api.fs.listAll(project.path).then((f) => setFiles(f.slice(0, 5000))).catch(() => setFiles([]))
  }, [open, project])

  const cmds = useMemo<Cmd[]>(() => {
    if (!open) return []
    const close = (): void => st.setPalette(false)
    const go = (fn: () => void) => () => (close(), fn())
    const out: Cmd[] = []
    const agents = st.app.agents.filter((a) => a.projectId === st.selectedProjectId)
    for (const a of agents)
      out.push({ id: `a:${a.id}`, group: 'Agents', label: a.name, hint: `${a.role} · ${st.runtimes[a.id]?.status ?? 'idle'}`, agent: { id: a.id, color: a.color }, run: go(() => st.focusAgent(a.id)) })
    const views: [string, IconName, Parameters<typeof st.setView>[0]][] = [
      ['Room', 'room', 'room'], ['Terminal grid', 'grid', 'grid'], ['Split view', 'split', 'split'], ['Backlog & schedules', 'kanban', 'board'],
      ['Code editor', 'code', 'code'], ['Dev servers & preview', 'server', 'servers'], ['Usage & cost', 'chart', 'usage'],
      ['Memory, skills, MCP & processes', 'brain', 'project'], ['Settings', 'gear', 'settings']
    ]
    for (const [l, icon, v] of views) out.push({ id: `v:${v}`, group: 'Go to', label: l, icon, run: go(() => st.setView(v)) })
    const actions: [string, IconName, () => void][] = [
      ['New agent', 'plus', () => st.setShowNewAgent(true)],
      ['Prompt & role library', 'book', () => st.setShowLibrary('prompts')],
      ['Attach a screenshot to the next message', 'camera', async () => {
        const s = await window.api.media.screenshot()
        if (s) useStore.setState({ pendingShots: [...useStore.getState().pendingShots, s] })
      }],
      ...(project
        ? ([
            ['Pause project (after current turns)', 'pause', () => window.api.pauseProject(project.id).then((n) => st.toast(n ? `Pausing ${n} agent${n > 1 ? 's' : ''}…` : 'No running agents'))],
            ['Resume paused agents', 'play', () => window.api.resumeProject(project.id).then((n) => st.toast(n ? `Resuming ${n} agent${n > 1 ? 's' : ''}` : 'Nothing paused'))],
            ['Import GitHub issues', 'github', () => window.api.tasks.importGithub(project.id).then((r) => st.toast(`GitHub: ${r.added} new, ${r.updated} updated`, 'success')).catch((e) => st.toast(cleanError(e), 'error'))]
          ] as [string, IconName, () => void][])
        : []),
      ...(focused
        ? ([
            [`Fork ${focused.name}`, 'fork', () => window.api.forkAgent(focused.id).then((a) => st.focusAgent(a.id)).catch((e) => st.toast(cleanError(e), 'error'))],
            [`Ask ${focused.name} a side question`, 'bubble', () => useStore.setState({ askTarget: focused.id })],
            [`Schedule a task for ${focused.name}`, 'clock', () => (useStore.setState({ scheduleFor: focused.id }), st.setView('board'))]
          ] as [string, IconName, () => void][])
        : [])
    ]
    for (const [l, icon, fn] of actions) out.push({ id: `x:${l}`, group: 'Actions', label: l, icon, run: go(fn) })
    for (const p of st.app.prompts)
      out.push({
        id: `p:${p.id}`, group: 'Prompts', label: p.title, hint: focused ? '⏎ insert · ⌥⏎ send' : 'open an agent first', icon: 'book',
        run: (alt) => {
          close()
          if (!focused) return st.toast('Open an agent first', 'info')
          if (alt) sendPrompt([focused], p.body)
          else st.insertIntoComposer(promptFor(p.body, focused))
        }
      })
    for (const s of st.app.skills)
      out.push({ id: `s:${s.id}`, group: 'Skills', label: s.name, hint: s.description, icon: 'zap', run: go(() => focused ? st.insertIntoComposer(`Follow the "${s.name}" skill:\n${s.body}`) : st.setView('project')) })
    for (const t of st.app.tasks.filter((x) => x.projectId === st.selectedProjectId))
      out.push({ id: `t:${t.id}`, group: 'Backlog', label: t.title, hint: { todo: 'Todo', doing: 'In progress', done: 'Done' }[t.status] + (t.source ? ` · #${t.source.number}` : ''), icon: 'kanban', run: go(() => st.setView('board')) })
    for (const s of st.app.servers.filter((x) => x.projectId === st.selectedProjectId))
      out.push({ id: `d:${s.id}`, group: 'Dev servers', label: `${st.serverRuntimes[s.id]?.running ? 'Open' : 'Start'} ${s.name}`, hint: s.command, icon: 'server', run: go(() => {
        if (!st.serverRuntimes[s.id]?.running) window.api.servers.start(s.id)
        st.setView('servers')
      }) })
    if (project)
      for (const f of files)
        out.push({ id: `f:${f}`, group: 'Files', label: f.split('/').pop()!, hint: f, icon: 'code', run: go(() => st.openCode(focused?.worktreePath ?? project.path, f)) })
    return out
  }, [open, st.app, st.runtimes, st.serverRuntimes, st.selectedProjectId, st.focusedAgentId, files]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const scored = cmds
      .map((c) => ({ c, s: Math.max(fuzzy(qq, c.label), c.group === 'Files' ? fuzzy(qq, c.hint ?? '') * 0.8 : fuzzy(qq, c.hint ?? '') * 0.3) }))
      .filter((x) => x.s > 0 && (qq || x.c.group !== 'Files'))
    if (qq) scored.sort((a, b) => b.s - a.s)
    const perGroup = new Map<string, number>()
    return scored
      .filter(({ c }) => {
        const n = (perGroup.get(c.group) ?? 0) + 1
        perGroup.set(c.group, n)
        return n <= (qq ? 8 : 6)
      })
      .map((x) => x.c)
      .slice(0, 60)
  }, [cmds, q])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    list.current?.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null
  let lastGroup = ''
  return (
    <div className="backdrop pal-back" onMouseDown={() => st.setPalette(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-input">
          <Icon name="search" size={16} />
          <input ref={input} value={q} placeholder="Search agents, files, prompts, skills, cards, actions…" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') st.setPalette(false)
              else if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(shown.length - 1, s + 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
              else if (e.key === 'Enter' && shown[sel]) (e.preventDefault(), shown[sel].run(e.altKey || e.metaKey))
            }} />
          <span className="kbd">esc</span>
        </div>
        <div className="pal-list" ref={list}>
          {shown.map((c, i) => {
            const head = c.group !== lastGroup ? <div className="pal-group">{(lastGroup = c.group)}</div> : null
            return (
              <div key={c.id}>
                {head}
                <button className={`pal-item ${i === sel ? 'on' : ''}`} onMouseMove={() => setSel(i)} onClick={(e) => c.run(e.altKey || e.metaKey)}>
                  {c.agent ? <Character head seed={c.agent.id} color={c.agent.color} status={st.runtimes[c.agent.id]?.status ?? 'idle'} size={20} /> : <Icon name={c.icon ?? 'bolt'} size={14} />}
                  <span className="pal-label">{c.label}</span>
                  {c.hint && <span className="pal-hint">{c.hint}</span>}
                </button>
              </div>
            )
          })}
          {!shown.length && <p className="muted small pad">Nothing matches “{q}”.</p>}
        </div>
      </div>
    </div>
  )
}
