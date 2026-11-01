import { useEffect, useRef } from 'react'
import { Resizer } from './components/Resizer'
import { clamp, useLayout } from './layout'
import { ACCENTS, useStore } from './store'
import { Sidebar } from './components/Sidebar'
import { AgentTile } from './components/AgentTile'
import { FocusView } from './components/FocusView'
import { NewAgentModal } from './components/NewAgentModal'
import { RoomView } from './components/RoomView'
import { ServersView } from './components/ServersView'
import { UsageView } from './components/UsageView'
import { SettingsView } from './components/SettingsView'
import { BoardView } from './components/BoardView'
import { WorkspaceView } from './components/WorkspaceView'
import { SplitView } from './components/SplitView'
import { Palette } from './components/Palette'
import { AskBubble, MorphMenu } from './components/AgentExtras'
import { PlanReviewModal } from './components/PlanReview'
import { PauseSummary, QuestionModal } from './components/More'
import { ReplayModal } from './components/Insights'
import { setLanguage } from './i18n'
import { LibraryModal, SendPromptPicker } from './components/Library'
import { ContextMenu } from './components/ContextMenu'
import { Toasts } from './components/Toasts'
import { EditAgentModal } from './components/EditAgentModal'
import { HiveLogo, Icon } from './components/common'
import { Character } from './components/Character'
import { lazy, Suspense } from 'react'
const CodeView = lazy(() => import('./editor/CodeView'))

type NavItem = { id: 'room' | 'grid' | 'split' | 'board' | 'code' | 'servers' | 'usage' | 'project'; icon: Parameters<typeof Icon>[0]['name']; label: string; title: string; needsProject?: boolean }
const NAV: (NavItem | '|')[] = [
  { id: 'room', icon: 'room', label: 'Room', title: 'Room' },
  { id: 'grid', icon: 'grid', label: 'Grid', title: 'Terminal grid' },
  { id: 'split', icon: 'split', label: 'Split', title: 'Split view', needsProject: true },
  '|',
  { id: 'board', icon: 'kanban', label: 'Backlog', title: 'Backlog & schedules', needsProject: true },
  { id: 'code', icon: 'code', label: 'Code', title: 'Code editor', needsProject: true },
  { id: 'servers', icon: 'server', label: 'Servers', title: 'Dev servers & preview', needsProject: true },
  '|',
  { id: 'usage', icon: 'chart', label: 'Usage', title: 'Usage & cost', needsProject: true },
  { id: 'project', icon: 'brain', label: 'Workspace', title: 'Memory, skills, MCP & processes', needsProject: true }
]

