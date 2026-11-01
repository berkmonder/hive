/**
 * Sims-style office: agents walk between their desks and the lounge depending on status.
 *   working / waiting / error -> sit at their own desk
 *   done                      -> review room (sits at the meeting table)
 *   idle (stopped)            -> lounge: sofa, armchair, coffee bar
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Agent, AgentStatus } from '@shared/types'
import { useStore } from '../../store'
import { Character } from '../Character'
import { EmptyDesk, Walker, type Pose } from './Walker'
import { fmtUsd, useUsage } from '../UsageView'

const W = 1120
const COLS = 5
const DESK_W = 120
const DESK_DX = 200
const DESK_DY = 176
const DESK_X0 = 100
const DESK_Y0 = 190
const SPEED = 160 // logical px per second

type Spot = { x: number; y: number; pose: Pose }
type Target = { key: string; x: number; y: number; pose: Pose; seated: boolean }
type Actor = { x: number; y: number; path: [number, number][]; pose: Pose; seated: boolean; key: string; moving: boolean; facing: 1 | -1 }

const AT_DESK: AgentStatus[] = ['working', 'waiting', 'error']

/** Desk order: each team together (lead first), then everyone else. */
function deskOrder(agents: Agent[]): Agent[] {
  const ids = new Set(agents.map((a) => a.id))
  const out: Agent[] = []
  const walk = (a: Agent): void => {
    out.push(a)
    agents.filter((x) => x.parentId === a.id).forEach(walk)
  }
  agents.filter((a) => !a.parentId || !ids.has(a.parentId)).forEach(walk)
  return out
}

