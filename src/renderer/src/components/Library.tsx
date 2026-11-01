import { useEffect, useMemo, useRef, useState } from 'react'
import { fillPrompt, type RoleDef, type SavedPrompt } from '@shared/library'
import type { Agent } from '@shared/types'
import { useStore } from '../store'
import { Icon, cleanError } from './common'

const uid = (p: string): string => `${p}-${Math.random().toString(36).slice(2, 9)}`

/** Fill {{agent}} {{role}} {{branch}} {{project}} for one agent. */
export function promptFor(body: string, agent: Agent): string {
  const project = useStore.getState().app.projects.find((p) => p.id === agent.projectId)
  return fillPrompt(body, { agent: agent.name, role: agent.role, branch: agent.branch ?? 'the current branch', project: project?.name })
}

/** Send a saved prompt to one or more agents (starts stopped ones). */
export async function sendPrompt(agents: Agent[], body: string): Promise<void> {
  const { toast } = useStore.getState()
  try {
    for (const a of agents) await window.api.library.send([a.id], promptFor(body, a))
    toast(agents.length === 1 ? `Sent to ${agents[0].name}` : `Sent to ${agents.length} agents`, 'success')
  } catch (e) {
    toast(cleanError(e), 'error')
  }
}

/** Searchable list of saved prompts. */
export function PromptPicker({ onPick, onClose, title, style }: {
  onPick: (p: SavedPrompt, send: boolean) => void
  onClose: () => void
  title?: string
  style?: React.CSSProperties
}) {
  const prompts = useStore((s) => s.app.prompts)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const list = useMemo(() => {
    const n = q.toLowerCase()
    return prompts.filter((p) => !n || p.title.toLowerCase().includes(n) || p.body.toLowerCase().includes(n))
  }, [prompts, q])
  return (
    <div className="ctx-layer" onMouseDown={onClose}>
      <div className="picker" style={style} onMouseDown={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <Icon name="book" size={14} />
          <b>{title ?? 'Prompt library'}</b>
          <div className="spacer" />
          <button className="icon-btn" title="Manage library" onClick={() => { onClose(); useStore.getState().setShowLibrary('prompts') }}>
            <Icon name="edit" size={13} />
          </button>
        </div>
        <input autoFocus placeholder="Search prompts…" value={q} onChange={(e) => { setQ(e.target.value); setI(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setI((x) => Math.min(x + 1, list.length - 1)))
            if (e.key === 'ArrowUp') (e.preventDefault(), setI((x) => Math.max(x - 1, 0)))
            if (e.key === 'Enter' && list[i]) onPick(list[i], e.metaKey || e.ctrlKey)
            if (e.key === 'Escape') onClose()
          }} />
        <ul>
          {list.map((p, k) => (
            <li key={p.id} className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onClick={() => onPick(p, false)}>
              <div className="pk-main">
                <b>{p.title}</b>
                <span>{p.body}</span>
              </div>
              <button className="icon-btn" title="Send now (⌘⏎)" onClick={(e) => (e.stopPropagation(), onPick(p, true))}>
                <Icon name="send" size={13} />
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted">No prompts match</li>}
        </ul>
        <div className="picker-foot muted small">⏎ insert · ⌘⏎ send · variables: {'{{agent}} {{role}} {{branch}} {{project}}'}</div>
      </div>
    </div>
  )
}

/** Library manager: saved prompts and roles. */
export function LibraryModal() {
  const { app, showLibrary, setShowLibrary, toast } = useStore()
  const tab = showLibrary || 'prompts'
  const close = (): void => setShowLibrary(null)
  return (
    <div className="backdrop" onMouseDown={close}>
      <div className="modal library" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2><Icon name="book" /> Library</h2>
          <div className="seg sm">
            <button className={tab === 'prompts' ? 'on' : ''} onClick={() => setShowLibrary('prompts')} style={{ width: 'auto', padding: '0 12px' }}>Prompts · {app.prompts.length}</button>
            <button className={tab === 'roles' ? 'on' : ''} onClick={() => setShowLibrary('roles')} style={{ width: 'auto', padding: '0 12px' }}>Roles · {app.roles.length}</button>
          </div>
          <button type="button" className="icon-btn" onClick={close}><Icon name="x" /></button>
        </div>
        {tab === 'prompts' ? <PromptsEditor items={app.prompts} toast={toast} /> : <RolesEditor items={app.roles} toast={toast} />}
      </div>
    </div>
  )
}

function PromptsEditor({ items, toast }: { items: SavedPrompt[]; toast: (t: string, k?: 'info' | 'error' | 'success') => void }) {
  const [sel, setSel] = useState<string | null>(items[0]?.id ?? null)
  const cur = items.find((p) => p.id === sel)
  const [draft, setDraft] = useState<SavedPrompt | null>(cur ?? null)
  useEffect(() => setDraft(cur ? { ...cur } : null), [sel]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!draft && !!cur && (draft.title !== cur.title || draft.body !== cur.body)
  const save = async (): Promise<void> => {
    if (!draft?.title.trim() || !draft.body.trim()) return toast('Title and text are required', 'error')
    await window.api.library.savePrompt({ ...draft, title: draft.title.trim() })
    toast('Prompt saved', 'success')
  }
  const add = async (): Promise<void> => {
    const p = { id: uid('p'), title: 'New prompt', body: '' }
    await window.api.library.savePrompt(p)
    setSel(p.id)
    setDraft(p)
  }
  return (
    <div className="lib-body">
      <aside className="lib-list">
        <button className="btn ghost sm" onClick={add}><Icon name="plus" size={13} /> New prompt</button>
        {items.map((p) => (
          <button key={p.id} className={`lib-item ${p.id === sel ? 'on' : ''}`} onClick={() => setSel(p.id)}>
            <b>{p.title}</b>
            <span>{p.body || 'empty'}</span>
          </button>
        ))}
      </aside>
      {draft ? (
        <section className="lib-edit">
          <label>Title<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label>Prompt
            <textarea rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="What should the agent do? You can use {{agent}}, {{role}}, {{branch}}, {{project}}." />
          </label>
          <div className="modal-foot">
            <button className="btn ghost danger-text" onClick={async () => {
              if (!confirm(`Delete "${draft.title}"?`)) return
              await window.api.library.deletePrompt(draft.id)
              setSel(items.find((p) => p.id !== draft.id)?.id ?? null)
            }}><Icon name="trash" size={13} /> Delete</button>
            <div className="spacer" />
            <button className="btn" disabled={!dirty} onClick={save}>Save</button>
          </div>
        </section>
      ) : <section className="lib-edit muted">Create your first prompt.</section>}
    </div>
  )
}

function RolesEditor({ items, toast }: { items: RoleDef[]; toast: (t: string, k?: 'info' | 'error' | 'success') => void }) {
  const [sel, setSel] = useState<string | null>(items[0]?.id ?? null)
  const cur = items.find((r) => r.id === sel)
  const [draft, setDraft] = useState<RoleDef | null>(cur ?? null)
  const agents = useStore((s) => s.app.agents)
  useEffect(() => setDraft(cur ? { ...cur } : null), [sel]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!draft && !!cur && JSON.stringify(draft) !== JSON.stringify(cur)
  const users = draft ? agents.filter((a) => a.role === cur?.name).length : 0
  const save = async (): Promise<void> => {
    if (!draft?.name.trim()) return toast('Name is required', 'error')
    await window.api.library.saveRole({ ...draft, name: draft.name.trim() })
    toast(users ? `Role saved – restart its ${users} agent(s) to apply the new instructions` : 'Role saved', 'success')
  }
  const add = async (): Promise<void> => {
    const r = { id: uid('r'), name: 'New role', color: '#8b7cf6', instructions: '' }
    await window.api.library.saveRole(r)
    setSel(r.id)
    setDraft(r)
  }
  return (
    <div className="lib-body">
      <aside className="lib-list">
        <button className="btn ghost sm" onClick={add}><Icon name="plus" size={13} /> New role</button>
        {items.map((r) => (
          <button key={r.id} className={`lib-item ${r.id === sel ? 'on' : ''}`} onClick={() => setSel(r.id)}>
            <b><i className="dot" style={{ background: r.color }} /> {r.name}</b>
            <span>{r.instructions || 'no instructions'}</span>
          </button>
        ))}
      </aside>
      {draft ? (
        <section className="lib-edit">
          <div className="row">
            <label style={{ flex: 1 }}>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>Colour<input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
          </div>
          <label>Instructions
            <textarea rows={11} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              placeholder="How should an agent with this role behave? E.g. focus areas, rules, what not to touch." />
          </label>
          <p className="muted small" style={{ margin: 0 }}>
            Claude Code agents get these instructions in every session (as an extra system prompt). Used by {users} agent{users === 1 ? '' : 's'}.
          </p>
          <div className="modal-foot">
            <button className="btn ghost danger-text" onClick={async () => {
              if (!confirm(`Delete role "${draft.name}"? Agents keep their role name but lose the instructions.`)) return
              await window.api.library.deleteRole(draft.id)
              setSel(items.find((r) => r.id !== draft.id)?.id ?? null)
            }}><Icon name="trash" size={13} /> Delete</button>
            <div className="spacer" />
            <button className="btn" disabled={!dirty} onClick={save}>Save</button>
          </div>
        </section>
      ) : <section className="lib-edit muted">Create your first role.</section>}
    </div>
  )
}

/** Picker anchored to a point that sends the chosen prompt to the given agents. */
export function SendPromptPicker() {
  const target = useStore((s) => s.promptTarget)
  const agents = useStore((s) => s.app.agents)
  const close = (): void => useStore.setState({ promptTarget: null })
  const ref = useRef(target)
  if (!target) return null
  ref.current = target
  const list = agents.filter((a) => target.agentIds.includes(a.id))
  return (
    <PromptPicker
      title={list.length === 1 ? `Send to ${list[0].name}` : `Send to ${list.length} agents`}
      style={{ left: Math.min(target.x, innerWidth - 440), top: Math.min(target.y, innerHeight - 460) }}
      onClose={close}
      onPick={(p) => {
        close()
        sendPrompt(list, p.body)
      }}
    />
  )
}