export default function App() {
  const { ready, init, app, runtimes, selectedProjectId, view, setView, focusAgent, showNewAgent, setShowNewAgent, platform, editingAgentId, toast, showLibrary, setShowLibrary, awake, conflicts, budget } = useStore()

  const L = useLayout()
  const base = useRef(0)

  useEffect(() => {
    init()
  }, [init])

  // interface size + reduced motion from Settings
  useEffect(() => {
    window.api.settings.setZoom(L.uiScale)
  }, [L.uiScale])
  useEffect(() => {
    if (ready) setLanguage(L.lang)
  }, [L.lang, ready])
  useEffect(() => {
    document.documentElement.dataset.motion = L.reduceMotion ? 'reduce' : 'full'
  }, [L.reduceMotion])

  // Cmd/Ctrl+N → new agent, Cmd/Ctrl+, → settings
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useStore.getState().setPalette(!useStore.getState().paletteOpen)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setView('settings')
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && selectedProjectId) {
        e.preventDefault()
        setShowNewAgent(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedProjectId, setShowNewAgent, setView])

  if (!ready) return <div className="loading">Loading…</div>
  const project = app.projects.find((p) => p.id === selectedProjectId)
  const agents = app.agents.filter((a) => a.projectId === selectedProjectId)
  const waiting = app.agents.filter((a) => runtimes[a.id]?.status === 'waiting')
  const running = agents.filter((a) => runtimes[a.id]?.running).length
  const paused = agents.filter((a) => a.paused && !runtimes[a.id]?.running).length

  return (
    <div className={`app ${platform === 'darwin' ? 'mac' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="logo"><HiveLogo size={26} /></div>
        </div>
        <nav className="seg nav-seg">
          {NAV.map((n, i) => n === '|' ? <i key={i} className="seg-div" /> : (
            <button key={n.id} className={view === n.id ? 'on' : ''} title={n.title} disabled={n.needsProject && !project} onClick={() => setView(n.id)}>
              <Icon name={n.icon} />{view === n.id && <span>{n.label}</span>}
            </button>
          ))}
        </nav>
        {waiting.length > 0 && (
          <button className="need-pill" onClick={() => focusAgent(waiting[0].id)}>
            <i className="dot waiting" /> {waiting.length} need input
          </button>
        )}
        <div className="spacer" />
        {conflicts.length > 0 && (
          <span className="conflict-pill" title={conflicts.map((c) => `${c.file}: ${c.agentIds.map((id) => app.agents.find((a) => a.id === id)?.name).join(' & ')}`).join('\n')}>
            <Icon name="branch" size={13} /> {conflicts.length} overlap{conflicts.length > 1 ? 's' : ''}
          </span>
        )}
        {project && app.projectSettings[project.id]?.dailyBudget ? (
          <span className={`budget-pill ${(budget[project.id] ?? 0) >= app.projectSettings[project.id].dailyBudget! * 0.75 ? 'hot' : ''}`} title="Estimated spend today vs. daily budget (Workspace → Automation)">
            ${(budget[project.id] ?? 0).toFixed(2)} / ${app.projectSettings[project.id].dailyBudget}
          </span>
        ) : null}
        {awake && <span className="awake-pill" title="Keeping the Mac awake while agents work or dev servers run (Settings → Agents)"><Icon name="coffee" size={13} /></span>}
        <button className="search-btn" title="Search everything (⌘K)" onClick={() => useStore.getState().setPalette(true)}>
          <Icon name="search" size={13} /> <span>Search</span> <span className="kbd">⌘K</span>
        </button>
        {project && agents.length > 0 && (
          <div className="run-group">
            {paused > 0 ? (
              <button title="Resume paused agents (their conversations continue)" onClick={() => window.api.resumeProject(project.id)}>
                <Icon name="play" size={13} /> Resume {paused}
              </button>
            ) : agents.length > running ? (
              <button title="Start every stopped agent in this project" onClick={() => window.api.startAll(project.id)}>
                <Icon name="play" size={13} /> Start all
              </button>
            ) : null}
            {running > 0 && (
              <button title="Pause project: every agent stops after its current turn – safe to close the lid" onClick={() =>
                window.api.pauseProject(project.id).then((n) => toast(`Pausing ${n} agent${n === 1 ? '' : 's'} after their current turn…`))
              }><Icon name="pause" size={13} /></button>
            )}
            {running > 0 && (
              <button className="danger" title="Stop every running agent in this project" onClick={() => {
                if (confirm(`Stop all ${running} running agents in ${project.name}?`))
                  window.api.stopAll(project.id).then(() => toast('Stopping all agents…'))
              }}><Icon name="power" size={13} /></button>
            )}
          </div>
        )}
        <button className={`icon-btn ${view === 'settings' ? 'on' : ''}`} title="Settings (⌘,)" onClick={() => view === 'settings' ? (useStore.getState().focusedAgentId ? setView('focus') : setView(useStore.getState().lastOverview)) : setView('settings')}>
          <Icon name="gear" />
        </button>
      </header>

      <div className="app-body" style={{ gridTemplateColumns: `${L.sidebarW}px 10px minmax(0, 1fr)` }}>
        <Sidebar />
        <Resizer axis="x" className="panel-resizer" onStart={() => (base.current = L.sidebarW)}
          onDrag={(d) => L.set({ sidebarW: clamp(base.current + d, 220, 520) })} onReset={() => L.reset('sidebarW')} />
        <main className="main-panel">
          {view === 'settings' ? (
            <SettingsView />
          ) : !project ? (
            <div className="welcome">
              <div className="welcome-art">
                {['a1', 'b2', 'c3'].map((s, i) => (
                  <RoomCharacter key={s} seed={s} color={['#38bdf8', '#f97316', '#a78bfa'][i]} />
                ))}
              </div>
              <h1>Welcome to Hive</h1>
              <p className="muted">Run Claude Code, Codex and Gemini agents side by side, each in its own terminal.</p>
              <button className="btn big" onClick={() => window.api.addProject()}>
                <Icon name="folder" /> Add a project folder
              </button>
            </div>
          ) : view === 'code' ? (
            <Suspense fallback={<div className="welcome muted">Loading editor…</div>}>
              <CodeView key={project.id} />
            </Suspense>
          ) : view === 'board' ? (
            <BoardView key={project.id} />
          ) : view === 'project' ? (
            <WorkspaceView key={project.id} />
          ) : view === 'split' ? (
            <SplitView />
          ) : view === 'usage' ? (
            <UsageView />
          ) : view === 'servers' ? (
            <ServersView key={project.id} />
          ) : view === 'focus' ? (
            <FocusView />
          ) : agents.length === 0 ? (
            <div className="welcome">
              <div className="welcome-art"><RoomCharacter seed="empty" color="#f97316" /></div>
              <p className="muted">No agents in this project yet.</p>
              <button className="btn big" onClick={() => setShowNewAgent(true)}>
                <Icon name="plus" /> Create the first agent
              </button>
            </div>
          ) : view === 'room' ? (
            <RoomView agents={agents} />
          ) : (
            <div className={`grid n${Math.min(agents.length, 6)}`}>
              {agents.map((a) => <AgentTile key={a.id} agent={a} />)}
            </div>
          )}
        </main>
      </div>
      {showNewAgent && <NewAgentModal />}
      {editingAgentId && <EditAgentModal key={editingAgentId} />}
      <ContextMenu />
      <Palette />
      <AskBubble />
      <MorphMenu />
      <PlanReviewModal />
      <QuestionModal />
      <PauseSummary />
      <ReplayModal />
      <SendPromptPicker />
      {showLibrary && <LibraryModal />}
      <Toasts />
    </div>
  )
}

function RoomCharacter({ seed, color }: { seed: string; color: string }) {
  return <Character seed={seed} color={color} status="working" size={120} />
}
