import { useCallback, useEffect, useRef, useState } from 'react'
import type { Agent, GitSummary } from '@shared/types'
import { useStore } from '../store'
import { Icon, cleanError } from './common'
import { DiffView } from './DiffView'
import { Resizer } from './Resizer'
import { clamp, useLayout } from '../layout'

const STATUS_NAME: Record<string, string> = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', '?': 'New', U: 'Conflict' }

export function ChangesPanel({ agent, onClose, mode = 'side', onMode }: {
  agent: Agent
  onClose?: () => void
  mode?: 'side' | 'full'
  onMode?: (m: 'side' | 'full') => void
}) {
  const L = useLayout()
  const base = useRef(0)
  const status = useStore((s) => s.runtimes[agent.id]?.status)
  const toast = useStore((s) => s.toast)
  const [data, setData] = useState<GitSummary | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<string>('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  // 'branch' = everything the agent did on its branch (commits + uncommitted)
  const [scope, setScope] = useState<'work' | 'branch'>('work')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState('')

  const refresh = useCallback(() => {
    const p = scope === 'branch' ? window.api.review.summary(agent.id) : window.api.gitSummary(agent.id)
    p.then(setData).catch(() => setData(null))
  }, [agent.id, scope])

  useEffect(() => refresh(), [refresh])
  useEffect(() => {
    if (status !== 'working') refresh()
  }, [refresh, status])
  // light polling while the agent works, so new files show up
  useEffect(() => {
    if (status !== 'working') return
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [refresh, status])

  // keep selection valid; default to first file
  const files = data?.files ?? []
  useEffect(() => {
    if (!files.length) setSelected(null)
    else if (!selected || !files.some((f) => f.path === selected)) setSelected(files[0].path)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) return setFileDiff('')
    const p = scope === 'branch' ? window.api.review.fileDiff(agent.id, selected) : window.api.gitFileDiff(agent.id, selected)
    p.then(setFileDiff).catch((e) => setFileDiff(cleanError(e)))
  }, [agent.id, selected, data, scope])

  const move = (dir: 1 | -1): void => {
    const i = files.findIndex((f) => f.path === selected)
    const next = files[Math.min(files.length - 1, Math.max(0, i + dir))]
    if (next) setSelected(next.path)
  }

  const run = async (fn: () => Promise<unknown>, ok?: string): Promise<void> => {
    setBusy(true)
    try {
      const res = await fn()
      if (ok) toast(typeof res === 'string' && res ? res : ok, 'success')
      refresh()
    } catch (e) {
      toast(cleanError(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const commit = (): void => {
    if (!msg.trim()) return
    run(() => window.api.gitCommit(agent.id, msg.trim()), 'Committed').then(() => setMsg(''))
  }
  const aiMessage = async (): Promise<void> => {
    setAiBusy(true)
    try {
      const r = await window.api.review.aiMessage(agent.id)
      setMsg(r.message)
      if (!r.ai) toast('Claude was not available – used a simple message', 'info')
    } catch (e) {
      toast(cleanError(e), 'error')
    } finally {
      setAiBusy(false)
    }
  }
  const noteCount = Object.values(notes).filter((n) => n.trim()).length + (general.trim() ? 1 : 0)
  const sendBack = (): void => {
    const lines = Object.entries(notes).filter(([, n]) => n.trim()).map(([f, n]) => `- ${f}: ${n.trim()}`)
    const text = ['[Review feedback – please address and tell me when done]', general.trim(), lines.length ? lines.join('\n') : ''].filter(Boolean).join('\n\n')
    window.api.queue
      .add(agent.id, text)
      .then(() => {
        toast(`Feedback sent to ${agent.name}`, 'success')
        setNotes({})
        setGeneral('')
      })
      .catch((e) => toast(cleanError(e), 'error'))
  }
  const approve = async (): Promise<void> => {
    const uncommitted = scope === 'work' ? files.length > 0 : (await window.api.gitSummary(agent.id)).files.length > 0
    const steps = [uncommitted && 'commit the changes (AI message)', agent.branch && `merge ${agent.branch} into the main project`].filter(Boolean)
    if (!steps.length) return toast('Nothing to approve', 'info')
    if (!confirm(`Approve: ${steps.join(' and ')}?`)) return
    await run(async () => {
      if (uncommitted) {
        const m = msg.trim() || (await window.api.review.aiMessage(agent.id)).message
        await window.api.gitCommit(agent.id, m)
        setMsg('')
      }
      if (agent.branch) return window.api.gitMerge(agent.id)
      return 'Committed'
    }, 'Approved')
  }
  const merge = (): void => {
    if (confirm(`Merge ${agent.branch} into the main project's current branch?`)) run(() => window.api.gitMerge(agent.id), 'Merged')
  }
  const revert = (path: string, st: string): void => {
    if (st.startsWith('?')) return toast('New (untracked) files can be deleted from Finder', 'info')
    if (confirm(`Discard all changes to ${path}? This cannot be undone.`))
      run(() => window.api.gitRevertFile(agent.id, path), `Reverted ${path}`)
  }

  const sel = files.find((f) => f.path === selected)
  const openInEditor = (path: string, line?: number): void => {
    const root = agent.worktreePath ?? useStore.getState().app.projects.find((p) => p.id === agent.projectId)?.path
    if (root) useStore.getState().openCode(root, path, line)
  }
  const totals = files.reduce((t, f) => ({ add: t.add + (f.added ?? 0), del: t.del + (f.removed ?? 0) }), { add: 0, del: 0 })

  return (
    <aside className={`changes ${mode}`} style={mode === 'side' ? { width: L.changesW } : undefined}>
      <div className="changes-head">
        <Icon name="diff" />
        <strong>Changes</strong>
        {files.length > 0 && <span className="count-badge">{files.length}</span>}
        {totals.add + totals.del > 0 && (
          <span className="nums"><em className="plus">+{totals.add}</em><em className="minus">−{totals.del}</em></span>
        )}
        {data?.branch && (
          <span className="branch">
            <Icon name="branch" size={11} /> {data.branch}
          </span>
        )}
        <div className="spacer" />
        {agent.branch && (
          <div className="seg sm scope">
            <button className={scope === 'work' ? 'on' : ''} title="Uncommitted changes" onClick={() => setScope('work')}>Uncommitted</button>
            <button className={scope === 'branch' ? 'on' : ''} title="Everything on the agent's branch since it branched off" onClick={() => setScope('branch')}>Whole branch</button>
          </div>
        )}
        <div className="seg sm">
          <button className={L.diffMode === 'unified' ? 'on' : ''} title="Unified" onClick={() => L.set({ diffMode: 'unified' })}><Icon name="rows" size={13} /></button>
          <button className={L.diffMode === 'split' ? 'on' : ''} title="Side by side" onClick={() => L.set({ diffMode: 'split' })}><Icon name="columns" size={13} /></button>
        </div>
        <button className={`icon-btn ${L.wrap ? 'on' : ''}`} title="Wrap long lines" onClick={() => L.set({ wrap: !L.wrap })}><Icon name="wrap" size={14} /></button>
        <button className="icon-btn" title="Smaller text" onClick={() => L.set({ diffFont: clamp(L.diffFont - 1, 9, 20) })}><span className="kbd">A−</span></button>
        <button className="icon-btn" title="Larger text" onClick={() => L.set({ diffFont: clamp(L.diffFont + 1, 9, 20) })}><span className="kbd">A+</span></button>
        <button className="icon-btn" title="Refresh" onClick={refresh}><Icon name="refresh" size={14} /></button>
        {onMode && (
          <button className="icon-btn" title={mode === 'full' ? 'Back to side panel' : 'Full-screen review'} onClick={() => onMode(mode === 'full' ? 'side' : 'full')}>
            <Icon name={mode === 'full' ? 'collapse' : 'expand'} size={14} />
          </button>
        )}
        {onClose && (
          <button className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      {!data ? (
        <p className="muted small pad">Loading…</p>
      ) : !data.isRepo ? (
        <p className="muted small pad">This folder is not a git repository.</p>
      ) : (
        <>
          <div className="changes-body" style={mode === 'full' ? { gridTemplateColumns: `${L.filesW}px 6px 1fr` } : { gridTemplateRows: `${L.filesH}px 6px 1fr` }}>
          <ul
            style={undefined}
            className="files"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), move(1))
              if (e.key === 'ArrowUp') (e.preventDefault(), move(-1))
              if (e.key === 'Enter' && selected) openInEditor(selected)
            }}
          >
            {files.length === 0 && <li className="muted empty">Working tree clean</li>}
            {files.map((f) => {
              const st = f.status[0] === '?' ? '?' : f.status.replace(/\s/g, '')[0] ?? '?'
              const slash = f.path.lastIndexOf('/')
              return (
                <li
                  key={f.path}
                  className={f.path === selected ? 'on' : ''}
                  onClick={() => setSelected(f.path)}
                  onDoubleClick={() => openInEditor(f.path)}
                  title={`${STATUS_NAME[st] ?? f.status} · ${f.path}\nDouble-click to edit`}
                >
                  <span className={`fstat s-${st === '?' ? 'u' : st}`}>{st === '?' ? 'U' : st}</span>
                  <span className="fpath">
                    <b>{f.path.slice(slash + 1)}</b>
                    {slash > 0 && <i>{f.path.slice(0, slash)}</i>}
                  </span>
                  {(f.added || f.removed) ? (
                    <span className="nums">
                      {f.added ? <em className="plus">+{f.added}</em> : null}
                      {f.removed ? <em className="minus">−{f.removed}</em> : null}
                    </span>
                  ) : null}
                  <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" title="Edit in Hive" onClick={() => openInEditor(f.path)}>
                      <Icon name="edit" size={13} />
                    </button>
                    <button className="icon-btn" title="Show in Finder" onClick={() => window.api.revealFile(agent.id, f.path)}>
                      <Icon name="folder" size={13} />
                    </button>
                    <button className="icon-btn danger" title="Discard changes" onClick={() => revert(f.path, f.status)}>
                      <Icon name="undo" size={13} />
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>

          {mode === 'full' ? (
            <Resizer axis="x" onStart={() => (base.current = L.filesW)} onDrag={(d) => L.set({ filesW: clamp(base.current + d, 180, 600) })} onReset={() => L.reset('filesW')} />
          ) : (
            <Resizer axis="y" onStart={() => (base.current = L.filesH)} onDrag={(d) => L.set({ filesH: clamp(base.current + d, 60, 600) })} onReset={() => L.reset('filesH')} />
          )}
          <div className="diff-pane">
          {sel && (
            <div className="file-bar">
              <span className={`fstat s-${sel.status[0] === '?' ? 'u' : sel.status.replace(/\s/g, '')[0]}`}>{STATUS_NAME[sel.status[0] === '?' ? '?' : sel.status.replace(/\s/g, '')[0]] ?? sel.status}</span>
              <span className="mono">{sel.path}</span>
              <button className="btn ghost sm" title="Edit in Hive" onClick={() => openInEditor(sel.path, firstChange(fileDiff))}><Icon name="code" size={13} /> Edit</button>
              <span className="muted small">{files.findIndex((f) => f.path === selected) + 1} / {files.length}</span>
              <button className="icon-btn" title="Previous file (↑)" onClick={() => move(-1)}>
                <Icon name="chevronUp" size={13} />
              </button>
              <button className="icon-btn" title="Next file (↓)" onClick={() => move(1)}>
                <Icon name="chevron" size={13} />
              </button>
            </div>
          )}
          {sel ? (
            <DiffView diff={fileDiff} path={sel.path} mode={mode === 'side' && L.changesW < 560 ? 'unified' : L.diffMode} wrap={L.wrap} fontSize={L.diffFont} />
          ) : (
            <div className="diff"><div className="diff-empty">{scope === 'branch' ? 'No changes on this branch yet' : 'Working tree clean – nothing to review'}</div></div>
          )}
          {mode === 'full' && sel && (
            <div className="review-note">
              <Icon name="message" size={13} />
              <input placeholder={`Note for ${agent.name} about ${sel.path.split('/').pop()}…`} value={notes[sel.path] ?? ''} onChange={(e) => setNotes({ ...notes, [sel.path]: e.target.value })} />
            </div>
          )}
          </div>
          </div>

          {mode === 'full' && (
            <div className="review-bar">
              <input placeholder="Overall feedback (optional)…" value={general} onChange={(e) => setGeneral(e.target.value)} />
              <button className="btn ghost" disabled={!noteCount} onClick={sendBack} title="Send your notes to the agent (queued if it is busy)">
                <Icon name="undo" size={14} /> Send back{noteCount ? ` (${noteCount})` : ''}
              </button>
              <button className="btn approve" disabled={busy} onClick={approve} title={agent.branch ? 'Commit (if needed) and merge' : 'Commit everything'}>
                <Icon name="check" size={14} /> Approve
              </button>
            </div>
          )}
          <div className="commit">
            <button className={`icon-btn ai-btn ${aiBusy ? 'spin' : ''}`} disabled={aiBusy || (scope === 'work' && files.length === 0)} title="Write the message with AI (from the real diff, Conventional Commits)" onClick={aiMessage}>
              <Icon name="sparkle" size={15} />
            </button>
            <textarea
              className="commit-msg"
              rows={msg.includes('\n') ? 4 : 1}
              placeholder="Commit message (✨ to write it with AI)"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  commit()
                }
              }}
            />
            <button className="btn" disabled={busy || !msg.trim() || files.length === 0} onClick={commit}>
              Commit all
            </button>
          </div>
          {agent.branch && (
            <div className="commit merge">
              <span className="muted small">Commit first, then merge this branch into the main project.</span>
              <button className="btn ghost" disabled={busy || files.length > 0} onClick={merge}>
                <Icon name="branch" /> Merge
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  )
}

/** First changed line number in a unified diff (for jumping the editor there). */
function firstChange(diff: string): number | undefined {
  const m = diff.match(/^@@ -\d+(?:,\d+)? \+(\d+)/m)
  return m ? Number(m[1]) : undefined
}
