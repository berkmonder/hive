import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Icon, cleanError } from './common'
import { Character } from './Character'

export function EditAgentModal() {
  const { app, editingAgentId, setEditingAgent, toast, runtimes } = useStore()
  const agent = app.agents.find((a) => a.id === editingAgentId)
  const roles = app.roles
  const [name, setName] = useState(agent?.name ?? '')
  const [role, setRole] = useState(agent?.role ?? '')
  const [color, setColor] = useState(agent?.color ?? '#f97316')
  const [providerId, setProviderId] = useState(agent?.providerId ?? 'claude')
  const [prompt, setPrompt] = useState(agent?.initialPrompt ?? '')
  const [useWorktree, setUseWorktree] = useState(!!agent?.worktreePath)
  const [sshHost, setSshHost] = useState(agent?.ssh?.host ?? '')
  const [sshPath, setSshPath] = useState(agent?.ssh?.path ?? '')
  const [branch, setBranch] = useState(agent?.branch ?? '')
  const [isRepo, setIsRepo] = useState(false)
  const [parentId, setParentId] = useState(agent?.parentId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (agent) window.api.isRepo(agent.projectId).then(setIsRepo)
  }, [agent?.projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!agent) return null
  const close = (): void => setEditingAgent(null)
  const running = !!runtimes[agent.id]?.running
  // can't report to yourself or to anyone below you
  const below = (id: string): boolean => {
    let cur = app.agents.find((a) => a.id === id)
    for (let i = 0; cur && i < 50; i++) {
      if (cur.parentId === agent.id) return true
      cur = app.agents.find((a) => a.id === cur!.parentId)
    }
    return false
  }
  const leadOptions = app.agents.filter((a) => a.projectId === agent.projectId && a.id !== agent.id && !below(a.id))
  const workspaceChanged = useWorktree !== !!agent.worktreePath

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (workspaceChanged && !useWorktree && !confirm('Remove this agent\'s worktree folder? Its branch is kept, so no committed work is lost.')) return
    setBusy(true)
    setError('')
    try {
      const res = await window.api.updateAgent(agent.id, {
        parentId,
        name: name.trim() || agent.name, role, color, providerId, initialPrompt: prompt.trim(),
        useWorktree, branch: useWorktree ? branch.trim() || undefined : undefined,
        ssh: sshHost.trim() ? { host: sshHost.trim(), path: sshPath.trim() } : agent.ssh ? null : undefined
      })
      toast('Saved', 'success')
      if (res?.restartHint?.length) toast(`Restart ${res.restartHint.join(', ')} so the team tools are picked up`, 'info')
      close()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={close}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-head">
          <h2>Edit agent</h2>
          <button type="button" className="icon-btn" onClick={close}><Icon name="x" /></button>
        </div>
        <div className="modal-preview"><Character seed={agent.id} color={color} status="working" size={110} /></div>
        <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Role</label>
        <div className="chips">
          {roles.map((r) => (
            <button type="button" key={r.id} className={`chip ${role === r.name ? 'on' : ''}`} style={{ ['--agent' as string]: r.color }}
              onClick={() => { setRole(r.name); setColor(r.color) }}>
              {r.name}
            </button>
          ))}
        </div>
        <div className="row">
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Custom role" style={{ flex: 1 }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        {roles.find((r) => r.name === role)?.instructions && (
          <p className="role-hint">
            <Icon name="book" size={12} /> {roles.find((r) => r.name === role)!.instructions}
          </p>
        )}
        <label>CLI
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            {app.providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.command ? ` (${p.command})` : ''}</option>)}
          </select>
        </label>
        <label>First task for new sessions (optional)
          <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </label>

        <div className="section-label">Team</div>
        <label>Reports to
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Nobody (no lead) —</option>
            {leadOptions.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
          </select>
          {parentId && <small className="muted">The lead gets tools to hand tasks to this agent and read its progress (Claude Code agents).</small>}
        </label>

        <div className="section-label">Workspace</div>
        <label className={`check ${!isRepo || (running && !agent.worktreePath) ? 'disabled' : ''}`}>
          <input type="checkbox" checked={useWorktree} disabled={!isRepo || running}
            onChange={(e) => setUseWorktree(e.target.checked)} />
          <span>
            Isolate in its own git worktree
            <small>
              {!isRepo ? 'Project is not a git repository.'
                : running ? 'Stop the agent to turn isolation on or off.'
                : agent.worktreePath ? agent.worktreePath : 'Currently works directly in the project folder.'}
            </small>
          </span>
        </label>
        {useWorktree && (
          <label>Branch name
            <input className="mono" value={branch} onChange={(e) => setBranch(e.target.value)}
              placeholder={`hive/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} />
            <small className="muted">{agent.branch ? 'Renaming keeps all commits; works even while the agent runs.' : 'Leave empty for an automatic name. An existing branch is reused.'}</small>
          </label>
        )}

        <div className="row">
          <label style={{ flex: 1 }}>SSH host (optional)<input className="mono" value={sshHost} onChange={(e) => setSshHost(e.target.value)} placeholder="user@server – empty = run locally" /></label>
          <label style={{ flex: 1 }}>Folder on the server<input className="mono" value={sshPath} disabled={!sshHost.trim()} onChange={(e) => setSshPath(e.target.value)} placeholder="~/apps/my-api" /></label>
        </div>

        {error && <p className="error">{error}</p>}
        <p className="muted small" style={{ margin: 0 }}>CLI and first-task changes apply the next time the agent starts.</p>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
