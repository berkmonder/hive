import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Icon, cleanError } from './common'
import { Character } from './Character'

const slug = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent'

export function NewAgentModal() {
  const { app, selectedProjectId, setShowNewAgent, focusAgent, newAgentParentId } = useStore()
  const project = app.projects.find((p) => p.id === selectedProjectId)
  const count = app.agents.filter((a) => a.projectId === selectedProjectId).length
  const roles = app.roles.length ? app.roles : [{ id: 'x', name: 'General', color: '#8b7cf6', instructions: '' }]
  const preset = roles[count % roles.length]

  const [name, setName] = useState(`Agent ${count + 1}`)
  const [role, setRole] = useState(preset.name)
  const [color, setColor] = useState(preset.color)
  const [providerId, setProviderId] = useState(app.providers.some((p) => p.id === app.settings.defaultProviderId) ? app.settings.defaultProviderId : (app.providers[0]?.id ?? 'claude'))
  const [prompt, setPrompt] = useState('')
  const [isRepo, setIsRepo] = useState(false)
  const [useWorktree, setUseWorktree] = useState(false)
  const [remote, setRemote] = useState(false)
  const [sshHost, setSshHost] = useState('')
  const [sshPath, setSshPath] = useState('')
  const [branch, setBranch] = useState('')
  const [parentId, setParentId] = useState(newAgentParentId ?? '')
  const leadOptions = app.agents.filter((a) => a.projectId === selectedProjectId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (project) window.api.isRepo(project.id).then((r) => { setIsRepo(r); setUseWorktree(r && (app.settings.worktreeDefault === 'always' || (app.settings.worktreeDefault === 'auto' && count > 0))) })
  }, [project, count])

  if (!project) return null
  const close = (): void => setShowNewAgent(false)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const agent = await window.api.createAgent({
        projectId: project.id, name, role, color, providerId,
        initialPrompt: prompt.trim() || undefined, useWorktree: useWorktree && !remote, branch: useWorktree && !remote ? branch.trim() || undefined : undefined, parentId: parentId || undefined,
        ssh: remote && sshHost.trim() ? { host: sshHost.trim(), path: sshPath.trim() } : undefined
      })
      close()
      focusAgent(agent.id)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={close}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h2>{parentId ? `New member of ${app.agents.find((a) => a.id === parentId)?.name}'s team` : `New agent · ${project.name}`}</h2>
          <button type="button" className="icon-btn" onClick={close}><Icon name="x" /></button>
        </div>

        <div className="modal-preview"><Character seed={name + color} color={color} status="working" size={110} /></div>

        <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>

        <label>Role</label>
        <div className="chips">
          {roles.map((r) => (
            <button type="button" key={r.id} className={`chip ${role === r.name ? 'on' : ''}`}
              style={{ ['--agent' as string]: r.color }}
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
            {app.providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.command ? ` (${p.command})` : ''}</option>
            ))}
          </select>
        </label>

        <label>Reports to
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Nobody (no lead) —</option>
            {leadOptions.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
          </select>
          {parentId && <small className="muted">The lead gets tools to hand tasks to this agent and read its progress (Claude Code agents).</small>}
        </label>

        <label>First task (optional)
          <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Add dark mode to the settings page and write tests for it" />
        </label>

        <label className={`check ${!isRepo ? 'disabled' : ''}`}>
          <input type="checkbox" disabled={!isRepo} checked={useWorktree} onChange={(e) => setUseWorktree(e.target.checked)} />
          <span>
            Isolate in its own git worktree (separate branch &amp; folder)
            <small>{isRepo ? 'Recommended when several agents work on the same repo.' : 'Project is not a git repository.'}</small>
          </span>
        </label>

        <label className="check">
          <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
          <span>
            Run on a server over SSH
            <small>The CLI runs on the remote machine (it must be installed and logged in there). Uses your ~/.ssh config and keys.</small>
          </span>
        </label>
        {remote && (
          <div className="row">
            <label style={{ flex: 1 }}>Host<input className="mono" value={sshHost} onChange={(e) => setSshHost(e.target.value)} placeholder="user@server or ssh-config alias" /></label>
            <label style={{ flex: 1 }}>Folder on the server<input className="mono" value={sshPath} onChange={(e) => setSshPath(e.target.value)} placeholder="~/apps/my-api" /></label>
          </div>
        )}

        {useWorktree && !remote && (
          <label>Branch name
            <input className="mono" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={`hive/${slug(name)}`} />
          </label>
        )}

        {error && <p className="error">{error}</p>}
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Starting…' : 'Create & start'}</button>
        </div>
      </form>
    </div>
  )
}
