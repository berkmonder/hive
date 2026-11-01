import { useEffect, useMemo, useState } from 'react'
import type { Agent, Schedule, Task, TaskStatus, Trigger, Workflow } from '@shared/types'
import { describeSchedule, nextRun } from '@shared/schedule'
import { AdvisorButton, AutoPickSelect, TrackerImport } from './More'
import { useStore } from '../store'
import { Icon, cleanError, timeAgo } from './common'
import { Character } from './Character'

const COLS: { id: TaskStatus; name: string; hint: string }[] = [
  { id: 'todo', name: 'Todo', hint: 'Ideas, bugs, imported issues' },
  { id: 'doing', name: 'In progress', hint: 'Dropping a card here hands it to its agent' },
  { id: 'done', name: 'Done', hint: 'Dropping here asks the agent to review its work' }
]

const newId = (): string => Math.random().toString(36).slice(2, 10)

export function BoardView() {
  const scheduleFor = useStore((s) => s.scheduleFor)
  const [tab, setTab] = useState<'backlog' | 'schedules' | 'workflows' | 'ideas' | 'triggers'>(scheduleFor ? 'schedules' : 'backlog')
  useEffect(() => {
    if (scheduleFor) setTab('schedules')
  }, [scheduleFor])
  return (
    <div className="board-view">
      <header className="bv-head">
        <div className="seg sm tabs">
          <button className={tab === 'backlog' ? 'on' : ''} onClick={() => setTab('backlog')}><Icon name="kanban" size={13} /> Backlog</button>
          <button className={tab === 'schedules' ? 'on' : ''} onClick={() => setTab('schedules')}><Icon name="clock" size={13} /> Schedules</button>
          <button className={tab === 'workflows' ? 'on' : ''} onClick={() => setTab('workflows')}><Icon name="zap" size={13} /> Workflows</button>
          <button className={tab === 'ideas' ? 'on' : ''} onClick={() => setTab('ideas')}><Icon name="inbox" size={13} /> Idea radar</button>
          <button className={tab === 'triggers' ? 'on' : ''} onClick={() => setTab('triggers')}><Icon name="webhook" size={13} /> Webhooks</button>
        </div>
        <div id="bv-tools" className="bv-tools" />
      </header>
      {tab === 'backlog' ? <Backlog /> : tab === 'schedules' ? <Schedules /> : tab === 'workflows' ? <Workflows /> : tab === 'ideas' ? <Ideas /> : <Triggers />}
    </div>
  )
}

/* ---------------- backlog ---------------- */

