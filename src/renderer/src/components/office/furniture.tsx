/** Office furniture pieces in the 120×120 desk coordinate system shared with <Character>. */
import type { AgentStatus } from '@shared/types'

/** Low acoustic divider behind the workstation. */
export function Divider({ accent }: { accent: string }) {
  return (
    <g className="divider">
      <rect x="0" y="58" width="120" height="34" rx="3" fill="#2a3040" />
      <rect x="2" y="60" width="116" height="30" rx="2" fill={`color-mix(in srgb, ${accent} 16%, #2d3343)`} />
      <rect x="0" y="56" width="120" height="3" rx="1.5" fill="#495167" />
    </g>
  )
}

export function ProChair() {
  return (
    <g className="pro-chair">
      <ellipse cx="60" cy="112" rx="30" ry="3.5" fill="#000" opacity=".3" />
      <rect x="37" y="42" width="46" height="52" rx="12" fill="#1c212c" />
      <rect x="41" y="46" width="38" height="44" rx="9" fill="#262c39" />
      <path d="M45 54h30M45 62h30M45 70h30M45 78h30" stroke="#2f3646" strokeWidth="1.2" />
      <rect x="46" y="32" width="28" height="9" rx="4" fill="#1c212c" />
      <rect x="31" y="72" width="7" height="14" rx="3" fill="#1c212c" />
      <rect x="82" y="72" width="7" height="14" rx="3" fill="#1c212c" />
    </g>
  )
}

export function ProDesk({ status, accent, mug, plant, occupied }: { status: AgentStatus; accent: string; mug: boolean; plant: boolean; occupied: boolean }) {
  const lit = occupied && status !== 'idle'
  return (
    <g className={`pro-desk st-${status} ${lit ? 'lit' : ''}`}>
      {/* monitor on an arm, seen from behind */}
      <rect x="57" y="82" width="6" height="7" fill="#7b8496" />
      <rect x="49" y="86" width="22" height="3" rx="1.5" fill="#7b8496" />
      <g className="mon">
        <rect x="27" y="54" width="66" height="34" rx="3.5" fill="#1a1f29" stroke="#3a4253" strokeWidth="1.2" />
        <rect x="27" y="54" width="66" height="34" rx="3.5" fill="none" className="mon-edge" />
        <circle cx="60" cy="71" r="3.2" fill={accent} opacity={lit ? 0.9 : 0.35} />
      </g>
      {/* desk top */}
      <rect x="2" y="88" width="116" height="5" rx="1.5" fill="#efe9df" />
      <rect x="2" y="92" width="116" height="1.5" fill="#cfc6b6" />
      <rect x="6" y="93.5" width="108" height="5" fill="#2b313d" />
      {/* steel frame legs */}
      <rect x="8" y="93.5" width="3" height="19" fill="#9aa3b5" />
      <rect x="5" y="111" width="10" height="2" rx="1" fill="#9aa3b5" />
      {/* drawer pedestal */}
      <rect x="82" y="94" width="28" height="19" rx="1.5" fill="#e3e7ee" />
      <rect x="82" y="94" width="28" height="19" rx="1.5" fill="none" stroke="#c3c9d4" />
      <path d="M82 100.5h28M82 107h28" stroke="#c3c9d4" />
      <rect x="93" y="96.5" width="6" height="1.6" rx=".8" fill="#8a93a6" />
      <rect x="93" y="103" width="6" height="1.6" rx=".8" fill="#8a93a6" />
      <rect x="93" y="109.3" width="6" height="1.6" rx=".8" fill="#8a93a6" />
      {/* desk items */}
      <rect x="14" y="85" width="18" height="3" rx="1" fill="#e5e7eb" opacity=".9" />
      <rect x="14.5" y="84" width="9" height="1.2" rx=".6" fill="#94a3b8" />
      {mug && (
        <g>
          <rect x="96" y="79" width="8" height="9" rx="2" fill="#f1f5f9" />
          <path d="M104 81q3.5 0 3.5 3t-3.5 3" stroke="#f1f5f9" strokeWidth="1.5" fill="none" />
          {status === 'working' && occupied && <path className="steam" d="M98.5 76q-2-3 0-6M101.5 76q2-3 0-6" stroke="#cbd5e1" strokeWidth="1" fill="none" />}
        </g>
      )}
      {plant && (
        <g>
          <path d="M84 80h8l-1 8h-6z" fill="#e5e7eb" />
          <path d="M88 80q-5-7-1-11 1 6 1 11q1-8 5-10-1 6-5 10" fill="#4ade80" />
        </g>
      )}
    </g>
  )
}
