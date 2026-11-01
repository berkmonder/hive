import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentUsage, UsageReport } from '@shared/usage'
import { useStore } from '../store'
import { Character } from './Character'
import { Icon } from './common'

export const fmtTok = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${n}`)
export const fmtUsd = (n: number): string => (n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(3)}` : '$0')
const fmtDur = (ms: number): string => {
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const lastDays = (n: number): string[] => Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() - (n - 1 - i) * 86400000)))

/** Shared poller so several widgets don't each hammer the main process. */
export function useUsage(projectId: string | null | undefined, everyMs = 20000): { report: UsageReport | null; refresh: () => void } {
  const [report, setReport] = useState<UsageReport | null>(null)
  const refresh = useCallback(() => {
    window.api.usage(projectId ?? undefined).then(setReport).catch(() => undefined)
  }, [projectId])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, everyMs)
    return () => clearInterval(t)
  }, [refresh, everyMs])
  return { report, refresh }
}

export function UsageView() {
  const { app, selectedProjectId } = useStore()
  const [scope, setScope] = useState<'project' | 'all'>('project')
  const { report, refresh } = useUsage(scope === 'project' ? selectedProjectId : null, 15000)
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null)
  const days = useMemo(() => lastDays(14), [])
  const today = days[days.length - 1]

  if (!report) return <div className="welcome muted">Reading Claude Code session logs…</div>

  const agents = report.agents
    .map((u) => ({ u, a: app.agents.find((x) => x.id === u.agentId)! }))
    .filter((x) => x.a)
    .sort((p, q) => q.u.cost - p.u.cost || q.u.workMs - p.u.workMs)
  const total = agents.reduce((s, x) => s + x.u.cost, 0)
  const sumDays = (pick: (d: string) => boolean): number => agents.reduce((s, x) => s + Object.entries(x.u.days).filter(([d]) => pick(d)).reduce((t, [, v]) => t + v, 0), 0)
  const todayCost = sumDays((d) => d === today)
  const weekCost = sumDays((d) => d >= days[days.length - 7])
  const tokens = agents.reduce((s, x) => s + x.u.input + x.u.output + x.u.cacheWrite + x.u.cacheRead, 0)
  const work = agents.reduce((s, x) => s + x.u.workMs, 0)
  const daily = days.map((d) => ({ d, v: agents.reduce((s, x) => s + (x.u.days[d] ?? 0), 0) }))
  const maxDay = Math.max(...daily.map((x) => x.v), 0.0001)
  const maxAgent = Math.max(...agents.map((x) => x.u.cost), 0.0001)
  const noData = agents.every((x) => x.u.sessions === 0)

  return (
    <div className="usage">
      <header className="usage-head">
        <h1><Icon name="chart" /> Usage &amp; cost</h1>
        <div className="seg sm">
          <button className={scope === 'project' ? 'on' : ''} onClick={() => setScope('project')} style={{ width: 'auto', padding: '0 12px' }}>This project</button>
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')} style={{ width: 'auto', padding: '0 12px' }}>All projects</button>
        </div>
        <div className="spacer" />
        <span className="muted small">Updated {new Date(report.generatedAt).toLocaleTimeString()}</span>
        <button className="icon-btn" title="Refresh" onClick={refresh}><Icon name="refresh" size={14} /></button>
      </header>

      <div className="stat-row">
        <Stat label="Today" value={fmtUsd(todayCost)} />
        <Stat label="Last 7 days" value={fmtUsd(weekCost)} />
        <Stat label="All time (agents)" value={fmtUsd(total)} sub={`${fmtTok(tokens)} tokens`} />
        <Stat label="Time working" value={fmtDur(work)} sub={`${agents.filter((x) => x.u.workMs > 0).length} agents`} />
        <Stat label="All Claude Code in these folders" value={fmtUsd(report.folder.cost)} sub={`${report.folder.sessions} sessions, incl. outside Hive`} />
      </div>

      <section className="usage-card">
        <div className="uc-head">
          <b>Cost per day</b>
          <span className="muted small">last 14 days · agents in Hive</span>
        </div>
        <div className="daychart" onMouseLeave={() => setHover(null)}>
          {daily.map(({ d, v }) => (
            <div key={d} className="dc-col"
              onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, text: `${new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtUsd(v)}` })}>
              <div className="dc-bar" style={{ height: `${Math.max(v > 0 ? 3 : 0, (v / maxDay) * 100)}%` }} />
              <span className={`dc-label ${d === today ? 'today' : ''}`}>{d === today ? 'Today' : new Date(d).getDate()}</span>
            </div>
          ))}
          <div className="dc-max muted small">{fmtUsd(maxDay)}</div>
        </div>
      </section>

      <section className="usage-card">
        <div className="uc-head">
          <b>By agent</b>
          <span className="muted small">exact, from each agent's own Claude Code sessions</span>
        </div>
        <table className="usage-table">
          <thead>
            <tr>
              <th>Agent</th><th>Sessions</th><th>Input</th><th>Output</th><th>Cache read</th><th>Cache write</th><th>Working</th><th className="num">Cost</th><th className="bar-col" />
            </tr>
          </thead>
          <tbody>
            {agents.map(({ a, u }) => (
              <Row key={a.id} name={a.name} role={a.role} color={a.color} id={a.id} u={u} max={maxAgent}
                onHover={(e) => setHover({ x: e.clientX, y: e.clientY, text: `${a.name} · ${fmtUsd(u.cost)} · ${u.models.join(', ') || 'no Claude sessions yet'}` })} />
            ))}
          </tbody>
        </table>
        {noData && (
          <p className="usage-note">
            <Icon name="book" size={13} /> No Claude Code sessions recorded yet. Usage is tracked from the next time an agent starts
            (Hive learns each session from Claude Code's hooks). The folder total above already includes older sessions.
          </p>
        )}
      </section>

      <p className="usage-foot muted small">
        Costs are estimates at public API list prices per model (input, output, cache write, cache read). On a Claude Pro/Max
        subscription this is the API-equivalent value, not what you're billed. Only Claude Code agents report usage.
      </p>
      {hover && <div className="chart-tip" style={{ left: hover.x + 12, top: hover.y - 34 }}>{hover.text}</div>}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  )
}

function Row({ id, name, role, color, u, max, onHover }: { id: string; name: string; role: string; color: string; u: AgentUsage; max: number; onHover: (e: React.MouseEvent) => void }) {
  return (
    <tr onClick={() => useStore.getState().focusAgent(id)}>
      <td>
        <div className="ut-agent">
          <Character head seed={id} color={color} status="idle" size={26} />
          <div><b>{name}</b><small>{role}</small></div>
        </div>
      </td>
      <td>{u.sessions}</td>
      <td>{fmtTok(u.input)}</td>
      <td>{fmtTok(u.output)}</td>
      <td>{fmtTok(u.cacheRead)}</td>
      <td>{fmtTok(u.cacheWrite)}</td>
      <td>{fmtDur(u.workMs)}</td>
      <td className="num"><b>{fmtUsd(u.cost)}</b></td>
      <td className="bar-col" onMouseMove={onHover}>
        <div className="ut-bar"><i style={{ width: `${(u.cost / max) * 100}%` }} /></div>
      </td>
    </tr>
  )
}