function Backlog() {
  const { app, selectedProjectId, toast } = useStore()
  const [edit, setEdit] = useState<Task | null>(null)
  const [promptsFor, setPromptsFor] = useState<TaskStatus | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)
  const [q, setQ] = useState('')
  const [importing, setImporting] = useState(false)
  const agents = app.agents.filter((a) => a.projectId === selectedProjectId)
  const tasks = useMemo(
    () =>
      app.tasks
        .filter((t) => t.projectId === selectedProjectId)
        .filter((t) => !q || `${t.title} ${t.body} ${t.source?.number ?? ''} ${t.source?.key ?? ''}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [app.tasks, selectedProjectId, q]
  )

  const save = async (t: Task, note?: string): Promise<void> => {
    try {
      const how = await window.api.tasks.save(t)
      const ag = agents.find((a) => a.id === t.agentId)
      if (how && ag) toast(`${ag.name}: ${how === 'queued' ? 'queued' : how === 'started' ? 'starting with this task' : 'task sent'}`, 'success')
      else if (note) toast(note, 'success')
    } catch (e) {
      toast(cleanError(e), 'error')
    }
  }
  const move = (id: string, status: TaskStatus): void => {
    const t = app.tasks.find((x) => x.id === id)
    if (!t || t.status === status) return
    if (status !== 'todo' && !t.agentId) toast('Tip: assign an agent so moving the card hands the task over', 'info')
    save({ ...t, status })
  }
  const importIssues = async (): Promise<void> => {
    if (!selectedProjectId) return
    setImporting(true)
    try {
      const r = await window.api.tasks.importGithub(selectedProjectId)
      toast(`GitHub: ${r.added} new, ${r.updated} updated (${r.total} open issues${r.via === 'api' ? ', public API' : ''})`, 'success')
    } catch (e) {
      toast(cleanError(e), 'error')
    } finally {
      setImporting(false)
    }
  }
  const blank = (status: TaskStatus = 'todo'): Task => ({ id: newId(), projectId: selectedProjectId!, title: '', body: '', status, createdAt: Date.now(), updatedAt: Date.now() })

  return (
    <>
      <div className="bv-bar">
        <div className="search-box"><Icon name="search" size={13} /><input placeholder="Filter cards…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="spacer" />
        {selectedProjectId && <AutoPickSelect projectId={selectedProjectId} />}
        {selectedProjectId && <TrackerImport projectId={selectedProjectId} />}
        <button className="btn ghost sm" disabled={importing} onClick={importIssues} title="Read-only: open issues become Todo cards (nothing is written back)">
          <Icon name="github" size={13} /> {importing ? 'Importing…' : 'Import GitHub issues'}
        </button>
        <button className="btn sm" onClick={() => setEdit(blank())}><Icon name="plus" size={13} /> New card</button>
      </div>
      <div className="kanban">
        {COLS.map((col) => {
          const list = tasks.filter((t) => t.status === col.id)
          const tpl = app.boardPrompts[col.id]
          return (
            <section key={col.id} className={`kcol k-${col.id} ${over === col.id ? 'over' : ''}`}
              onDragOver={(e) => (e.preventDefault(), setOver(col.id))}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                if (drag) move(drag, col.id)
                setDrag(null)
              }}>
              <header>
                <i className="kdot" />
                <b>{col.name}</b>
                <span className="count-badge">{list.length}</span>
                <div className="spacer" />
                <button className={`icon-btn ${tpl.trim() ? 'on-soft' : ''}`} title={tpl.trim() ? `Column prompt: ${tpl}` : 'Set a column prompt'} onClick={() => setPromptsFor(col.id)}><Icon name="zap" size={13} /></button>
                <button className="icon-btn" title="Add card" onClick={() => setEdit(blank(col.id))}><Icon name="plus" size={14} /></button>
              </header>
              <div className="kcards">
                {list.map((t) => (
                  <Card key={t.id} t={t} agents={agents} onOpen={() => setEdit(t)} onDrag={setDrag} onAssign={(agentId) => save({ ...t, agentId })} />
                ))}
                {!list.length && <p className="kempty">{col.hint}</p>}
              </div>
            </section>
          )
        })}
      </div>
      {edit && <TaskEditor task={edit} agents={agents} onClose={() => setEdit(null)} onSave={(t) => (save(t), setEdit(null))} />}
      {promptsFor && <ColumnPrompt col={promptsFor} onClose={() => setPromptsFor(null)} />}
    </>
  )
}

function Card({ t, agents, onOpen, onDrag, onAssign }: { t: Task; agents: Agent[]; onOpen: () => void; onDrag: (id: string | null) => void; onAssign: (id: string) => void }) {
  const a = agents.find((x) => x.id === t.agentId)
  const status = useStore((s) => (t.agentId ? s.runtimes[t.agentId]?.status : undefined))
  const [pick, setPick] = useState(false)
  return (
    <article className="kcard" draggable onDragStart={(e) => (e.dataTransfer.setData('text/plain', t.id), onDrag(t.id))} onDragEnd={() => onDrag(null)} onClick={onOpen}>
      <div className="kc-title">{t.title || <span className="muted">Untitled</span>}</div>
      {t.body && <div className="kc-body">{t.body.slice(0, 160)}</div>}
      <div className="kc-foot" onClick={(e) => e.stopPropagation()}>
        {t.source && (
          <a className="chip gh" title="Open on GitHub" onClick={() => window.api.openLink(t.source!.url)}><Icon name={t.source.kind === 'github' ? 'github' : 'external'} size={11} /> {t.source.key ?? `#${t.source.number}`}</a>
        )}
        {t.source?.labels?.slice(0, 2).map((l) => <span key={l} className="chip">{l}</span>)}
        <div className="spacer" />
        <span className="muted small">{timeAgo(t.updatedAt)}</span>
        <button className={`kc-agent ${a ? '' : 'none'}`} title={a ? `${a.name} · ${status ?? 'idle'} – click to change` : 'Assign an agent'} onClick={() => setPick(!pick)}>
          {a ? <Character head seed={a.id} color={a.color} status={status ?? 'idle'} size={22} /> : <Icon name="userPlus" size={13} />}
        </button>
        {pick && (
          <div className="kc-pick" onMouseLeave={() => setPick(false)}>
            {agents.map((x) => (
              <button key={x.id} onClick={() => (setPick(false), onAssign(x.id))}>
                <Character head seed={x.id} color={x.color} status="idle" size={18} /> {x.name}
              </button>
            ))}
            {!agents.length && <span className="muted small">No agents in this project</span>}
          </div>
        )}
        {a && t.status === 'todo' && (
          <button className="icon-btn" title={`Start: send to ${a.name} and move to In progress`} onClick={() =>
            window.api.tasks.run(t.id, a.id).then(() => useStore.getState().toast(`Sent to ${a.name}`, 'success')).catch((e) => useStore.getState().toast(cleanError(e), 'error'))
          }><Icon name="play" size={13} /></button>
        )}
      </div>
    </article>
  )
}

