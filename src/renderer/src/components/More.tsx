/**
 * Smaller feature UIs: CLI sign-in, accounts, Figma import, tracker import,
 * clone-from-git, SKILL.md export/import, the advisor and structured questions.
 */
import { useEffect, useState } from 'react'
import type { Account, AgentQuestion, Project, Provider } from '@shared/types'
import { useStore } from '../store'
import { Icon, cleanError } from './common'
import { Terminal } from './Terminal'

const toast = (t: string, k: 'info' | 'success' | 'error' = 'info'): void => useStore.getState().toast(t, k)
const err = (e: unknown): void => toast(cleanError(e), 'error')
const newId = (): string => Math.random().toString(36).slice(2, 10)

/* ---------- sign in (a login terminal for one CLI / account) ---------- */
export function SignInModal({ providerId, account, onClose }: { providerId: string; account?: Account; onClose: () => void }) {
  const [id, setId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  useEffect(() => {
    window.api.accounts.signin(providerId, account?.id).then(setId).catch(err)
  }, [providerId, account?.id])
  useEffect(() => {
    const t = setInterval(() => window.api.accounts.status(providerId, account?.id).then(setStatus).catch(() => undefined), 2500)
    window.api.accounts.status(providerId, account?.id).then(setStatus).catch(() => undefined)
    return () => clearInterval(t)
  }, [providerId, account?.id])
  const rt = useStore((s) => (id ? s.serverRuntimes[id] : undefined))
  const close = (): void => {
    if (id) window.api.servers.stop(id).catch(() => undefined)
    onClose()
  }
  return (
    <div className="backdrop" onMouseDown={close}>
      <div className="modal signin-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Sign in · {providerId}{account ? ` · ${account.name}` : ''}</h2>
          <span className={`chip ${/^Signed in/.test(status) ? 'ok' : ''}`}>{status || '…'}</span>
        </div>
        <p className="muted small">Follow the CLI's steps below – a browser window opens for the login (or click the link). Claude: if it doesn't ask you to log in, type <span className="mono">/login</span>. Close this when it says you are logged in{account ? ' – this account then works for every agent that uses it' : ''}.</p>
        <div className="signin-term">{id && rt ? <Terminal key={id} agentId={id} source="server" /> : <div className="muted small">Starting…</div>}</div>
        <div className="modal-foot"><button className="btn" onClick={close}>Done</button></div>
      </div>
    </div>
  )
}

/* ---------- Settings: per-CLI defaults, sign-in, accounts ---------- */
export function AccountsSettings() {
  const app = useStore((s) => s.app)
  const s = app.settings
  const [signin, setSignin] = useState<{ providerId: string; account?: Account } | null>(null)
  const [status, setStatus] = useState<Record<string, string>>({})
  const providers = app.providers.filter((p) => ['claude', 'codex', 'gemini'].includes(p.id))
  const saveSettings = (p: Partial<typeof s>): void => void window.api.settings.save(p).catch(err)
  const saveProvider = (id: string, p: { effort?: Provider['effort']; model?: string }): void =>
    void window.api.settings.saveProviders(app.providers.map((x) => (x.id === id ? { ...x, ...p } : x))).catch(err)
  const saveAccounts = (list: Account[]): void => void window.api.accounts.save(list).catch(err)
  useEffect(() => {
    for (const p of providers) window.api.accounts.status(p.id).then((t) => setStatus((x) => ({ ...x, [p.id]: t }))).catch(() => undefined)
    for (const a of s.accounts) window.api.accounts.status(a.providerId, a.id).then((t) => setStatus((x) => ({ ...x, [a.id]: t }))).catch(() => undefined)
  }, [signin, s.accounts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="set-group">
      <header><h2>Sign-in, accounts & defaults</h2>
        <p className="muted small">Log each CLI in from here, add extra Claude / Codex accounts (each gets its own config folder) and pick per-CLI defaults.</p></header>
      <div className="cli-list">
        {providers.map((p) => (
          <div key={p.id} className="cli-card">
            <div className="cli-head">
              <b>{p.name}</b>
              <span className={`chip ${/^Signed in/.test(status[p.id] ?? '') ? 'ok' : ''}`}>{status[p.id] ?? '…'}</span>
              <div className="spacer" />
              <button className="btn ghost sm" onClick={() => setSignin({ providerId: p.id })}><Icon name="lock" size={13} /> Sign in</button>
            </div>
            <div className="cli-fields">
              <label>Model<input className="mono" defaultValue={p.model ?? ''} placeholder="CLI default" onBlur={(e) => e.target.value !== (p.model ?? '') && saveProvider(p.id, { model: e.target.value || undefined })} /></label>
              {p.id !== 'gemini' && (
                <label>Reasoning effort
                  <select value={p.effort ?? ''} onChange={(e) => saveProvider(p.id, { effort: (e.target.value || undefined) as Provider['effort'] })}>
                    <option value="">CLI default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </label>
              )}
            </div>
            {p.id !== 'gemini' && (
              <div className="acc-list">
                {s.accounts.filter((a) => a.providerId === p.id).map((a) => (
                  <div key={a.id} className="acc-row">
                    <Icon name="users" size={12} />
                    <input value={a.name} onChange={(e) => saveAccounts(s.accounts.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))} />
                    <span className="muted small">{status[a.id] ?? ''}{(() => {
                      const n = app.agents.filter((g) => g.providerId === a.providerId && (g.accountId === a.id || (g.accountId === undefined && app.projectSettings[g.projectId]?.accounts?.[a.providerId] === a.id))).length
                      return n ? ` · used by ${n} agent${n === 1 ? '' : 's'}` : ' · not used yet – pick it per agent (Edit) or per project (Workspace → Automation)'
                    })()}</span>
                    <div className="spacer" />
                    <button className="btn ghost sm" onClick={() => setSignin({ providerId: p.id, account: a })}>Sign in</button>
                    <button className="icon-btn danger" title="Remove account" onClick={() => saveAccounts(s.accounts.filter((x) => x.id !== a.id))}><Icon name="trash" size={12} /></button>
                  </div>
                ))}
                <button className="link-btn" onClick={() => saveAccounts([...s.accounts, { id: newId(), providerId: p.id as 'claude' | 'codex', name: `${p.name} account ${s.accounts.filter((a) => a.providerId === p.id).length + 2}` }])}>
                  <Icon name="plus" size={12} /> Add another {p.name} account
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="set-row"><div className="set-label"><b>When an account hits its usage limit</b><span>Continue the same conversation on the next account of that CLI, or hand over to another CLI.</span></div><div className="set-control">
        <div className="row">
          <select value={s.autoSwitch ? 'on' : 'off'} onChange={(e) => saveSettings({ autoSwitch: e.target.value === 'on' })}>
            <option value="on">Switch automatically</option><option value="off">Just notify me</option>
          </select>
          <select value={s.fallbackProvider} onChange={(e) => saveSettings({ fallbackProvider: e.target.value })} disabled={!s.autoSwitch}>
            <option value="">then: no other CLI</option>
            {providers.map((p) => <option key={p.id} value={p.id}>then: {p.name}</option>)}
          </select>
        </div>
      </div></div>
      <div className="set-row"><div className="set-label"><b>Continue when the limit resets</b><span>If no other account takes over, the agent continues (and its queue goes out) when the usage window resets.</span></div><div className="set-control">
        <input type="checkbox" checked={s.resumeOnReset !== false} onChange={(e) => saveSettings({ resumeOnReset: e.target.checked })} />
      </div></div>
      <div className="set-row"><div className="set-label"><b>Bring agents back on launch</b><span>Agents and dev servers that were running when you quit start again (conversations resume).</span></div><div className="set-control">
        <input type="checkbox" checked={s.restoreSession} onChange={(e) => saveSettings({ restoreSession: e.target.checked })} />
      </div></div>
      <div className="set-row"><div className="set-label"><b>Agent language</b><span>Ask agents to answer in this language (Claude Code). Code and commits stay in English.</span></div><div className="set-control">
        <select value={s.agentLanguage} onChange={(e) => saveSettings({ agentLanguage: e.target.value })}>
          <option value="">Same as my message</option><option value="English">English</option><option value="Turkish">Türkçe</option><option value="German">Deutsch</option><option value="French">Français</option><option value="Spanish">Español</option>
        </select>
      </div></div>
      {signin && <SignInModal providerId={signin.providerId} account={signin.account} onClose={() => setSignin(null)} />}
    </section>
  )
}

/** account + effort selects for the agent modals */
export function AgentAccountFields({ providerId, accountId, effort, onChange }: { providerId: string; accountId?: string; effort?: string; onChange: (p: { accountId?: string; effort?: string }) => void }) {
  const accounts = useStore((s) => s.app.settings.accounts).filter((a) => a.providerId === providerId)
  if (!['claude', 'codex'].includes(providerId)) return null
  return (
    <div className="row">
      <label style={{ flex: 1 }}>Account
        <select value={accountId === undefined ? '__proj' : accountId} onChange={(e) => onChange({ accountId: e.target.value === '__proj' ? undefined : e.target.value })}>
          <option value="__proj">Project default</option>
          <option value="">Main login</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label style={{ flex: 1 }}>Reasoning effort
        <select value={effort ?? ''} onChange={(e) => onChange({ effort: e.target.value || undefined })}>
          <option value="">CLI default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
      </label>
    </div>
  )
}

/** project default account per CLI (Workspace → Automation) */
export function ProjectAccounts({ projectId }: { projectId: string }) {
  const app = useStore((s) => s.app)
  const ps = app.projectSettings[projectId] ?? {}
  if (!app.settings.accounts.length) return null
  const set = (providerId: string, id: string): void =>
    void window.api.automation.saveProject(projectId, { ...ps, accounts: { ...(ps.accounts ?? {}), [providerId]: id } }).catch(err)
  return (
    <section className="set-group">
      <header><h2>👥 Accounts for this project</h2><p className="muted small">Agents without their own account use these logins.</p></header>
      <div className="set-rows">
        {(['claude', 'codex'] as const).map((pid) => (
          <div key={pid} className="set-row"><div className="set-label"><b>{pid === 'claude' ? 'Claude Code' : 'Codex'}</b></div>
            <div className="set-control"><select value={ps.accounts?.[pid] ?? ''} onChange={(e) => set(pid, e.target.value)}>
              <option value="">Main login</option>
              {app.settings.accounts.filter((a) => a.providerId === pid).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------- Figma ---------- */
export function FigmaButton() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const pid = useStore((s) => s.selectedProjectId)
  const go = async (): Promise<void> => {
    setBusy(true)
    try {
      const f = await window.api.figma.frame(url.trim(), pid ?? undefined)
      useStore.setState({ pendingShots: [...useStore.getState().pendingShots, { path: f.path, dataUrl: f.dataUrl }] })
      const note = [`Implement this Figma frame: "${f.name}"${f.size ? ` (${f.size})` : ''} – ${f.url}`, f.texts.length ? `Texts in the design:\n${f.texts.map((t) => `- ${t}`).join('\n')}` : ''].filter(Boolean).join('\n\n')
      useStore.getState().insertIntoComposer(note)
      setOpen(false)
      setUrl('')
    } catch (e) {
      err(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button className="icon-btn" title="Attach a Figma frame" onClick={() => setOpen(true)}><Icon name="palette" size={15} /></button>
      {open && (
        <div className="backdrop" onMouseDown={() => setOpen(false)}>
          <div className="modal small-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Import from Figma</h2>
            <p className="muted small">Right-click a frame in Figma → Copy link. Needs a <code>FIGMA_TOKEN</code> secret (Workspace → Secrets).</p>
            <label>Frame link<input autoFocus value={url} placeholder="https://www.figma.com/design/…?node-id=12-34" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={busy || !url.trim()} onClick={go}>{busy ? 'Fetching…' : 'Attach'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ---------- tracker import ---------- */
type Kind = 'linear' | 'jira' | 'notion' | 'azure'
const TRACKERS: Record<Kind, { name: string; secrets: string[]; fields: [string, string, string][] }> = {
  linear: { name: 'Linear', secrets: ['LINEAR_API_KEY'], fields: [['team', 'Team key', 'ENG (optional)'], ['assignee', 'Only mine? (me / empty)', 'me']] },
  jira: { name: 'Jira', secrets: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'], fields: [['jql', 'JQL', 'project = ABC AND statusCategory != Done']] },
  notion: { name: 'Notion', secrets: ['NOTION_TOKEN'], fields: [['database', 'Database ID or link', 'https://www.notion.so/…']] },
  azure: { name: 'Azure DevOps', secrets: ['AZURE_DEVOPS_PAT'], fields: [['org', 'Organization', 'contoso'], ['project', 'Project', 'Web'], ['wiql', 'WIQL (optional)', '']] }
}
export function TrackerImport({ projectId }: { projectId: string }) {
  const [kind, setKind] = useState<Kind | null>(null)
  const [opts, setOpts] = useState<Record<string, string>>({})
  const [sec, setSec] = useState<Record<string, string>>({})
  const [have, setHave] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!kind) return
    window.api.secrets.list().then((l) => setHave(l.filter((x) => !x.projectId || x.projectId === projectId).map((x) => x.name))).catch(() => undefined)
    try {
      setOpts(JSON.parse(localStorage.getItem(`hive.tracker.${projectId}.${kind}`) ?? '{}'))
    } catch {
      setOpts({})
    }
  }, [kind, projectId])
  const run = async (): Promise<void> => {
    if (!kind) return
    setBusy(true)
    try {
      for (const [k, v] of Object.entries(sec)) if (v.trim()) await window.api.secrets.set(k, v.trim())
      try {
        localStorage.setItem(`hive.tracker.${projectId}.${kind}`, JSON.stringify(opts))
      } catch {
        /* ignore */
      }
      const r = await window.api.tracker.import(projectId, kind, opts)
      toast(`${TRACKERS[kind].name}: ${r.added} new, ${r.updated} updated (${r.total} open)`, 'success')
      setKind(null)
      setSec({})
    } catch (e) {
      err(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <select className="btn ghost sm" value="" onChange={(e) => e.target.value && setKind(e.target.value as Kind)} title="Import open items as Todo cards (read-only)">
        <option value="">Import from…</option>
        {(Object.keys(TRACKERS) as Kind[]).map((k) => <option key={k} value={k}>{TRACKERS[k].name}</option>)}
      </select>
      {kind && (
        <div className="backdrop" onMouseDown={() => setKind(null)}>
          <div className="modal small-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Import from {TRACKERS[kind].name}</h2>
            <p className="muted small">Open items become Todo cards; nothing is written back. Re-import updates existing cards.</p>
            {TRACKERS[kind].secrets.map((k) => (
              <label key={k}><span className="mono">{k}</span>{have.includes(k) && <small className="muted"> saved ✓ (leave empty to keep)</small>}
                <input type={k.includes('URL') || k.includes('EMAIL') ? 'text' : 'password'} value={sec[k] ?? ''} placeholder={have.includes(k) ? '••••••' : ''} onChange={(e) => setSec({ ...sec, [k]: e.target.value })} />
              </label>
            ))}
            {TRACKERS[kind].fields.map(([k, label, ph]) => (
              <label key={k}>{label}<input value={opts[k] ?? ''} placeholder={ph} onChange={(e) => setOpts({ ...opts, [k]: e.target.value })} /></label>
            ))}
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setKind(null)}>Cancel</button>
              <button className="btn" disabled={busy} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** backlog auto-pick mode */
export function AutoPickSelect({ projectId }: { projectId: string }) {
  const ps = useStore((s) => s.app.projectSettings[projectId]) ?? {}
  return (
    <select className="btn ghost sm" value={ps.autoPick ?? 'off'} title="Idle agents take the next Todo card by themselves and mark it done when their turn ends"
      onChange={(e) => window.api.automation.saveProject(projectId, { ...ps, autoPick: e.target.value as 'off' | 'assigned' | 'any' }).catch(err)}>
      <option value="off">Auto-pick: off</option>
      <option value="assigned">Auto-pick: assigned cards</option>
      <option value="any">Auto-pick: any card</option>
    </select>
  )
}

/** "Suggest agent" button for the card editor */
export function AdvisorButton({ projectId, text, onPick }: { projectId: string; text: string; onPick: (agentId: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState('')
  return (
    <span className="advisor">
      <button type="button" className="link-btn" disabled={busy || !text.trim()} onClick={async () => {
        setBusy(true)
        try {
          const r = await window.api.advisor(projectId, text)
          onPick(r.agentId)
          setWhy(r.reason)
        } catch (e) {
          err(e)
        } finally {
          setBusy(false)
        }
      }}><Icon name="sparkle" size={12} /> {busy ? 'Thinking…' : 'Suggest agent'}</button>
      {why && <small className="muted"> {why}</small>}
    </span>
  )
}

/* ---------- clone from git ---------- */
export function CloneRepoModal({ onClose }: { onClose: () => void }) {
  const [repos, setRepos] = useState<{ name: string; url: string; host: string; description: string }[] | null>(null)
  const [url, setUrl] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    window.api.repos.list().then(setRepos).catch(() => setRepos([]))
  }, [])
  const clone = async (u: string): Promise<void> => {
    setBusy(true)
    try {
      const p: Project | null = await window.api.repos.clone(u)
      if (p) {
        useStore.getState().selectProject(p.id)
        toast(`Cloned ${p.name}`, 'success')
        onClose()
      }
    } catch (e) {
      err(e)
    } finally {
      setBusy(false)
    }
  }
  const list = (repos ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal clone-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Clone from Git</h2>
        <label>Repository URL or owner/repo
          <div className="row"><input autoFocus value={url} placeholder="https://github.com/owner/repo.git" onChange={(e) => setUrl(e.target.value)} />
            <button className="btn" disabled={busy || !url.trim()} onClick={() => clone(url.trim())}>{busy ? 'Cloning…' : 'Clone'}</button></div>
        </label>
        <div className="search-box"><Icon name="search" size={13} /><input placeholder="Your GitHub / GitLab repos…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="repo-list">
          {repos === null && <p className="muted small">Loading your repos (gh / glab)…</p>}
          {repos?.length === 0 && <p className="muted small">No repos found – sign in with <code>gh auth login</code> or <code>glab auth login</code>, or paste a URL.</p>}
          {list.map((r) => (
            <button key={r.url} className="repo-item" disabled={busy} onClick={() => clone(r.url)}>
              <Icon name={r.host === 'github' ? 'github' : 'branch'} size={13} /> <b>{r.name}</b>
              <span className="muted small">{r.description}</span>
            </button>
          ))}
        </div>
        <div className="modal-foot"><button className="btn ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}

/* ---------- SKILL.md export / import ---------- */
export function SkillFilesBar({ projectId }: { projectId?: string }) {
  const exp = (target: 'claude-project' | 'claude-user' | 'codex-user' | 'cursor-project'): void =>
    void window.api.skillFiles.export(target, projectId).then((f) => toast(`Wrote ${f.length} skill file${f.length === 1 ? '' : 's'}`, 'success')).catch(err)
  return (
    <div className="row skill-files">
      <select className="btn ghost sm" value="" onChange={(e) => e.target.value && exp(e.target.value as 'claude-project')}>
        <option value="">Export as SKILL.md…</option>
        {projectId && <option value="claude-project">This project (.claude/skills)</option>}
        <option value="claude-user">Claude Code, all projects (~/.claude/skills)</option>
        <option value="codex-user">Codex (~/.codex/skills)</option>
        {projectId && <option value="cursor-project">Cursor rules (.cursor/rules)</option>}
      </select>
      <button className="btn ghost sm" onClick={() => window.api.skillFiles.import(projectId).then((n) => toast(`Imported ${n} SKILL.md file${n === 1 ? '' : 's'}`, 'success')).catch(err)}>
        <Icon name="inbox" size={13} /> Import SKILL.md files
      </button>
    </div>
  )
}

/* ---------- structured questions ---------- */
export function QuestionModal() {
  const [qs, setQs] = useState<AgentQuestion[]>([])
  const [picks, setPicks] = useState<number[][]>([])
  const [other, setOther] = useState('')
  const agents = useStore((s) => s.app.agents)
  useEffect(() => {
    window.api.questions.list().then(setQs).catch(() => undefined)
    const a = window.api.questions.onReady((q) => setQs((l) => [...l.filter((x) => x.agentId !== q.agentId), q]))
    const b = window.api.questions.onCleared((id) => setQs((l) => l.filter((x) => x.agentId !== id)))
    return () => {
      a()
      b()
    }
  }, [])
  const cur = qs[0]
  useEffect(() => {
    setPicks(cur ? cur.questions.map((q) => (q.multiSelect ? [] : [0])) : [])
    setOther('')
  }, [cur?.agentId, cur?.at]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cur) return null
  const agent = agents.find((a) => a.id === cur.agentId)
  const toggle = (qi: number, oi: number, multi?: boolean): void =>
    setPicks(picks.map((p, i) => (i !== qi ? p : multi ? (p.includes(oi) ? p.filter((x) => x !== oi) : [...p, oi]) : [oi])))
  const answer = (): void => {
    const last = cur.questions.length - 1
    const ps = other.trim() ? picks.map((p, i) => (i === last ? [] : p)) : picks
    window.api.questions.answer(cur.agentId, ps, other.trim() || undefined).catch(err)
    setQs(qs.slice(1))
  }
  return (
    <div className="backdrop" onMouseDown={() => setQs(qs.slice(1))}>
      <div className="modal question-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2><Icon name="message" size={16} /> {agent?.name ?? 'Agent'} asks</h2></div>
        {cur.questions.map((q, qi) => (
          <div key={qi} className="q-block">
            {q.header && <span className="chip">{q.header}</span>}
            <p><b>{q.question}</b>{q.multiSelect && <small className="muted"> (pick any)</small>}</p>
            <div className="q-options">
              {(q.options ?? []).map((o, oi) => (
                <button key={oi} className={`q-opt ${picks[qi]?.includes(oi) ? 'on' : ''}`} onClick={() => toggle(qi, oi, q.multiSelect)}>
                  <b>{o.label}</b>{o.description && <small>{o.description}</small>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <label>Or type your own answer{cur.questions.length > 1 ? ' (last question)' : ''}<input value={other} onChange={(e) => setOther(e.target.value)} /></label>
        <div className="modal-foot">
          <button className="btn ghost" onClick={() => { useStore.getState().focusAgent(cur.agentId); setQs(qs.slice(1)) }}>Answer in terminal</button>
          <button className="btn" onClick={answer}><Icon name="send" size={13} /> Answer</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- where everyone left off (after resuming a paused project) ---------- */
export function PauseSummary() {
  const [list, setList] = useState<{ agentId: string; name: string; text: string }[]>([])
  useEffect(() => window.api.onPauseSummary(setList), [])
  if (!list.length) return null
  return (
    <div className="backdrop" onMouseDown={() => setList([])}>
      <div className="modal pause-summary" onMouseDown={(e) => e.stopPropagation()}>
        <h2><Icon name="play" size={15} /> Where everyone left off</h2>
        <p className="muted small">The last reply of each agent before the pause – they continue now.</p>
        {list.map((x) => (
          <div key={x.agentId} className="ps-item" onClick={() => { useStore.getState().focusAgent(x.agentId); setList([]) }}>
            <b>{x.name}</b>
            <p>{x.text.replace(/[#*`>_]/g, '').slice(0, 400)}{x.text.length > 400 ? '…' : ''}</p>
          </div>
        ))}
        <div className="modal-foot"><button className="btn" onClick={() => setList([])}>OK</button></div>
      </div>
    </div>
  )
}

/* ---------- conversations started in a terminal ---------- */
export function ImportSessionsModal({ onClose }: { onClose: () => void }) {
  const pid = useStore((s) => s.selectedProjectId)
  const [list, setList] = useState<{ path: string; kind: 'claude' | 'codex'; at: number; size: number; title: string }[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    if (pid) window.api.externalSessions.list(pid).then(setList).catch((e) => (err(e), setList([])))
  }, [pid])
  const adopt = async (x: { path: string; kind: 'claude' | 'codex'; title: string }): Promise<void> => {
    if (!pid) return
    setBusy(x.path)
    try {
      const id = await window.api.externalSessions.adopt(pid, x.path, x.kind, x.title.split(/\s+/).slice(0, 4).join(' '))
      useStore.getState().focusAgent(id)
      toast('Conversation resumed as a new agent', 'success')
      onClose()
    } catch (e) {
      err(e)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal clone-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Continue a terminal session</h2>
        <p className="muted small">Claude Code and Codex conversations you started in a terminal in this project folder. Pick one – it continues as a Hive agent with its full history.</p>
        <div className="repo-list">
          {list === null && <p className="muted small">Looking for sessions…</p>}
          {list?.length === 0 && <p className="muted small">No other sessions found for this folder.</p>}
          {list?.map((x) => (
            <button key={x.path} className="repo-item" disabled={!!busy} onClick={() => adopt(x)}>
              <Icon name={x.kind === 'claude' ? 'sparkle' : 'terminal'} size={13} /> <b>{x.title}</b>
              <span className="muted small">{x.kind === 'claude' ? 'Claude Code' : 'Codex'} · {new Date(x.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {Math.round(x.size / 1024)} KB{busy === x.path ? ' · starting…' : ''}</span>
            </button>
          ))}
        </div>
        <div className="modal-foot"><button className="btn ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}

/* ---------- "a new version is available" ---------- */
type Upd = NonNullable<Awaited<ReturnType<typeof window.api.updates.check>>>
export async function installUpdate(): Promise<void> {
  try {
    const r = await window.api.updates.install()
    if (r === 'installing') toast('Installing the update – Hive restarts in a moment', 'success')
    else if (r === 'opened') toast('Download the new version from the release page', 'info')
  } catch (e) {
    err(e)
  }
}
export function UpdateBanner() {
  const [u, setU] = useState<Upd | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [notes, setNotes] = useState(false)
  useEffect(() => {
    const a = window.api.updates.onAvailable(setU)
    const b = window.api.updates.onProgress(setProgress)
    return () => {
      a()
      b()
    }
  }, [])
  if (!u) return null
  const what = u.notes.split(/\n## Download/)[0].trim()
  return (
    <div className="update-bar">
      <Icon name="sparkle" size={14} />
      <span><b>Hive {u.version}</b> is available</span>
      {what && <button className="link-btn" onClick={() => setNotes(!notes)}>What's new</button>}
      <div className="spacer" />
      {progress !== null && progress < 1 ? (
        <span className="upd-progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /> {Math.round(progress * 100)}%</span>
      ) : progress === 1 ? (
        <span className="muted small">Restarting…</span>
      ) : (
        <>
          <button className="btn ghost sm" onClick={() => { window.api.updates.skip(u.version); setU(null) }}>Skip this version</button>
          <button className="btn ghost sm" onClick={() => setU(null)}>Later</button>
          <button className="btn sm" onClick={() => { setProgress(0); installUpdate().finally(() => setProgress((p) => (p === 1 ? 1 : null))) }}>
            {u.canInstall ? 'Install & restart' : 'Download'}
          </button>
        </>
      )}
      {notes && what && <div className="update-notes md-body" onClick={() => setNotes(false)}><pre>{what}</pre></div>}
    </div>
  )
}

export function UpdateSettings() {
  const s = useStore((st) => st.app.settings)
  const [state, setState] = useState<string>('')
  const [found, setFound] = useState<Upd | null>(null)
  const check = (): void => {
    setState('Checking…')
    window.api.updates.check().then((u) => {
      setFound(u)
      setState(u ? `Hive ${u.version} is available` : 'Hive is up to date')
    }).catch((e) => setState(cleanError(e)))
  }
  return (
    <section className="set-group">
      <header><h2>Updates</h2><p className="muted small">New versions come from GitHub Releases. Installing downloads the right file for this computer, swaps it in and restarts Hive.</p></header>
      <div className="set-rows">
        <div className="set-row"><div className="set-label"><b>Check automatically</b><span>On launch and every 6 hours{s.lastUpdateCheck ? ` · last check ${new Date(s.lastUpdateCheck).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span></div>
          <div className="set-control"><input type="checkbox" checked={s.autoUpdateCheck !== false} onChange={(e) => window.api.settings.save({ autoUpdateCheck: e.target.checked })} /></div></div>
        <div className="set-row"><div className="set-label"><b>{state || 'Check now'}</b></div>
          <div className="set-control">
            {found && <button className="btn sm" onClick={installUpdate}>{found.canInstall ? 'Install & restart' : 'Download'}</button>}
            <button className="btn ghost sm" onClick={check}><Icon name="refresh" size={13} /> Check for updates</button>
          </div></div>
      </div>
    </section>
  )
}
