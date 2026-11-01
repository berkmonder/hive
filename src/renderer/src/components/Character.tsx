import type { AgentStatus } from '@shared/types'
import { Divider, ProChair, ProDesk } from './office/furniture'

/**
 * A little person sitting behind a laptop. Look is derived from a seed (agent id),
 * shirt uses the agent color, pose/animation follows the agent status:
 *   working → typing   waiting → hand raised + "!"   done → arms up + ✓
 *   idle → sleeping zZ   error → worried + "!"
 */

const SKIN = ['#f5d0b5', '#e8b48f', '#c98e66', '#9a6545', '#6e4630']
const HAIR = ['#2b2118', '#5a3825', '#a0522d', '#d9a441', '#1f2937', '#9ca3af', '#7c3aed', '#e11d48']
const STYLES = ['short', 'long', 'bun', 'spiky', 'cap', 'curly'] as const

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function looksFor(seed: string) {
  const h = hash(seed)
  return {
    skin: SKIN[h % SKIN.length],
    hair: HAIR[(h >>> 3) % HAIR.length],
    style: STYLES[(h >>> 7) % STYLES.length],
    glasses: ((h >>> 11) & 3) === 0,
    mug: ((h >>> 13) & 1) === 1,
    plant: ((h >>> 14) & 3) === 1
  }
}

export function Hair({ style, color, agent }: { style: (typeof STYLES)[number]; color: string; agent: string }) {
  switch (style) {
    case 'short':
      return <path d="M47 38c0-10 6-15 13-15s13 5 13 15c-3-5-8-7-13-7s-10 2-13 7z" fill={color} />
    case 'long':
      return <path d="M46 40c-1-11 6-17 14-17s15 6 14 17l1 16h-5l-1-15c-2-4-6-8-9-8s-7 4-9 8l-1 15h-5z" fill={color} />
    case 'bun':
      return (
        <g fill={color}>
          <circle cx="60" cy="21" r="6" />
          <path d="M47 38c0-10 6-15 13-15s13 5 13 15c-3-6-8-8-13-8s-10 2-13 8z" />
        </g>
      )
    case 'spiky':
      return <path d="M47 37l1-9 4 3 2-8 4 5 3-7 3 6 4-5 2 8 4-2 0 9c-4-4-8-6-13-6s-10 2-14 6z" fill={color} />
    case 'cap':
      return (
        <g>
          <path d="M47 36c0-9 6-14 13-14s13 5 13 14z" fill={agent} />
          <path d="M60 34h20c0 3-2 4-5 4H60z" fill={agent} opacity=".8" />
        </g>
      )
    case 'curly':
      return (
        <g fill={color}>
          {[[49, 31], [54, 26], [60, 24], [66, 26], [71, 31], [47, 37], [73, 37]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" />
          ))}
        </g>
      )
  }
}

interface Props {
  seed: string
  color: string
  status: AgentStatus
  size?: number
  /** head-only avatar */
  head?: boolean
  /** draw modern office furniture (ergonomic chair, monitor) instead of the cartoon desk */
  office?: boolean
}