function TaskEditor({ task, agents, onClose, onSave }: { task: Task; agents: Agent[]; onClose: () => void; onSave: (t: Task) => void }) {
  const [t, setT] = useState(task)
  const exists = useStore((s) => s.app.tasks.some((x) => x.id === task.id))
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal task-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{exists ? 'Edit card' : 'New card'}</h2>
          {t.source && <button className="chip gh" onClick={() => window.api.openLink(t.source!.url)}><Icon name={t.source.kind === 'github' ? 'github' : 'external'} size={11} /> {t.source.key ?? `#${t.source.number}`}</button>}
        </div>
        <label>Title<input autoFocus value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="What should be done?" /></label>
        <label>Details<textarea rows={8} value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} placeholder="Context, acceptance criteria, links…" /></label>
        <div className="row">
          <label style={{ flex: 1 }}>Agent <AdvisorButton projectId={t.projectId} text={`${t.title}\n${t.body}`} onPick={(id) => setT({ ...t, agentId: id })} />
            <select value={t.agentId ?? ''} onChange={(e) => setT({ ...t, agentId: e.target.value || undefined })}>
              <option value="">— not assigned —</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}>Column
            <select value={t.status} onChange={(e) => setT({ ...t, status: e.target.value as TaskStatus })}>
              {COLS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-foot">
          {exists && (
            <button className="btn ghost sm danger-text" onClick={() => confirm('Delete this card?') && (window.api.tasks.remove(t.id), onClose())}>
              <Icon name="trash" size={13} /> Delete
            </button>
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!t.title.trim()} onClick={() => onSave({ ...t, title: t.title.trim() })}>Save</button>
        </div>
      </div>
    </div>
  )
}

