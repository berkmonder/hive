/**
 * Sims-style office: agents walk between their desks and the lounge depending on status.
 *   working / waiting / error -> sit at their own desk
 *   done                      -> review room (sits at the meeting table)
 *   idle (stopped)            -> lounge: sofa, armchair, coffee bar
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Agent, AgentStatus } from '@shared/types'
import { useStore } from '../../store'
import { type Pose } from './Walker'
import { PixelBubble, PixelDesk, PixelPerson, PixelRoomBg, PixelTable, type PxPose } from './pixel'
import { fmtUsd, useUsage } from '../UsageView'

const W = 1120
const COLS = 5
const DESK_W = 120
const DESK_DX = 200
const DESK_DY = 176
const DESK_X0 = 100
const DESK_Y0 = 192
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
  const emotes = useStore((s) => s.emotes)
  const testing = useStore((s) => s.testing)
  const focusAgent = useStore((s) => s.focusAgent)
  const openMenu = useStore((s) => s.openMenu)
  const setShowNewAgent = useStore((s) => s.setShowNewAgent)

  const ordered = useMemo(() => deskOrder(agents), [agents])
  const rows = Math.max(1, Math.ceil((ordered.length + 1) / COLS))
  const loungeTop = DESK_Y0 + rows * DESK_DY + 8
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
    // while its tests run, an agent goes for a coffee
    const brewing = ordered.filter((a) => testing[a.id])
    brewing.forEach((a, i) => {
      const s = restSpots.filter((x) => x.pose === 'coffee')[i % 3]
      taken.add(`${Math.round(s.x)}:${Math.round(s.y)}`)
      t.set(a.id, { key: `c:${s.x}:${s.y}`, x: s.x, y: s.y, pose: 'coffee', seated: false })
    })
    const loungers = ordered.filter((a) => !t.has(a.id) && !AT_DESK.includes(runtimes[a.id]?.status ?? 'idle'))
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
  }, [ordered, runtimes, desks, L, testing]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <PixelRoomBg w={W} h={H} L={L} door={door} hour={new Date().getHours()} />

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
              <PixelDesk seed={a.id} color={a.color} status={st} occupied={seated} />
              {seated && st !== 'working' && !emotes[a.id] && <div className="o-bubble"><PixelBubble kind={st} /></div>}
              <div className="o-plate" style={{ ['--agent' as string]: a.color }}>
                <i className="dot" />
                {a.name}
              </div>
              {seated && st === 'working' && lastLines[a.id] && !emotes[a.id] && <div className="o-thought">{lastLines[a.id]}</div>}
              {seated && emotes[a.id] && <Emote kind={emotes[a.id].kind} />}
            </div>
          )
        })}
        <button className="o-desk o-free" style={{ left: freeDesk.x, top: freeDesk.y }} onClick={() => setShowNewAgent(true)} title="Hire a new agent">
          <PixelDesk seed="free" color="#6b7280" status="idle" occupied={false} />
          <div className="o-plate">+ New agent</div>
        </button>

        {/* review table front: drawn above the people sitting behind it */}
        <div className="o-table" style={{ left: TABLE.x, top: TABLE.y - 8, zIndex: TABLE.y + 140 }}><PixelTable w={TABLE.w} /></div>

        <WallScreen counts={counts} today={todayCost} />
        {Object.values(emotes).some((e) => e.kind === 'party') && <Confetti />}

        {/* people on the move / in the lounge */}
        {ordered.map((a) => {
          const act = actors.current.get(a.id)
          if (!act || (act.seated && !act.moving)) return null
          const st = runtimes[a.id]?.status ?? 'idle'
          const pose: Pose = act.moving ? 'walk' : act.pose
          return (
            <div key={a.id} className={`o-person ${act.moving ? 'moving' : ''}`}
              style={{ left: act.x - 32, top: act.y - 96, zIndex: Math.round(act.y) + 100, ['--face' as string]: act.facing }} {...handlers(a)}>
              <div className="o-sprite"><PixelPerson seed={a.id} color={a.color} pose={PX_POSE[pose]} /></div>
              {!act.moving && pose === 'sleep' && <div className="o-zzz">z<span>z</span><span>z</span></div>}
              {testing[a.id] && !act.moving && <div className="o-emote coffee">☕ tests running…</div>}
              {emotes[a.id] && !testing[a.id] && <Emote kind={emotes[a.id].kind} />}
              <div className="o-name">{a.name}</div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

const PX_POSE: Record<Pose, PxPose> = { walk: 'walk', stand: 'stand', wave: 'cheer', cheer: 'cheer', coffee: 'coffee', sit: 'sit', sleep: 'sleep' }

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

const EMOTE: Record<string, string> = { party: '🎉', thumbs: '👍 tests pass', facepalm: '🤦 tests failed', idea: '💡 plan ready' }
function Emote({ kind }: { kind: string }) {
  return <div className={`o-emote ${kind}`}>{EMOTE[kind] ?? kind}</div>
}

function Confetti() {
  const bits = useMemo(
    () => Array.from({ length: 70 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 1.2, dur: 2.4 + Math.random() * 1.8, hue: (i * 47) % 360, rot: Math.random() * 360 })),
    []
  )
  return (
    <div className="o-confetti" aria-hidden>
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: `hsl(${b.hue} 85% 62%)`, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  )
}