export function Character({ seed, color, status, size = 140, head, office }: Props) {
  const l = looksFor(seed)
  const sleeping = status === 'idle'
  const eyes = sleeping ? (
    <g stroke="#1f2937" strokeWidth="1.6" strokeLinecap="round">
      <path d="M53 41q2 2 4 0M63 41q2 2 4 0" fill="none" />
    </g>
  ) : (
    <g className="eyes" fill="#1f2937">
      <circle cx="55" cy="40" r="1.8" />
      <circle cx="65" cy="40" r="1.8" />
    </g>
  )
  const mouth =
    status === 'done' ? <path d="M55 46q5 5 10 0" stroke="#7f1d1d" strokeWidth="1.6" fill="#fff" />
    : status === 'error' ? <path d="M56 48q4-3 8 0" stroke="#1f2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    : status === 'waiting' ? <circle cx="60" cy="47" r="1.8" fill="#7f1d1d" />
    : <path d="M56 46q4 2 8 0" stroke="#1f2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />

  const face = (
    <g className="ch-head">
      {l.style === 'long' && <path d="M46 40l-1 16h30l-1-16z" fill={l.hair} opacity=".9" />}
      <rect x="57" y="48" width="6" height="7" fill={l.skin} />
      <circle cx="60" cy="38" r="13" fill={l.skin} />
      <circle cx="47.5" cy="39" r="2.5" fill={l.skin} />
      <circle cx="72.5" cy="39" r="2.5" fill={l.skin} />
      <Hair style={l.style} color={l.hair} agent={color} />
      {eyes}
      {l.glasses && !sleeping && (
        <g stroke="#111827" strokeWidth="1.2" fill="rgba(255,255,255,.15)">
          <circle cx="55" cy="40" r="4" />
          <circle cx="65" cy="40" r="4" />
          <path d="M59 40h2" />
        </g>
      )}
      <circle cx="51" cy="45" r="2" fill="#f43f5e" opacity=".25" />
      <circle cx="69" cy="45" r="2" fill="#f43f5e" opacity=".25" />
      {mouth}
    </g>
  )

  if (head) {
    return (
      <svg className={`character head-only st-${status}`} width={size} height={size} viewBox="42 18 36 36" aria-hidden>
        <rect x="42" y="18" width="36" height="36" rx="9" fill={`color-mix(in srgb, ${color} 30%, #1b2030)`} />
        {face}
      </svg>
    )
  }

  const arm = (side: 'l' | 'r') => {
    const x = side === 'l' ? 45 : 75
    const hx = side === 'l' ? 41 : 79
    return (
      <g className={`arm arm-${side}`} style={{ transformOrigin: `${x}px 62px` }}>
        <path d={`M${x} 62 L${hx} 76 L${side === 'l' ? 47 : 73} 84`} stroke={color} strokeWidth="7"
          strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx={side === 'l' ? 47 : 73} cy="84" r="3.6" fill={l.skin} />
      </g>
    )
  }

  return (
    <svg className={`character st-${status}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      {office ? (
        <>
          <Divider accent={color} />
          <ProChair />
        </>
      ) : (
        <>
          <rect x="40" y="50" width="40" height="40" rx="8" fill="#2a3142" />
          <rect x="57" y="96" width="6" height="12" fill="#2a3142" />
          <ellipse cx="60" cy="112" rx="22" ry="3" fill="#000" opacity=".25" />
        </>
      )}

      <g className="ch-body">
        {/* torso */}
        <path d="M44 66c0-7 7-11 16-11s16 4 16 11v24H44z" fill={color} />
        <path d="M55 56l5 6 5-6" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1.5" />
        {face}
        {arm('l')}
        {arm('r')}
      </g>

      {office && <ProDesk status={status} accent={color} mug={l.mug} plant={l.plant} occupied />}
      {!office && <>
      <rect x="6" y="88" width="108" height="7" rx="2" fill="#8b6b4a" />
      <rect x="10" y="95" width="5" height="17" fill="#6b5138" />
      <rect x="105" y="95" width="5" height="17" fill="#6b5138" />
      <path d="M40 70h40l3 18H37z" fill="#c7cbd6" />
      <path d="M41 71h38l2.6 16H38.4z" fill="#aeb4c2" />
      <circle className="logo" cx="60" cy="79" r="3" fill={color} />
      {l.mug && (
        <g>
          <rect x="89" y="79" width="9" height="9" rx="2" fill="#f8fafc" />
          <path d="M98 81q4 0 4 3t-4 3" stroke="#f8fafc" strokeWidth="1.6" fill="none" />
          {status === 'working' && <path className="steam" d="M92 76q-2-3 0-6M95 76q2-3 0-6" stroke="#cbd5e1" strokeWidth="1" fill="none" />}
        </g>
      )}
      {l.plant && (
        <g>
          <rect x="16" y="80" width="9" height="8" rx="1.5" fill="#b45309" />
          <path d="M20 80q-6-8-2-12 2 6 2 12q1-9 6-11-2 7-6 11" fill="#22c55e" />
        </g>
      )}
      </>}

      {/* status bubbles */}
      {status === 'waiting' && (
        <g className="bubble pop">
          <path d="M84 8h24a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H94l-6 6v-6h-4a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z" fill="#ef4444" />
          <text x="96" y="27" textAnchor="middle" fontSize="18" fontWeight="800" fill="#fff">!</text>
        </g>
      )}
      {status === 'done' && (
        <g className="bubble pop">
          <circle cx="96" cy="20" r="12" fill="#22c55e" />
          <path d="M90 20l4 4 8-8" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {status === 'error' && (
        <g className="bubble pop">
          <circle cx="96" cy="20" r="12" fill="#f97316" />
          <text x="96" y="26" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">?!</text>
        </g>
      )}
      {status === 'idle' && (
        <g className="zzz" fill="#94a3b8" fontWeight="700">
          <text x="78" y="26" fontSize="10">z</text>
          <text x="86" y="16" fontSize="13">z</text>
          <text x="96" y="6" fontSize="16">Z</text>
        </g>
      )}
      {status === 'working' && (
        <g className="dots" fill={color}>
          <circle cx="88" cy="22" r="2.5" />
          <circle cx="96" cy="22" r="2.5" />
          <circle cx="104" cy="22" r="2.5" />
        </g>
      )}
    </svg>
  )
}