export function Office({ agents }: { agents: Agent[] }) {
  const runtimes = useStore((s) => s.runtimes)
  const lastLines = useStore((s) => s.lastLines)
  const focusAgent = useStore((s) => s.focusAgent)
  const openMenu = useStore((s) => s.openMenu)
  const setShowNewAgent = useStore((s) => s.setShowNewAgent)

  const ordered = useMemo(() => deskOrder(agents), [agents])
  const rows = Math.max(1, Math.ceil((ordered.length + 1) / COLS))
  const loungeTop = DESK_Y0 + rows * DESK_DY + 10
  const H = loungeTop + 310
  const corridorY = loungeTop - 2

  const desks = useMemo(
    () =>
      new Map(
        ordered.map((a, i) => {
          const x = DESK_X0 + (i % COLS) * DESK_DX
          const y = DESK_Y0 + Math.floor(i / COLS) * DESK_DY
          return [a.id, { x, y, chairX: x + DESK_W / 2, chairY: y + 104 }]
        })
      ),
    [ordered]
  )
  const freeDesk = { x: DESK_X0 + (ordered.length % COLS) * DESK_DX, y: DESK_Y0 + Math.floor(ordered.length / COLS) * DESK_DY }

  // lounge (idle) and review room (done) spots
  const L = loungeTop
  const door = { x: 34, y: L + 150 }
  const restSpots: Spot[] = [
    { x: 150, y: L + 206, pose: 'sleep' }, { x: 216, y: L + 206, pose: 'sleep' }, { x: 282, y: L + 206, pose: 'sleep' },
    { x: 92, y: L + 262, pose: 'sleep' }, { x: 420, y: L + 236, pose: 'sleep' },
    { x: 470, y: L + 150, pose: 'coffee' }, { x: 530, y: L + 154, pose: 'coffee' }, { x: 590, y: L + 150, pose: 'coffee' }
  ]
  const reviewSpots: Spot[] = [
    { x: 806, y: L + 166, pose: 'sit' }, { x: 868, y: L + 166, pose: 'sit' }, { x: 930, y: L + 166, pose: 'sit' }, { x: 992, y: L + 166, pose: 'sit' },
    { x: 1052, y: L + 250, pose: 'stand' }, { x: 742, y: L + 250, pose: 'stand' }
  ]
  const TABLE = { x: 770, y: L + 150, w: 260 }


  // ---------- where should everybody be? ----------
  const targets = useMemo(() => {
    const t = new Map<string, Target>()
    const taken = new Set<string>()
    const loungers = ordered.filter((a) => !AT_DESK.includes(runtimes[a.id]?.status ?? 'idle'))
    let overflow = 0
    loungers.forEach((a, i) => {
      const st = runtimes[a.id]?.status ?? 'idle'
      const pool = st === 'done' ? reviewSpots : restSpots
      const start = st === 'done' ? i % pool.length : i % pool.length
      let spot: Spot | null = null
      for (let k = 0; k < pool.length; k++) {
        const s = pool[(start + k) % pool.length]
        const key = `${Math.round(s.x)}:${Math.round(s.y)}`
        if (!taken.has(key)) {
          taken.add(key)
          spot = s
          break
        }
      }
      if (!spot) spot = { x: 470 + (overflow++ % 4) * 46, y: L + 262, pose: 'stand' }
      t.set(a.id, { key: `l:${spot.x}:${spot.y}:${spot.pose}`, x: spot.x, y: spot.y, pose: spot.pose, seated: false })
    })
    for (const a of ordered) {
      if (t.has(a.id)) continue
      const d = desks.get(a.id)!
      t.set(a.id, { key: `d:${a.id}:${d.x}:${d.y}`, x: d.chairX, y: d.chairY, pose: 'stand', seated: true })
    }
    return t
  }, [ordered, runtimes, desks, L]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- simulation ----------
  const actors = useRef(new Map<string, Actor>())
  const mounted = useRef(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const A = actors.current
    for (const id of [...A.keys()]) if (!targets.has(id)) A.delete(id)
    for (const [id, tg] of targets) {
      let a = A.get(id)
      if (!a) {
        // first render: everyone is already in place; later arrivals come through the door
        a = mounted.current
          ? { x: door.x, y: door.y, path: [], pose: 'walk', seated: false, key: '', moving: true, facing: 1 }
          : { x: tg.x, y: tg.y, path: [], pose: tg.pose, seated: tg.seated, key: tg.key, moving: false, facing: 1 }
        A.set(id, a)
        if (!mounted.current) continue
      }
      if (a.key === tg.key) continue
      a.key = tg.key
      const fromDesk = a.seated || a.y < corridorY - 20
      const toDesk = tg.seated
      const path: [number, number][] = []
      if (fromDesk || toDesk) {
        path.push([a.x, corridorY], [tg.x, corridorY])
      }
      path.push([tg.x, tg.y])
      a.path = path
      a.seated = false
      a.moving = true
      a.pose = 'walk'
    }
    mounted.current = true
    setTick((t) => t + 1)
  }, [targets, corridorY, door.x, door.y])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const step = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      let any = false
      for (const [id, a] of actors.current) {
        if (!a.moving) continue
        any = true
        let budget = SPEED * dt
        while (budget > 0 && a.path.length) {
          const [tx, ty] = a.path[0]
          const dx = tx - a.x
          const dy = ty - a.y
          const dist = Math.hypot(dx, dy)
          if (Math.abs(dx) > 1) a.facing = dx > 0 ? 1 : -1
          if (dist <= budget) {
            a.x = tx
            a.y = ty
            a.path.shift()
            budget -= dist
          } else {
            a.x += (dx / dist) * budget
            a.y += (dy / dist) * budget
            budget = 0
          }
        }
        if (!a.path.length) {
          const tg = targets.get(id)
          a.moving = false
          a.pose = tg?.pose ?? 'stand'
          a.seated = !!tg?.seated
        }
      }
      if (any) setTick((t) => t + 1)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [targets])

  // ---------- fit to width ----------
  const wrap = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = wrap.current!
    const ro = new ResizeObserver(() => setScale(Math.min(1.25, Math.max(0.45, (el.clientWidth - 24) / W))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const counts = useMemo(() => {
    const c = { working: 0, waiting: 0, done: 0, idle: 0, error: 0 }
    for (const a of agents) c[runtimes[a.id]?.status ?? 'idle']++
    return c
  }, [agents, runtimes])

  const { report } = useUsage(agents[0]?.projectId, 30000)
  const todayCost = useMemo(() => {
    if (!report) return undefined
    const d = new Date()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const v = report.agents.reduce((s, u) => s + (u.days[key] ?? 0), 0)
    return v > 0 ? fmtUsd(v) : undefined
  }, [report])

  const handlers = (a: Agent) => ({
    onClick: () => focusAgent(a.id),
    onContextMenu: (e: React.MouseEvent) => openMenu(e, a.id),
    title: `${a.name} · ${a.role} — ${runtimes[a.id]?.status === 'working' ? lastLines[a.id] || 'working' : runtimes[a.id]?.status ?? 'idle'}`
  })

  const leadColor = (a: Agent): string | null => {
    let cur: Agent | undefined = a
    while (cur?.parentId) cur = agents.find((x) => x.id === cur!.parentId)
    return cur && cur !== a ? cur.color : agents.some((x) => x.parentId === a.id) ? a.color : null
  }

  return (
    <div className="office-wrap" ref={wrap}>
      <div className="office-sizer" style={{ width: W * scale, height: H * scale }}>
      <div className="office" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <OfficeBackground width={W} height={H} loungeTop={L} door={door} />

        {/* desks */}
        {ordered.map((a) => {
          const d = desks.get(a.id)!
          const act = actors.current.get(a.id)
          const st = runtimes[a.id]?.status ?? 'idle'
          const seated = !!act?.seated && !act.moving
          const mat = leadColor(a)
          return (
            <div key={a.id} className={`o-desk ${seated ? 'occupied' : ''} status-${st}`} style={{ left: d.x, top: d.y, zIndex: d.y + 60 }} {...handlers(a)}>
              {mat && <div className="o-mat" style={{ ['--agent' as string]: mat }} />}
              {seated ? <Character office seed={a.id} color={a.color} status={st} size={DESK_W} /> : <EmptyDesk office seed={a.id} color={a.color} size={DESK_W} />}
              <div className="o-plate" style={{ ['--agent' as string]: a.color }}>
                <i className="dot" />
                {a.name}
              </div>
              {seated && st === 'working' && lastLines[a.id] && <div className="o-thought">{lastLines[a.id]}</div>}
            </div>
          )
        })}
        <button className="o-desk o-free" style={{ left: freeDesk.x, top: freeDesk.y }} onClick={() => setShowNewAgent(true)} title="Hire a new agent">
          <EmptyDesk office seed="free" color="#888" size={DESK_W} />
          <div className="o-plate">+ New agent</div>
        </button>

        {/* review table front: drawn above the people sitting behind it */}
        <svg className="o-table" style={{ left: TABLE.x, top: TABLE.y - 8, zIndex: TABLE.y + 140 }} width={TABLE.w} height="58" viewBox={`0 0 ${TABLE.w} 58`} aria-hidden>
          <rect x="0" y="6" width={TABLE.w} height="12" rx="4" fill="#e7dcc8" />
          <rect x="0" y="16" width={TABLE.w} height="3" fill="#bfae8f" />
          <rect x="16" y="19" width={TABLE.w - 32} height="22" fill="#2a2f3b" />
          <rect x="22" y="19" width="4" height="34" fill="#8a93a6" />
          <rect x={TABLE.w - 26} y="19" width="4" height="34" fill="#8a93a6" />
          {[50, 112, 174].map((x) => <rect key={x} x={x} y="1" width="22" height="6" rx="1.5" fill="#cbd5e1" opacity=".8" />)}
        </svg>

        <WallScreen counts={counts} today={todayCost} />

        {/* people on the move / in the lounge */}
        {ordered.map((a) => {
          const act = actors.current.get(a.id)
          if (!act || (act.seated && !act.moving)) return null
          const st = runtimes[a.id]?.status ?? 'idle'
          const pose: Pose = act.moving ? 'walk' : act.pose
          return (
            <div key={a.id} className={`o-person ${act.moving ? 'moving' : ''}`}
              style={{ left: act.x - 35, top: act.y - 98, zIndex: Math.round(act.y) + 100, ['--face' as string]: act.facing }} {...handlers(a)}>
              <div className="o-sprite"><Walker seed={a.id} color={a.color} pose={pose} status={st} /></div>
              <div className="o-name">{a.name}</div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

function WallScreen({ counts, today }: { counts: Record<AgentStatus, number>; today?: string }) {
  const items: [AgentStatus, string][] = [['working', 'Working'], ['waiting', 'Needs you'], ['done', 'To review'], ['idle', 'On break']]
  return (
    <div className="o-screen">
      <div className="o-screen-title">
        <span className="live" /> Team status
        {today && <span className="o-today">{today} today</span>}
      </div>
      <div className="o-screen-grid">
        {items.map(([k, l]) => (
          <div key={k} className={`st-${k}`}>
            <b>{counts[k] + (k === 'waiting' ? counts.error : 0)}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Walls, floors, lighting and furniture as one SVG. */
function OfficeBackground({ width: w, height: h, loungeTop: L, door }: { width: number; height: number; loungeTop: number; door: { x: number; y: number } }) {
  const wallH = 150
  const rows: number[] = []
  for (let y = 190; y < L - 60; y += 176) rows.push(y)
  return (
    <svg className="o-bg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <linearGradient id="o-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f1a2e" />
          <stop offset=".55" stopColor="#2b2f5c" />
          <stop offset=".85" stopColor="#7a4b62" />
          <stop offset="1" stopColor="#c27a5a" />
        </linearGradient>
        <linearGradient id="o-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1d25" />
          <stop offset="1" stopColor="#20242e" />
        </linearGradient>
        <pattern id="o-carpet" width="48" height="48" patternUnits="userSpaceOnUse">
          <rect width="48" height="48" fill="#1b1f28" />
          <rect width="24" height="24" fill="#1d212b" />
          <rect x="24" y="24" width="24" height="24" fill="#1d212b" />
        </pattern>
        <pattern id="o-wood" width="160" height="22" patternUnits="userSpaceOnUse">
          <rect width="160" height="22" fill="#3a2f27" />
          <rect width="160" height="11" fill="#3d3229" />
          <path d="M0 21.5h160M0 10.5h160M70 0v11M130 11v11M30 11v11" stroke="#2f2620" strokeWidth="1" />
        </pattern>
        <radialGradient id="o-light" cx=".5" cy="0" r="1">
          <stop offset="0" stopColor="#fff3d6" stopOpacity=".16" />
          <stop offset="1" stopColor="#fff3d6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="o-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fc6ff" stopOpacity=".10" />
          <stop offset=".5" stopColor="#9fc6ff" stopOpacity=".04" />
          <stop offset="1" stopColor="#9fc6ff" stopOpacity=".12" />
        </linearGradient>
      </defs>

      {/* ---- back wall with floor-to-ceiling windows ---- */}
      <rect width={w} height={wallH} fill="url(#o-wall)" />
      {[40, 250, 700, 910].map((x) => (
        <g key={x}>
          <rect x={x} y="16" width="170" height="112" fill="url(#o-sky)" />
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x={x + 4 + i * 19} y={78 - ((i * 37) % 5) * 9} width="15" height={50 + ((i * 37) % 5) * 9} fill="#0b1220" opacity=".8" />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <rect key={i} x={x + 8 + ((i * 47) % 160)} y={90 + ((i * 29) % 30)} width="2.5" height="2.5" fill="#fcd34d" opacity=".55" />
          ))}
          <rect x={x} y="16" width="170" height="112" fill="none" stroke="#2c3240" strokeWidth="5" />
          <path d={`M${x + 85} 16v112`} stroke="#2c3240" strokeWidth="3" />
        </g>
      ))}
      {/* brand wall between windows */}
      <rect x="450" y="16" width="220" height="112" rx="4" fill="#161920" />
      <rect y={wallH - 8} width={w} height="8" fill="#2a2f3b" />

      {/* ---- open space (carpet) ---- */}
      <rect y={wallH} width={w} height={L - wallH} fill="url(#o-carpet)" />
      {rows.map((y) => (
        <g key={y}>
          {[200, 400, 600, 800, 1000].map((x) => (
            <g key={x}>
              <line x1={x - 40} y1={wallH} x2={x - 40} y2={y - 26} stroke="#2b303c" strokeWidth="1" opacity={y === rows[0] ? 1 : 0} />
            </g>
          ))}
        </g>
      ))}
      <text x="24" y={wallH + 26} className="o-zone">OPEN SPACE</text>

      {/* ---- lounge (wood) ---- */}
      <rect y={L} width={680} height={h - L} fill="url(#o-wood)" />
      <rect y={L - 4} width={w} height="6" fill="#2a2f3b" />
      <text x="70" y={L + 26} className="o-zone">LOUNGE</text>
      {/* rug, sofa, coffee table, lamp */}
      <rect x="70" y={L + 170} width="300" height="110" rx="10" fill="#2c3346" opacity=".9" />
      <g transform={`translate(104 ${L + 150})`}>
        <rect x="0" y="0" width="230" height="40" rx="10" fill="#4a5164" />
        <rect x="-10" y="28" width="250" height="32" rx="10" fill="#5a6277" />
        <rect x="-16" y="16" width="20" height="46" rx="8" fill="#4a5164" />
        <rect x="236" y="16" width="20" height="46" rx="8" fill="#4a5164" />
        <rect x="18" y="8" width="26" height="20" rx="5" fill="color-mix(in srgb, var(--accent) 70%, #fff)" opacity=".8" />
      </g>
      <rect x="160" y={L + 236} width="130" height="10" rx="5" fill="#d8c6a4" />
      <rect x="166" y={L + 246} width="4" height="16" fill="#8a93a6" /><rect x="280" y={L + 246} width="4" height="16" fill="#8a93a6" />
      <g transform={`translate(40 ${L + 110})`}>
        <path d="M0 0l14 0-4 12h-6z" fill="#e5e7eb" />
        <rect x="6" y="12" width="2" height="88" fill="#8a93a6" />
        <ellipse cx="7" cy="100" rx="10" ry="3" fill="#8a93a6" />
        <ellipse cx="7" cy="40" rx="40" ry="60" fill="url(#o-light)" />
      </g>
      {/* armchair */}
      <g transform={`translate(392 ${L + 186})`}>
        <rect x="0" y="0" width="56" height="34" rx="9" fill="#4a5164" />
        <rect x="-6" y="22" width="68" height="28" rx="9" fill="#5a6277" />
      </g>
      {/* coffee bar */}
      <g transform={`translate(440 ${L + 40})`}>
        <rect x="0" y="0" width="200" height="56" rx="3" fill="#20242e" stroke="#2c3240" />
        <rect x="14" y="10" width="38" height="36" rx="4" fill="#9aa3b5" />
        <rect x="20" y="16" width="26" height="10" rx="2" fill="#0f172a" />
        <circle cx="33" cy="36" r="3" fill="var(--accent)" />
        {[70, 92, 114].map((x) => <rect key={x} x={x} y="30" width="12" height="16" rx="2" fill="#f1f5f9" />)}
        <rect x="140" y="12" width="46" height="34" rx="3" fill="#1a1f29" />
        <text x="163" y="33" textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="Menlo, monospace">MENU</text>
        <rect x="-6" y="56" width="212" height="8" rx="2" fill="#d8c6a4" />
        <rect x="-6" y="64" width="212" height="22" fill="#2a2f3b" />
      </g>
      {/* plants */}
      {[[640, L + 120], [658, L + 260], [24, L + 266]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M-12 12h24l-3 22h-18z" fill="#e5e7eb" />
          <path d="M0 12q-20-14-10-36 6 16 10 36q2-26 18-32-4 20-18 32q-6-14-20-16 12 4 20 16" fill="#34d399" />
        </g>
      ))}

      {/* ---- review room (glass meeting room) ---- */}
      <rect x="690" y={L} width={w - 690} height={h - L} fill="#1f2430" />
      <rect x="690" y={L} width={w - 690} height="110" fill="#1a1e27" />
      <text x="712" y={L + 26} className="o-zone">REVIEW ROOM</text>
      {/* wall display with a diff */}
      <g transform={`translate(830 ${L + 30})`}>
        <rect width="150" height="78" rx="4" fill="#0f1218" stroke="#2c3240" strokeWidth="3" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x="10" y={10 + i * 10} width={[90, 70, 110, 60, 100, 80][i]} height="5" rx="2"
            fill={i === 2 || i === 4 ? '#34d399' : i === 3 ? '#f87171' : '#475069'} opacity={i === 2 || i === 3 || i === 4 ? 0.85 : 0.7} />
        ))}
      </g>
      {/* chairs behind the table */}
      {[806, 868, 930, 992].map((x) => (
        <g key={x} transform={`translate(${x - 22} ${L + 92})`}>
          <rect width="44" height="54" rx="10" fill="#1c212c" />
          <rect x="4" y="4" width="36" height="46" rx="8" fill="#262c39" />
        </g>
      ))}
      {/* glass walls */}
      <rect x="686" y={L} width="6" height={h - L} fill="#3a4253" opacity=".8" />
      <rect x="692" y={L + 110} width={w - 692} height={h - L - 110} fill="url(#o-glass)" />
      <rect x="692" y={L + 206} width={w - 692} height="10" fill="#cbd5e1" opacity=".07" />
      {[0, 1, 2, 3].map((i) => <line key={i} x1={720 + i * 110} y1={L + 112} x2={760 + i * 110} y2={h} stroke="#cfe0ff" strokeOpacity=".05" strokeWidth="18" />)}

      {/* entrance */}
      <g transform={`translate(${door.x - 26} ${door.y - 100})`}>
        <rect width="8" height="104" fill="#2c3240" />
        <rect x="8" width="44" height="104" fill="url(#o-glass)" stroke="#3a4253" strokeWidth="2" />
        <rect x="42" y="46" width="3" height="16" rx="1.5" fill="#cbd5e1" />
      </g>
    </svg>
  )
}