function ColumnPrompt({ col, onClose }: { col: TaskStatus; onClose: () => void }) {
  const prompts = useStore((s) => s.app.boardPrompts)
  const [v, setV] = useState(prompts[col])
  const name = COLS.find((c) => c.id === col)!.name
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2><Icon name="zap" size={15} /> “{name}” column prompt</h2>
        <p className="muted small">Sent to the card's agent when a card enters this column. <code>{'{{title}}'}</code> and <code>{'{{body}}'}</code> are replaced. Leave empty to only move the card.</p>
        <textarea rows={7} value={v} onChange={(e) => setV(e.target.value)} />
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={() => (window.api.tasks.boardPrompts({ ...prompts, [col]: v }), onClose())}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- schedules ---------------- */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function Schedules() {
  const { app, selectedProjectId, scheduleFor, toast } = useStore()
  const agents = app.agents.filter((a) => a.projectId === selectedProjectId)
  const list = app.schedules.filter((s) => agents.some((a) => a.id === s.agentId))
  const [edit, setEdit] = useState<Schedule | null>(null)
  const blank = (agentId?: string): Schedule => ({ id: newId(), agentId: agentId ?? agents[0]?.id ?? '', title: '', prompt: '', kind: 'daily', time: '09:00', weekday: 1, enabled: true })
  useEffect(() => {
    if (scheduleFor) {
      setEdit(blank(scheduleFor))
      useStore.setState({ scheduleFor: null })
    }
  }, [scheduleFor]) // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now()
  return (
    <div className="sched">
      <div className="bv-bar">
        <p className="muted small">Prompts that run on their own – typed into the agent (queued if it is busy) or started fresh. Hive must be open.</p>
        <div className="spacer" />
        <button className="btn sm" disabled={!agents.length} onClick={() => setEdit(blank())}><Icon name="plus" size={13} /> New schedule</button>
      </div>
      {!list.length && (
        <div className="sched-empty">
          <Icon name="clock" size={28} />
          <p>No schedules yet. Ideas: a daily “run the tests and fix failures”, a weekly dependency update, a nightly code review.</p>
        </div>
      )}
      <div className="sched-list">
        {list.map((s) => {
          const a = agents.find((x) => x.id === s.agentId)
          const next = s.enabled ? nextRun(s, s.kind === 'once' ? now - 1 : Math.max(now, s.lastRun ?? 0)) : null
          return (
            <div key={s.id} className={`sched-row ${s.enabled ? '' : 'off'}`}>
              <button role="switch" aria-checked={s.enabled} className={`switch ${s.enabled ? 'on' : ''}`} onClick={() => window.api.schedules.save({ ...s, enabled: !s.enabled })}><i /></button>
              <div className="sr-main" onClick={() => setEdit(s)}>
                <b>{s.title || s.prompt.slice(0, 60)}</b>
                <span>{describeSchedule(s)}{s.fresh ? ' · fresh session' : ''}{next ? ` · next ${new Date(next).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}{s.lastRun ? ` · last ${timeAgo(s.lastRun)}` : ''}</span>
              </div>
              {a && <span className="chip"><Character head seed={a.id} color={a.color} status="idle" size={16} /> {a.name}</span>}
              <button className="btn ghost sm" onClick={() => window.api.schedules.runNow(s.id).then(() => toast('Started', 'success')).catch((e) => toast(cleanError(e), 'error'))}><Icon name="play" size={12} /> Run now</button>
              <button className="icon-btn danger" title="Delete" onClick={() => confirm('Delete this schedule?') && window.api.schedules.remove(s.id)}><Icon name="trash" size={13} /></button>
            </div>
          )
        })}
      </div>
      {edit && <ScheduleEditor s={edit} agents={agents} onClose={() => setEdit(null)} />}
    </div>
  )
}

function ScheduleEditor({ s: init, agents, onClose }: { s: Schedule; agents: Agent[]; onClose: () => void }) {
  const [s, setS] = useState(init)
  const local = (ms?: number): string => {
    const d = new Date(ms ?? Date.now() + 3600_000)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  const ok = s.agentId && s.prompt.trim() && (s.kind !== 'once' || s.onceAt)
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2><Icon name="clock" size={15} /> Schedule</h2>
        <label>Name<input value={s.title} placeholder="e.g. Nightly test run" onChange={(e) => setS({ ...s, title: e.target.value })} /></label>
        <label>Agent
          <select value={s.agentId} onChange={(e) => setS({ ...s, agentId: e.target.value })}>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
          </select>
        </label>
        <label>Prompt<textarea rows={5} value={s.prompt} placeholder="Run the full test suite, fix what fails and summarise." onChange={(e) => setS({ ...s, prompt: e.target.value })} /></label>
        <div className="row wrap">
          <label>Repeat
            <select value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value as Schedule['kind'], onceAt: e.target.value === 'once' ? s.onceAt ?? Date.now() + 3600_000 : s.onceAt })}>
              <option value="once">Once</option>
              <option value="hourly">Every hour</option>
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Every week</option>
            </select>
          </label>
          {s.kind === 'once' && <label>When<input type="datetime-local" value={local(s.onceAt)} onChange={(e) => setS({ ...s, onceAt: new Date(e.target.value).getTime(), lastRun: undefined })} /></label>}
          {s.kind === 'hourly' && <label>At minute<input type="number" min={0} max={59} value={Number(s.time.split(':').pop()) || 0} onChange={(e) => setS({ ...s, time: `0:${e.target.value}` })} /></label>}
          {s.kind === 'weekly' && (
            <label>Day
              <select value={s.weekday ?? 1} onChange={(e) => setS({ ...s, weekday: Number(e.target.value) })}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
          )}
          {['daily', 'weekdays', 'weekly'].includes(s.kind) && <label>Time<input type="time" value={s.time} onChange={(e) => setS({ ...s, time: e.target.value })} /></label>}
        </div>
        <label className="check"><input type="checkbox" checked={!!s.fresh} onChange={(e) => setS({ ...s, fresh: e.target.checked })} /> Start a fresh session for every run (otherwise it is typed into the current one)</label>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!ok} onClick={() => (window.api.schedules.save(s), onClose())}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- workflows ---------------- */

const TEMPLATES: { name: string; roles: string[]; prompts: string[] }[] = [
  {
    name: 'Feature: plan → build → test',
    roles: ['pm|architect|lead|full', 'front|back|full|dev', 'qa|test'],
    prompts: [
      'Turn this request into a short implementation plan (files to touch, steps, risks). Do not write code yet.\n\nRequest: {{input}}',
      'Implement this plan:\n\n{{previous}}\n\nOriginal request: {{input}}',
      'Test what was just built for "{{input}}". Run the test suite, add missing tests, and report anything broken.\n\nWhat the developer said:\n{{previous}}'
    ]
  },
  {
    name: 'Bug: reproduce → fix → review',
    roles: ['qa|test', 'back|front|full|dev', 'review'],
    prompts: [
      'Reproduce this bug and find the root cause. Write a failing test. Do not fix it yet.\n\nBug: {{input}}',
      'Fix the bug. Root cause and failing test from the previous step:\n\n{{previous}}',
      'Review the fix for "{{input}}" – correctness, edge cases, style. Summarise.\n\nFix notes:\n{{previous}}'
    ]
  }
]

function Workflows() {
  const { app, selectedProjectId, toast } = useStore()
  const agents = app.agents.filter((a) => a.projectId === selectedProjectId)
  const list = app.workflows.filter((w) => w.projectId === selectedProjectId)
  const runs = app.workflowRuns.filter((r) => r.projectId === selectedProjectId)
  const [edit, setEdit] = useState<Workflow | null>(null)
  const [runFor, setRunFor] = useState<Workflow | null>(null)
  const [input, setInput] = useState('')
  const pickAgent = (hint: string, i: number): string => {
    const re = new RegExp(hint, 'i')
    return (agents.find((a) => re.test(a.role) || re.test(a.name)) ?? agents[i % Math.max(1, agents.length)])?.id ?? ''
  }
  const fromTemplate = (tpl: (typeof TEMPLATES)[number]): void =>
    setEdit({ id: newId(), projectId: selectedProjectId!, name: tpl.name, steps: tpl.prompts.map((p, i) => ({ agentId: pickAgent(tpl.roles[i], i), prompt: p })) })
  return (
    <div className="sched">
      <div className="bv-bar">
        <p className="muted small">Hand work from agent to agent: each step starts when the previous agent finishes its turn, with its reply as <code>{'{{previous}}'}</code>.</p>
        <div className="spacer" />
        {TEMPLATES.map((tpl) => (
          <button key={tpl.name} className="btn ghost sm" disabled={!agents.length} onClick={() => fromTemplate(tpl)}><Icon name="plus" size={12} /> {tpl.name.split(':')[0]}</button>
        ))}
        <button className="btn sm" disabled={!agents.length} onClick={() => setEdit({ id: newId(), projectId: selectedProjectId!, name: 'New workflow', steps: [{ agentId: agents[0]?.id ?? '', prompt: '{{input}}' }] })}>
          <Icon name="plus" size={13} /> New workflow
        </button>
      </div>
      <div className="sched-list">
        {list.map((w) => (
          <div key={w.id} className="sched-row">
            <Icon name="zap" size={16} />
            <div className="sr-main" onClick={() => setEdit(w)}>
              <b>{w.name}</b>
              <span className="wf-chain">
                {w.steps.map((s, i) => {
                  const a = agents.find((x) => x.id === s.agentId)
                  return <span key={i}>{i > 0 && ' → '}{a?.name ?? '?'}</span>
                })}
              </span>
            </div>
            <button className="btn sm" onClick={() => (setRunFor(w), setInput(''))}><Icon name="play" size={12} /> Run</button>
            <button className="icon-btn danger" title="Delete" onClick={() => confirm(`Delete ${w.name}?`) && window.api.workflows.remove(w.id)}><Icon name="trash" size={13} /></button>
          </div>
        ))}
        {!list.length && <div className="sched-empty"><Icon name="zap" size={28} /><p>Start from a template above – e.g. a PM plans, a developer builds, QA tests.</p></div>}
        {runs.length > 0 && <h3 className="wf-h">Recent runs</h3>}
        {runs.slice(0, 8).map((r) => {
          const w = app.workflows.find((x) => x.id === r.workflowId)
          const total = w?.steps.length ?? r.log.length
          return (
            <details key={r.id} className={`wf-run st-${r.status}`}>
              <summary>
                <span className={`pill pill-${r.status === 'running' ? 'working' : r.status === 'done' ? 'done' : 'idle'}`}><i className="dot" />{r.status}</span>
                <b>{r.name}</b>
                <span className="muted small">{r.input.slice(0, 80)}</span>
                <div className="spacer" />
                <span className="muted small">step {Math.min(r.step + 1, total)} / {total} · {timeAgo(r.startedAt)}</span>
                {r.status === 'running' && <button className="btn ghost sm" onClick={(e) => (e.preventDefault(), window.api.workflows.stop(r.id))}>Stop</button>}
              </summary>
              {r.log.map((l, i) => (
                <div key={i} className="wf-log"><b>{i + 1}. {app.agents.find((a) => a.id === l.agentId)?.name}</b><pre>{l.output}</pre></div>
              ))}
            </details>
          )
        })}
      </div>
      {edit && <WorkflowEditor w={edit} agents={agents} onClose={() => setEdit(null)} />}
      {runFor && (
        <div className="backdrop" onMouseDown={() => setRunFor(null)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2><Icon name="play" size={15} /> Run “{runFor.name}”</h2>
            <label>Input (becomes {'{{input}}'})<textarea autoFocus rows={5} value={input} onChange={(e) => setInput(e.target.value)} placeholder="What should be built / fixed?" /></label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setRunFor(null)}>Cancel</button>
              <button className="btn" disabled={!input.trim()} onClick={() =>
                window.api.workflows.run(runFor.id, input.trim()).then(() => (toast('Workflow started', 'success'), setRunFor(null))).catch((e) => toast(cleanError(e), 'error'))
              }>Start</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WorkflowEditor({ w: init, agents, onClose }: { w: Workflow; agents: Agent[]; onClose: () => void }) {
  const [w, setW] = useState(init)
  const set = (i: number, p: Partial<Workflow['steps'][number]>): void => setW({ ...w, steps: w.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal wf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2><Icon name="zap" size={15} /> Workflow</h2>
        <label>Name<input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></label>
        <div className="wf-steps">
          {w.steps.map((s, i) => (
            <div key={i} className="wf-step">
              <div className="row">
                <span className="ps-n">{i + 1}</span>
                <select value={s.agentId} onChange={(e) => set(i, { agentId: e.target.value })} style={{ flex: 1 }}>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
                </select>
                <button className="icon-btn danger" disabled={w.steps.length < 2} onClick={() => setW({ ...w, steps: w.steps.filter((_, j) => j !== i) })}><Icon name="trash" size={13} /></button>
              </div>
              <textarea rows={3} value={s.prompt} onChange={(e) => set(i, { prompt: e.target.value })} />
            </div>
          ))}
        </div>
        <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setW({ ...w, steps: [...w.steps, { agentId: agents[0]?.id ?? '', prompt: 'Continue from the previous step:\n\n{{previous}}' }] })}><Icon name="plus" size={12} /> Add step</button>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!w.name.trim() || w.steps.some((s) => !s.agentId || !s.prompt.trim())} onClick={() => (window.api.workflows.save(w), onClose())}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- idea radar ---------------- */

const KIND_COLOR: Record<string, string> = { bug: 'var(--waiting)', feature: 'var(--accent)', improvement: 'var(--done)', question: 'var(--working)' }

function Ideas() {
  const { app, selectedProjectId, toast } = useStore()
  const ideas = app.ideas.filter((i) => i.projectId === selectedProjectId).sort((a, b) => b.count - a.count)
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const analyze = async (): Promise<void> => {
    setBusy(true)
    try {
      const n = await window.api.extras.analyzeIdeas(selectedProjectId!, raw)
      toast(`${n} theme${n === 1 ? '' : 's'} found`, 'success')
      setRaw('')
    } catch (e) {
      toast(cleanError(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sched ideas">
      <div className="ideas-in">
        <textarea rows={6} value={raw} onChange={(e) => setRaw(e.target.value)}
          placeholder={'Paste raw feedback – app reviews, support mails, Slack messages, survey answers…\n\n“Dark mode please!!”\n“The login keeps sending me back to the start page”\n“would love a dark theme”'} />
        <div className="row">
          <span className="muted small">Grouped into themes by your Claude Code (Haiku). Duplicates are merged and counted.</span>
          <div className="spacer" />
          <button className="btn sm" disabled={!raw.trim() || busy} onClick={analyze}><Icon name={busy ? 'refresh' : 'sparkle'} size={13} /> {busy ? 'Grouping…' : 'Find themes'}</button>
        </div>
      </div>
      <div className="idea-list">
        {ideas.map((i) => (
          <div key={i.id} className="idea" style={{ ['--k' as string]: KIND_COLOR[i.kind] ?? 'var(--muted)' }}>
            <div className="idea-count"><b>{i.count}</b><span>×</span></div>
            <div className="idea-main">
              <div className="idea-title"><span className="idea-kind">{i.kind}</span> <b>{i.title}</b></div>
              <p>{i.summary}</p>
              {i.quotes.map((q, k) => <q key={k}>{q}</q>)}
            </div>
            <div className="idea-actions">
              <button className="btn sm" onClick={() => window.api.extras.ideaToCard(i.id).then(() => toast('Added to Todo', 'success'))}><Icon name="plus" size={12} /> Card</button>
              <button className="icon-btn" title="Dismiss" onClick={() => window.api.extras.removeIdea(i.id)}><Icon name="x" size={13} /></button>
            </div>
          </div>
        ))}
        {!ideas.length && <div className="sched-empty"><Icon name="inbox" size={28} /><p>No themes yet. Paste some feedback above.</p></div>}
      </div>
    </div>
  )
}

/* ---------------- webhooks ---------------- */

function Triggers() {
  const { app, selectedProjectId, toast } = useStore()
  const agents = app.agents.filter((a) => a.projectId === selectedProjectId)
  const list = app.triggers.filter((t) => agents.some((a) => a.id === t.agentId))
  const [port, setPort] = useState(4317)
  const [pub, setPub] = useState<string | null>(null)
  const [pubBusy, setPubBusy] = useState(false)
  useEffect(() => {
    window.api.tunnel.list().then((l) => setPub(l.find((x) => x.port === port)?.url ?? null))
  }, [port])
  const togglePublic = async (): Promise<void> => {
    if (pub) {
      await window.api.tunnel.close(port)
      setPub(null)
      return
    }
    setPubBusy(true)
    try {
      setPub((await window.api.tunnel.open(port)).url)
    } catch (e) {
      toast(cleanError(e), 'error')
    } finally {
      setPubBusy(false)
    }
  }
  const [edit, setEdit] = useState<Trigger | null>(null)
  useEffect(() => {
    window.api.extras.triggerPort().then(setPort)
  }, [app.triggers.length])
  const url = (t: Trigger): string => `${pub ?? `http://127.0.0.1:${port}`}/trigger/${t.id}?token=${t.token}`
  const copy = (s: string): void => {
    window.api.copyText(s).then(() => toast('Copied', 'success'))
  }
  return (
    <div className="sched">
      <div className="bv-bar">
        <p className="muted small">A URL that starts or messages an agent when something POSTs to it – CI, a script, a cron job, or GitHub / Slack through a tunnel (ngrok, cloudflared).</p>
        <div className="spacer" />
        <button className={`btn ${pub ? '' : 'ghost'} sm`} disabled={pubBusy} title="Expose the webhook port on a public HTTPS URL so GitHub / Slack can reach it" onClick={togglePublic}>
          <Icon name="external" size={12} /> {pubBusy ? 'Opening…' : pub ? 'Public ✓ (stop)' : 'Make public'}
        </button>
        <button className="btn sm" disabled={!agents.length} onClick={() => setEdit({ id: newId(), name: 'CI failed', agentId: agents[0]?.id ?? '', prompt: 'The CI build failed. Find out why and fix it.\n\nPayload:\n{{payload}}', token: '', enabled: true })}>
          <Icon name="plus" size={13} /> New webhook
        </button>
      </div>
      <div className="sched-list">
        {list.map((t) => {
          const a = agents.find((x) => x.id === t.agentId)
          return (
            <div key={t.id} className={`sched-row trig ${t.enabled ? '' : 'off'}`}>
              <button role="switch" aria-checked={t.enabled} className={`switch ${t.enabled ? 'on' : ''}`} onClick={() => window.api.extras.saveTrigger({ ...t, enabled: !t.enabled })}><i /></button>
              <div className="sr-main" onClick={() => setEdit(t)}>
                <b>{t.name}</b>
                <span>→ {a?.name ?? '?'}{t.fired ? ` · fired ${t.fired}× · last ${timeAgo(t.lastFired)}` : ' · never fired'}</span>
                <code className="trig-url">{url(t)}</code>
              </div>
              <button className="btn ghost sm" onClick={() => copy(url(t))}><Icon name="copy" size={12} /> URL</button>
              <button className="btn ghost sm" title="Copy a curl command to test it" onClick={() => copy(`curl -X POST -H 'Content-Type: application/json' -d '{"test": true}' '${url(t)}'`)}>curl</button>
              <button className="icon-btn danger" title="Delete" onClick={() => confirm(`Delete ${t.name}?`) && window.api.extras.removeTrigger(t.id)}><Icon name="trash" size={13} /></button>
            </div>
          )
        })}
        {!list.length && <div className="sched-empty"><Icon name="webhook" size={28} /><p>e.g. “when CI fails, the DevOps agent investigates”, or “a new Sentry error goes to the backend agent”.</p></div>}
      </div>
      {edit && (
        <div className="backdrop" onMouseDown={() => setEdit(null)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2><Icon name="webhook" size={15} /> Webhook</h2>
            <label>Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label>Agent
              <select value={edit.agentId} onChange={(e) => setEdit({ ...edit, agentId: e.target.value })}>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
              </select>
            </label>
            <label>Prompt (<code>{'{{payload}}'}</code> = request body, <code>{'{{event}}'}</code> = event header)
              <textarea rows={5} value={edit.prompt} onChange={(e) => setEdit({ ...edit, prompt: e.target.value })} />
            </label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={!edit.name.trim() || !edit.agentId || !edit.prompt.trim()} onClick={() => (window.api.extras.saveTrigger(edit), setEdit(null))}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
