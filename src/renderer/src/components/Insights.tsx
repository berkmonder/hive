import { useEffect, useMemo, useState } from 'react'
import type { ReplayTurn, WeeklyReport } from '@shared/insights'
import { useStore } from '../store'
import { Icon, cleanError } from './common'
import { Character } from './Character'
import { fmtTok, fmtUsd } from './UsageView'

/* ---------------- session replay ---------------- */

export function ReplayModal() {
  const agentId = useStore((s) => s.replayFor)
  const agent = useStore((s) => s.app.agents.find((a) => a.id === s.replayFor))
  const [sessions, setSessions] = useState<{ path: string; id: string }[]>([])
  const [path, setPath] = useState('')
  const [turns, setTurns] = useState<ReplayTurn[] | null>(null)
  const [sel, setSel] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!agentId) return
    setTurns(null)
    window.api.insights.sessions(agentId).then((l) => {
      setSessions(l)
      setPath(l[0]?.path ?? '')
    })
  }, [agentId])
  useEffect(() => {
    if (!agentId || !path) return
    setTurns(null)
    window.api.insights.replay(agentId, path).then((t) => {
      setTurns(t)
      setSel(0)
    }).catch((e) => useStore.getState().toast(cleanError(e), 'error'))
  }, [agentId, path])
  useEffect(() => {
    if (!playing || !turns) return
    if (sel >= turns.length - 1) return setPlaying(false)
    const t = setTimeout(() => setSel((s) => s + 1), 1400)
    return () => clearTimeout(t)
  }, [playing, sel, turns])
  if (!agentId || !agent) return null
  const close = (): void => useStore.setState({ replayFor: null })
  const max = Math.max(1, ...(turns ?? []).map((t) => t.context))
  const window200 = max > 200_000 ? 1_000_000 : 200_000
  const t = turns?.[sel]
  const heavy = t ? [...t.tools].sort((a, b) => b.resultChars - a.resultChars).slice(0, 3).filter((x) => x.resultChars > 2000) : []
  return (
    <div className="backdrop" onMouseDown={close}>
      <div className="modal replay" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ justifyContent: 'flex-start' }}>
          <Character head seed={agent.id} color={agent.color} status="idle" size={30} />
          <div style={{ flex: 1 }}>
            <h2>Session replay · {agent.name}</h2>
            <p className="muted small">Turn by turn – what was asked, what the agent did and what filled the context window.</p>
          </div>
          <select value={path} onChange={(e) => setPath(e.target.value)} style={{ width: 260 }}>
            {sessions.map((s, i) => <option key={s.path} value={s.path}>{i === 0 ? 'Latest · ' : ''}{s.id.slice(0, 8)}</option>)}
          </select>
        </div>
        {!sessions.length ? (
          <p className="muted">No Claude Code sessions recorded for {agent.name} yet.</p>
        ) : !turns ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="rp-chart">
              {turns.map((x, i) => (
                <button key={i} className={`rp-bar ${i === sel ? 'on' : ''} ${x.delta > 20_000 ? 'big' : ''}`} title={`Turn ${i + 1}: ${fmtTok(x.context)} context (+${fmtTok(x.delta)})`} onClick={() => (setSel(i), setPlaying(false))}>
                  <i style={{ height: `${(x.context / max) * 100}%` }} />
                </button>
              ))}
              <span className="rp-limit">{fmtTok(window200)} window · peak {Math.round((max / window200) * 100)}%</span>
            </div>
            <div className="rp-controls">
              <button className="icon-btn" disabled={sel === 0} onClick={() => setSel(sel - 1)}><Icon name="chevronUp" size={14} /></button>
              <button className="btn sm" onClick={() => setPlaying(!playing)}><Icon name={playing ? 'pause' : 'play'} size={12} /> {playing ? 'Pause' : 'Play'}</button>
              <button className="icon-btn" disabled={sel >= turns.length - 1} onClick={() => setSel(sel + 1)}><Icon name="chevron" size={14} /></button>
              <span className="muted small">Turn {sel + 1} / {turns.length}</span>
              {t && <span className="chip">ctx {fmtTok(t.context)} · +{fmtTok(t.delta)} · out {fmtTok(t.output)}</span>}
              {t?.at ? <span className="muted small">{new Date(t.at).toLocaleString()}</span> : null}
            </div>
            {t && (
              <div className="rp-turn">
                <div className="chat-msg user"><div className="chat-who">You</div><div className="chat-body md-body">{t.user}</div></div>
                {t.tools.length > 0 && (
                  <div className="rp-tools">
                    {t.tools.map((x, i) => (
                      <span key={i} className={`rp-tool ${x.resultChars > 8000 ? 'heavy' : ''}`} title={x.resultChars ? `${fmtTok(Math.round(x.resultChars / 4))} tokens of output` : ''}>
                        {x.name}{x.arg ? <em>({x.arg})</em> : null}
                      </span>
                    ))}
                  </div>
                )}
                {heavy.length > 0 && (
                  <p className="rp-hint"><Icon name="info" size={12} /> Biggest context fillers this turn: {heavy.map((h) => `${h.name}${h.arg ? ` ${h.arg}` : ''} (~${fmtTok(Math.round(h.resultChars / 4))})`).join(', ')}</p>
                )}
                {t.replies.map((r, i) => (
                  <div key={i} className="chat-msg assistant"><div className="chat-who">{agent.name}</div><div className="chat-body md-body" style={{ whiteSpace: 'pre-wrap' }}>{r}</div></div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="modal-foot"><button className="btn ghost" onClick={close}>Close</button></div>
      </div>
    </div>
  )
}

/* ---------------- weekly report ---------------- */

export function WeeklyReportModal({ onClose }: { onClose: () => void }) {
  const projectId = useStore((s) => s.selectedProjectId)
  const [days, setDays] = useState(7)
  const [r, setR] = useState<WeeklyReport | null>(null)
  useEffect(() => {
    if (!projectId) return
    setR(null)
    window.api.insights.weekly(projectId, days).then(setR).catch((e) => useStore.getState().toast(cleanError(e), 'error'))
  }, [projectId, days])
  const md = useMemo(() => (r ? toMarkdown(r) : ''), [r])
  const totals = r && {
    cost: r.agents.reduce((s, a) => s + a.cost, 0),
    commits: r.agents.reduce((s, a) => s + a.commits.length, 0),
    added: r.agents.reduce((s, a) => s + a.added, 0),
    removed: r.agents.reduce((s, a) => s + a.removed, 0)
  }
  const maxDay = Math.max(0.0001, ...(r?.daily ?? []).map((d) => d.cost))
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal report" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ justifyContent: 'flex-start', gap: 12 }}>
          <h2 style={{ flex: 1 }}><Icon name="chart" size={16} /> {days === 7 ? 'Weekly' : `${days}-day`} report{r ? ` · ${r.project}` : ''}</h2>
          <div className="seg sm">
            {[7, 14, 30].map((d) => <button key={d} className={days === d ? 'on' : ''} style={{ width: 'auto', padding: '0 10px' }} onClick={() => setDays(d)}>{d} days</button>)}
          </div>
          <button className="btn ghost sm" disabled={!r} onClick={() => window.api.copyText(md).then(() => useStore.getState().toast('Copied as Markdown', 'success'))}><Icon name="copy" size={12} /> Copy</button>
        </div>
        {!r || !totals ? (
          <p className="muted">Collecting commits, cards and usage…</p>
        ) : (
          <div className="rep-body">
            <div className="stat-row">
              <div className="stat"><span>Commits</span><b>{totals.commits}</b><small>+{totals.added} / −{totals.removed} lines</small></div>
              <div className="stat"><span>Cards done</span><b>{r.cardsDone}</b><small>{r.cardsOpen} still open</small></div>
              <div className="stat"><span>Estimated cost</span><b>{fmtUsd(totals.cost)}</b><small>Claude Code agents</small></div>
              <div className="stat"><span>Workflow runs</span><b>{r.workflows}</b></div>
            </div>
            <div className="rep-days">
              {r.daily.map((d) => (
                <div key={d.day} className="rep-day" title={`${d.day}: ${fmtUsd(d.cost)}`}>
                  <i style={{ height: `${(d.cost / maxDay) * 100}%` }} />
                  <span>{new Date(d.day).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                </div>
              ))}
            </div>
            {r.agents.map((a) => (
              <section key={a.agentId} className="rep-agent" style={{ ['--agent' as string]: a.color }}>
                <header>
                  <Character head seed={a.agentId} color={a.color} status="idle" size={26} />
                  <b>{a.name}</b><span className="muted small">{a.role}</span>
                  <div className="spacer" />
                  <span className="chip">{a.commits.length} commits</span>
                  {a.added + a.removed > 0 && <span className="chip"><em className="plus">+{a.added}</em>&nbsp;<em className="minus">−{a.removed}</em></span>}
                  <span className="chip">{fmtUsd(a.cost)}</span>
                </header>
                {a.tasksDone.length > 0 && <ul className="rep-done">{a.tasksDone.map((t, i) => <li key={i}>✓ {t}</li>)}</ul>}
                {a.commits.length > 0 && <ul className="rep-commits">{a.commits.slice(0, 8).map((c) => <li key={c.hash}><code>{c.hash.slice(0, 7)}</code> {c.subject}</li>)}</ul>}
                {!a.commits.length && !a.tasksDone.length && <p className="muted small">No commits or finished cards in this period.</p>}
              </section>
            ))}
            {r.topFiles.length > 0 && (
              <section className="rep-agent">
                <header><b>Most changed files</b></header>
                <ul className="rep-commits">{r.topFiles.map((f) => <li key={f.file}><code>{f.n}×</code> {f.file}</li>)}</ul>
              </section>
            )}
          </div>
        )}
        <div className="modal-foot"><button className="btn ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}

function toMarkdown(r: WeeklyReport): string {
  const d = (ms: number): string => new Date(ms).toLocaleDateString()
  const lines = [`# ${r.project} – report ${d(r.from)} → ${d(r.to)}`, '']
  const cost = r.agents.reduce((s, a) => s + a.cost, 0)
  lines.push(`**${r.agents.reduce((s, a) => s + a.commits.length, 0)} commits · ${r.cardsDone} cards done · ${r.cardsOpen} open · ~$${cost.toFixed(2)}**`, '')
  for (const a of r.agents) {
    lines.push(`## ${a.name} (${a.role})`, `${a.commits.length} commits, +${a.added}/−${a.removed} lines, ~$${a.cost.toFixed(2)}`)
    for (const t of a.tasksDone) lines.push(`- ✓ ${t}`)
    for (const c of a.commits.slice(0, 10)) lines.push(`- \`${c.hash.slice(0, 7)}\` ${c.subject}`)
    lines.push('')
  }
  if (r.topFiles.length) lines.push('## Most changed files', ...r.topFiles.map((f) => `- ${f.file} (${f.n}×)`))
  return lines.join('\n')
}
