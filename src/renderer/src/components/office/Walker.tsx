import type { AgentStatus } from '@shared/types'
import { Hair, looksFor } from '../Character'
import { Divider, ProChair, ProDesk } from './furniture'

export type Pose = 'walk' | 'stand' | 'wave' | 'cheer' | 'coffee' | 'sit' | 'sleep'

/**
 * Full-body character for the office scene (same looks as the seated Character).
 * Coordinates share the Character head system (head centre 60,38) so Hair fits.
 */
export function Walker({ seed, color, pose, status, size = 70 }: { seed: string; color: string; pose: Pose; status: AgentStatus; size?: number }) {
  const l = looksFor(seed)
  const sitting = pose === 'sit' || pose === 'sleep'
  const eyesClosed = pose === 'sleep'
  const pants = '#2b3245'
  const legs = sitting ? (
    <g stroke={pants} strokeWidth="7" strokeLinecap="round" fill="none">
      <path d="M53 82 L48 90 L48 98" />
      <path d="M67 82 L72 90 L72 98" />
    </g>
  ) : (
    <g stroke={pants} strokeWidth="7" strokeLinecap="round">
      <line className="leg leg-l" x1="54" y1="82" x2="54" y2="103" style={{ transformOrigin: '54px 82px' }} />
      <line className="leg leg-r" x1="66" y1="82" x2="66" y2="103" style={{ transformOrigin: '66px 82px' }} />
    </g>
  )
  const shoes = sitting ? (
    <g fill="#1a1d27"><ellipse cx="47" cy="100" rx="5" ry="3" /><ellipse cx="73" cy="100" rx="5" ry="3" /></g>
  ) : (
    <g fill="#1a1d27"><ellipse className="shoe-l" cx="53" cy="105" rx="5.5" ry="3" /><ellipse className="shoe-r" cx="67" cy="105" rx="5.5" ry="3" /></g>
  )
  const arm = (side: "l" | "r") => {
    const sx = side === 'l' ? 48 : 72
    const raised = pose === 'cheer' || (pose === 'wave' && side === 'r')
    const holding = pose === 'coffee' && side === 'r'
    const d = raised
      ? `M${sx} 60 L${side === 'l' ? 40 : 80} 48 L${side === 'l' ? 38 : 82} 36`
      : holding
        ? `M${sx} 60 L78 72 L68 68`
        : sitting
          ? `M${sx} 60 L${side === 'l' ? 44 : 76} 74 L${side === 'l' ? 50 : 70} 80`
          : `M${sx} 60 L${side === 'l' ? 45 : 75} 72 L${side === 'l' ? 45 : 75} 82`
    const hand = raised ? [side === 'l' ? 38 : 82, 35] : holding ? [67, 68] : sitting ? [side === 'l' ? 50 : 70, 80] : [side === 'l' ? 45 : 75, 83]
    return (
      <g className={`w-arm w-arm-${side}`} style={{ transformOrigin: `${sx}px 60px` }}>
        <path d={d} stroke={color} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx={hand[0]} cy={hand[1]} r="3.3" fill={l.skin} />
      </g>
    )
  }
  return (
    <svg className={`walker pose-${pose} st-${status}`} width={size} height={size * 1.4} viewBox="22 4 76 106" aria-hidden>
      <ellipse cx="60" cy={sitting ? 101 : 106} rx="17" ry="3.5" fill="#000" opacity=".28" />
      <g className="w-body">
        {legs}
        {shoes}
        <path d="M47 62c0-5 6-8 13-8s13 3 13 8v21H47z" fill={color} />
        <path d="M47 76h26v7H47z" fill="rgba(0,0,0,.15)" />
        {arm('l')}
        {arm('r')}
        {pose === 'coffee' && (
          <g>
            <rect x="62" y="62" width="9" height="9" rx="2" fill="#f8fafc" />
            <path className="steam" d="M65 59q-2-3 0-6M68 59q2-3 0-6" stroke="#cbd5e1" strokeWidth="1" fill="none" />
          </g>
        )}
        <g className="w-head" style={{ transformOrigin: '60px 52px' }}>
          {l.style === 'long' && <path d="M46 40l-1 16h30l-1-16z" fill={l.hair} opacity=".9" />}
          <rect x="57" y="48" width="6" height="7" fill={l.skin} />
          <circle cx="60" cy="38" r="13" fill={l.skin} />
          <circle cx="47.5" cy="39" r="2.5" fill={l.skin} />
          <circle cx="72.5" cy="39" r="2.5" fill={l.skin} />
          <Hair style={l.style} color={l.hair} agent={color} />
          {eyesClosed ? (
            <path d="M53 41q2 2 4 0M63 41q2 2 4 0" stroke="#1f2937" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          ) : (
            <g className="eyes" fill="#1f2937">
              <circle cx="55" cy="40" r="1.8" />
              <circle cx="65" cy="40" r="1.8" />
            </g>
          )}
          {l.glasses && !eyesClosed && (
            <g stroke="#111827" strokeWidth="1.2" fill="rgba(255,255,255,.15)">
              <circle cx="55" cy="40" r="4" /><circle cx="65" cy="40" r="4" /><path d="M59 40h2" />
            </g>
          )}
          <circle cx="51" cy="45" r="2" fill="#f43f5e" opacity=".25" />
          <circle cx="69" cy="45" r="2" fill="#f43f5e" opacity=".25" />
          {pose === 'cheer' || pose === 'coffee' ? (
            <path d="M55 46q5 5 10 0" stroke="#7f1d1d" strokeWidth="1.6" fill="#fff" />
          ) : (
            <path d="M56 46q4 2 8 0" stroke="#1f2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          )}
        </g>
      </g>
      {pose === 'sleep' && (
        <g className="zzz" fill="#94a3b8" fontWeight="700">
          <text x="74" y="26" fontSize="9">z</text>
          <text x="81" y="17" fontSize="12">z</text>
          <text x="89" y="8" fontSize="15">Z</text>
        </g>
      )}
    </svg>
  )
}

/** Sims-style status diamond floating above a character. */
export function Plumbob({ status }: { status: AgentStatus }) {
  return (
    <svg className={`plumbob st-${status}`} width="16" height="24" viewBox="0 0 16 24" aria-hidden>
      <path d="M8 0 L16 10 L8 24 L0 10 Z" fill="var(--c)" />
      <path d="M8 0 L8 24 L0 10 Z" fill="rgba(255,255,255,.28)" />
      <path d="M0 10 L16 10" stroke="rgba(0,0,0,.18)" strokeWidth="1" />
    </svg>
  )
}

/** A desk nobody is sitting at (same geometry as the seated Character's desk). */
export function EmptyDesk({ seed, color, size = 120, office }: { seed: string; color: string; size?: number; office?: boolean }) {
  const l = looksFor(seed)
  if (office)
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
        <Divider accent={color} />
        <g transform="rotate(-8 60 80) translate(4 4)"><ProChair /></g>
        <ProDesk status="idle" accent={color} mug={l.mug} plant={l.plant} occupied={false} />
      </svg>
    )
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <rect x="40" y="50" width="40" height="40" rx="8" fill="#2a3142" />
      <rect x="57" y="96" width="6" height="12" fill="#2a3142" />
      <ellipse cx="60" cy="112" rx="22" ry="3" fill="#000" opacity=".25" />
      <rect x="6" y="88" width="108" height="7" rx="2" fill="#8b6b4a" />
      <rect x="10" y="95" width="5" height="17" fill="#6b5138" />
      <rect x="105" y="95" width="5" height="17" fill="#6b5138" />
      <path d="M38 84h44l2 4H36z" fill="#aeb4c2" />
      <circle cx="60" cy="86" r="1.5" fill={color} opacity=".6" />
      {l.mug && (
        <g>
          <rect x="89" y="79" width="9" height="9" rx="2" fill="#f8fafc" />
          <path d="M98 81q4 0 4 3t-4 3" stroke="#f8fafc" strokeWidth="1.6" fill="none" />
        </g>
      )}
      {l.plant && (
        <g>
          <rect x="16" y="80" width="9" height="8" rx="1.5" fill="#b45309" />
          <path d="M20 80q-6-8-2-12 2 6 2 12q1-9 6-11-2 7-6 11" fill="#22c55e" />
        </g>
      )}
    </svg>
  )
}
