/**
 * Pixel-art sprites for the office. One sprite pixel = P logical px; everything is drawn
 * with crisp rectangles so it scales like a retro game.
 */
import { memo, type ReactElement } from 'react'
import type { AgentStatus } from '@shared/types'
import { looksFor } from '../Character'

export const P = 4
export const OUT = '#1a1424'

type Pal = Record<string, string>

/** rows of characters -> merged horizontal runs of rects ('.' = transparent) */
export const Px = memo(function Px({ rows, pal, x = 0, y = 0, p = P }: { rows: string[]; pal: Pal; x?: number; y?: number; p?: number }) {
  const out: ReactElement[] = []
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const ch = row[c]
      let e = c + 1
      while (e < row.length && row[e] === ch) e++
      if (ch !== '.' && pal[ch]) out.push(<rect key={`${r}:${c}`} x={x + c * p} y={y + r * p} width={(e - c) * p} height={p} fill={pal[ch]} />)
      c = e
    }
  })
  return <>{out}</>
})

/** solid pixel box with a 1px outline (units: sprite pixels) */
export function Box({ x, y, w, h, fill, line = OUT, p = P }: { x: number; y: number; w: number; h: number; fill: string; line?: string | null; p?: number }) {
  return (
    <>
      {line && <rect x={x * p} y={y * p} width={w * p} height={h * p} fill={line} />}
      <rect x={(x + (line ? 1 : 0)) * p} y={(y + (line ? 1 : 0)) * p} width={(w - (line ? 2 : 0)) * p} height={(h - (line ? 2 : 0)) * p} fill={fill} />
    </>
  )
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6).padEnd(6, '0'), 16)
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// ---------------- people (16 × 24) ----------------
const HEAD: Record<string, string[]> = {
  short: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '...ohhHhhhhho...',
    '...ohssssssho...'
  ],
  long: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '...ohhssssshho..'.slice(0, 16)
  ],
  bun: [
    '......oooo......',
    '.....ohhhho.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '...ohhhhHhhho...',
    '...ohssssssho...'
  ],
  spiky: [
    '....o.o.oo.o....',
    '....ohohhoho....',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '...ohHhhhhhho...',
    '...ohssssssho...'
  ],
  cap: [
    '................',
    '.....oooooo.....',
    '....occcccco....',
    '...occcwcccco...',
    '...occcccccco...',
    '..oCCCCCCCCCo...'
  ],
  curly: [
    '.....o.oo.o.....',
    '....ohohhoho....',
    '...ohhhhhhhho...',
    '..ohhhhhhhhhho..',
    '..ohhHhhhhHhho..',
    '...ohssssssho...'
  ]
}
const FACE_OPEN = [
  '...osssssssso...',
  '...osesssseso...',
  '...osssssssso...',
  '....osssmsso....',
  '.....oSSSSo.....'
]
const FACE_SHUT = [
  '...osssssssso...',
  '...osEEssEEso...',
  '...osssssssso...',
  '....osssmsso....',
  '.....oSSSSo.....'
]
const GLASSES = [
  '...osssssssso...',
  '...ogegssgego...',
  '...osssssssso...',
  '....osssmsso....',
  '.....oSSSSo.....'
]
const BODY = [
  '...occcwwccco...',
  '..occcccccccco..',
  '.occCccccccCcco.',
  '.occCccccccCcco.',
  '.oSsCccccccCsSo.',
  '..ooppppppppoo..'
]
const BODY_UP = [
  'oSo.occwwcco.oSo',
  'oco.occccccco.oco'.slice(0, 16),
  '.oco.cccccccc.oco'.slice(0, 16),
  '..occccccccccco.',
  '...occccccccco..',
  '..ooppppppppoo..'
]
const LEGS_STAND = ['...oppppppppo...', '...oppppppppo...', '...opppoopppo...', '...oppo..oppo...', '...oppo..oppo...', '..obbbo..obbbo..', '..ooooo..ooooo..']
const LEGS_WALK = ['...oppppppppo...', '...oppppppppo...', '...opppoopppo...', '..oppo....oppo..', '..oppo....oppo..', '.obbbo....obbbo.', '.ooooo....ooooo.']
const LEGS_SIT = ['..oppppppppppo..', '..oppppppppppo..', '...oppo..oppo...', '..obbbo..obbbo..', '..ooooo..ooooo..', '................', '................']

export type PxPose = 'stand' | 'walk' | 'sit' | 'sleep' | 'coffee' | 'cheer'

function personRows(style: string, glasses: boolean, pose: PxPose, frame: 0 | 1): string[] {
  const head = HEAD[style] ?? HEAD.short
  const face = pose === 'sleep' ? FACE_SHUT : glasses ? GLASSES : FACE_OPEN
  const body = pose === 'cheer' ? BODY_UP : BODY
  const legs = pose === 'sit' || pose === 'sleep' ? LEGS_SIT : pose === 'walk' && frame === 1 ? LEGS_WALK : LEGS_STAND
  let rows = [...head, ...face, ...body, ...legs]
  if (style === 'long') rows = rows.map((r, i) => (i >= 6 && i <= 11 ? r.slice(0, 3) + 'oh' + r.slice(5, 11) + 'ho' + r.slice(13) : r))
  return rows.map((r) => r.padEnd(16, '.').slice(0, 16))
}

function personPal(seed: string, color: string): Pal {
  const l = looksFor(seed)
  return {
    o: OUT, h: l.hair, H: shade(l.hair, 0.25), s: l.skin, S: shade(l.skin, -0.18), E: shade(l.skin, -0.45), m: shade(l.skin, -0.35),
    e: '#1a1424', g: '#e5e7eb', c: color, C: shade(color, -0.25), w: '#f8fafc', p: '#2b3245', b: '#14121c'
  }
}

/** a whole person, front view. Walking/typing alternate two frames with CSS (no re-render). */
export function PixelPerson({ seed, color, pose, scale = P }: { seed: string; color: string; pose: PxPose; scale?: number }) {
  const l = looksFor(seed)
  const pal = personPal(seed, color)
  const glasses = l.glasses
  const w = 16 * scale
  const h = 24 * scale
  return (
    <svg className={`px px-person px-${pose}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>
      <rect x={3 * scale} y={23 * scale} width={10 * scale} height={scale} fill="#000" opacity=".3" />
      {pose === 'walk' ? (
        <>
          <g className="f0"><Px rows={personRows(l.style, glasses, pose, 0)} pal={pal} p={scale} /></g>
          <g className="f1"><Px rows={personRows(l.style, glasses, pose, 1)} pal={pal} p={scale} /></g>
        </>
      ) : (
        <Px rows={personRows(l.style, glasses, pose, 0)} pal={pal} p={scale} />
      )}
      {pose === 'coffee' && <Px x={12 * scale} y={14 * scale} p={scale} rows={['.w.w', 'oooo', 'owwo', 'owko', 'oooo']} pal={{ o: OUT, w: '#f8fafc', k: '#7c4a2d' }} />}
    </svg>
  )
}

// ---------------- desks (30 × 30) ----------------
const DESK_PAL = (accent: string, glow: string): Pal => ({
  o: OUT, D: '#c9a476', d: '#9c7650', F: '#5b4436', f: '#46342a', L: '#9aa3b5', l: '#6b7385', g: glow, k: '#2a2f3b', K: '#3a4253',
  a: accent, A: shade(accent, -0.3), r: '#2d3440', R: '#404858', m: '#f1f5f9', t: '#7c4a2d', G: '#34d399', n: '#15803d', u: '#e5e7eb'
})
// desk top + front, laptop, second monitor (back) and chair back
const CHAIR = [
  '..........oooooooooo..........',
  '.........orRRRRRRRRro.........',
  '.........orRRRRRRRRro.........',
  '.........orRRRRRRRRro.........',
  '.........orRRRRRRRRro.........',
  '.........orRRRRRRRRro.........',
  '.........orRRRRRRRRro.........',
  '.........orRRRRRRRRro.........'
]
const DESK = [
  'oooooooooooooooooooooooooooooo',
  'oDDDDDDDDDDDDDDDDDDDDDDDDDDDDo',
  'oddddddddddddddddddddddddddddo',
  'oFFFFFFFFFFFFFFFFFFFFFFFFFFFFo',
  'oFffffffffffffffffffffffffffFo',
  'oFfFFFFFFFFFFFFFFFFFFFFFFFFfFo',
  'oFfFFFFFFFFFFFFFFFFFFFFFFFFfFo',
  'oFffffffffffffffffffffffffffFo',
  'oooooooooooooooooooooooooooooo',
  '.of.o..................o.fo...'.slice(0, 30),
  '.oo....................oo.....'.slice(0, 30)
]
const LAPTOP = ['.oooooooooo.', '.oLLLLLLLLo.', '.oLLLLLLLLo.', '.oLLLggLLLo.', '.oLLLLLLLLo.', 'oollllllllloo'.slice(0, 12)]
const MONITOR = ['oooooooo', 'okkkkkko', 'okKKKKko', 'okkkkkko', 'okkkkkko', 'oooooooo', '...oo...', '..oKKo..']
const MUG = ['.oooo', 'ommoo', 'ommo.', 'oooo.']
const PLANT = ['..nG.G..', '.GnGnG..', 'GnGGnGG.', '.GGnGG..', '.oooooo.', '.otttto.', '..oooo..']

export function PixelDesk({ seed, color, status, occupied }: { seed: string; color: string; status: AgentStatus; occupied: boolean }) {
  const l = looksFor(seed)
  const glow = status === 'working' ? '#a5f3fc' : status === 'waiting' ? '#fda4af' : status === 'error' ? '#fdba74' : status === 'done' ? '#86efac' : '#475069'
  const pal = DESK_PAL(color, glow)
  const S = 30 * P
  const top = 16 // desk top row
  const person = occupied ? personRows(l.style, l.glasses, 'stand', 0).slice(0, 15) : null
  const ppal = personPal(seed, color)
  return (
    <svg className={`px px-desk st-${status}`} width={S} height={S} viewBox={`0 0 ${S} ${S}`} shapeRendering="crispEdges" aria-hidden>
      <rect x={P} y={(top + 10) * P} width={28 * P} height={P * 2} fill="#000" opacity=".22" />
      <Px rows={CHAIR} pal={pal} y={(occupied ? 7 : 6) * P} />
      {person && <g className={status === 'working' ? 'px-type' : ''}><Px rows={person} pal={ppal} x={7 * P} y={1 * P} /></g>}
      <Px rows={MONITOR} pal={pal} x={1 * P} y={(top - 7) * P} />
      <Px rows={DESK} pal={pal} y={top * P} />
      <g className={`px-screen ${status}`}><Px rows={LAPTOP} pal={pal} x={9 * P} y={(top - 5) * P} /></g>
      {occupied && (
        <>
          <g className="px-hand l"><Px rows={['oso', 'ooo']} pal={{ o: OUT, s: l.skin }} x={7 * P} y={(top - 1) * P} /></g>
          <g className="px-hand r"><Px rows={['oso', 'ooo']} pal={{ o: OUT, s: l.skin }} x={20 * P} y={(top - 1) * P} /></g>
        </>
      )}
      {l.mug && <Px rows={MUG} pal={pal} x={24 * P} y={(top - 3) * P} />}
      {l.plant && <Px rows={PLANT} pal={pal} x={22 * P} y={(top - 7) * P} />}
      {!l.plant && !l.mug && <Px rows={['oooo', 'ouuo', 'ouuo', 'oooo']} pal={pal} x={24 * P} y={(top - 3) * P} />}
    </svg>
  )
}

/** pixel speech bubble over a head: ! (needs you), ✓ (done), … (working), x (error), z (sleep) */
const ICONS: Record<string, { rows: string[]; c: string }> = {
  waiting: { c: '#fb7185', rows: ['..#..', '..#..', '..#..', '.....', '..#..'] },
  done: { c: '#4ade80', rows: ['....#', '...#.', '#.#..', '.#...', '.....'] },
  error: { c: '#fb923c', rows: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'] },
  working: { c: '#a5b4fc', rows: ['.....', '.....', '#.#.#', '.....', '.....'] },
  idle: { c: '#94a3b8', rows: ['####.', '..#..', '.#...', '####.', '.....'] }
}
export function PixelBubble({ kind }: { kind: AgentStatus }) {
  const ic = ICONS[kind]
  if (!ic) return null
  const rows = ['ooooooooo', 'owwwwwwwo', 'owwwwwwwo', 'owwwwwwwo', 'owwwwwwwo', 'owwwwwwwo', 'owwwwwwwo', 'owwwwwwwo', 'oooowoooo', '...owo...', '....o....']
  const s = 3
  return (
    <svg className={`px px-bubble k-${kind}`} width={9 * s} height={11 * s} viewBox={`0 0 ${9 * s} ${11 * s}`} shapeRendering="crispEdges" aria-hidden>
      <Px rows={rows} pal={{ o: OUT, w: '#f8fafc' }} p={s} />
      <Px rows={['.........', '.........', ...ic.rows.map((r) => '..' + r + '..')]} pal={{ '#': ic.c }} p={s} />
    </svg>
  )
}

// ---------------- the room ----------------
const SOFA = (c: string): Pal => ({ o: OUT, a: c, A: shade(c, -0.25), h: shade(c, 0.18) })
const PLANT_BIG = [
  '....G.n.G.....',
  '..G.GnGnG.G...',
  '.GGnGGnGGnGG..',
  'GnGGnGGGnGGnG.',
  '.GGnGGnGGnGG..',
  '..GGnGnGnGG...',
  '...ooooooo....',
  '...owwwwwo....',
  '...owwwwwo....',
  '....owwwo.....',
  '....ooooo.....'
]
const ARCADE = [
  '.oooooooooo.',
  'oaaaaaaaaaao',
  'oAoooooooooAo'.slice(0, 12),
  'oAokkkkkkoAo',
  'oAokgkkgkoAo',
  'oAokkGGkkoAo',
  'oAokkkkkkoAo',
  'oAoooooooAoo'.slice(0, 12),
  'oaaaaaaaaaao',
  'oarrayybbaao'.slice(0, 12),
  'oaaaaaaaaaao',
  'oAAAAAAAAAAo',
  'oAAAAAAAAAAo',
  'oAAAAAAAAAAo',
  'oAAAAAAAAAAo',
  'oooooooooooo'
]
const COFFEE_MACHINE = ['oooooooo', 'ollllllo', 'olkkkklo', 'olkgkklo', 'ollllllo', 'oll..llo', 'olloolo.'.slice(0, 8), 'oooooooo']

export function PixelRoomBg({ w, h, L, door, hour }: { w: number; h: number; L: number; door: { x: number; y: number }; hour: number }) {
  const W = Math.ceil(w / P)
  const H = Math.ceil(h / P)
  const l = Math.round(L / P)
  const wallH = 38
  const split = 172 // px column where the review room starts
  const night = hour < 7 || hour >= 19
  const lamp = night ? 0.22 : 0.1
  return (
    <svg className="o-bg px" width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>
      <defs>
        <pattern id="px-brick" width={16 * P} height={8 * P} patternUnits="userSpaceOnUse">
          <rect width={16 * P} height={8 * P} fill="#2a2340" />
          <rect width={16 * P} height={P} fill="#231d36" />
          <rect y={4 * P} width={16 * P} height={P} fill="#231d36" />
          <rect x={7 * P} y={P} width={P} height={3 * P} fill="#231d36" />
          <rect x={15 * P} y={5 * P} width={P} height={3 * P} fill="#231d36" />
          <rect x={P} y={P} width={4 * P} height={P} fill="#30284a" />
          <rect x={9 * P} y={5 * P} width={4 * P} height={P} fill="#30284a" />
        </pattern>
        <pattern id="px-tile" width={12 * P} height={12 * P} patternUnits="userSpaceOnUse">
          <rect width={12 * P} height={12 * P} fill="#262b3a" />
          <rect width={6 * P} height={6 * P} fill="#2b3142" />
          <rect x={6 * P} y={6 * P} width={6 * P} height={6 * P} fill="#2b3142" />
          <rect x={P} y={P} width={P} height={P} fill="#323a4e" />
          <rect x={7 * P} y={7 * P} width={P} height={P} fill="#323a4e" />
        </pattern>
        <pattern id="px-wood" width={32 * P} height={6 * P} patternUnits="userSpaceOnUse">
          <rect width={32 * P} height={6 * P} fill="#6b4a33" />
          <rect width={32 * P} height={3 * P} fill="#73513a" />
          <rect y={5 * P} width={32 * P} height={P} fill="#523726" />
          <rect y={2 * P} width={32 * P} height={P} fill="#5d412e" />
          <rect x={10 * P} width={P} height={3 * P} fill="#523726" />
          <rect x={26 * P} y={3 * P} width={P} height={3 * P} fill="#523726" />
          <rect x={4 * P} y={P} width={3 * P} height={P} fill="#7d5940" />
          <rect x={18 * P} y={4 * P} width={3 * P} height={P} fill="#7d5940" />
        </pattern>
        <pattern id="px-carpet" width={8 * P} height={8 * P} patternUnits="userSpaceOnUse">
          <rect width={8 * P} height={8 * P} fill="#24304a" />
          <rect x={2 * P} y={2 * P} width={P} height={P} fill="#2c3a58" />
          <rect x={6 * P} y={6 * P} width={P} height={P} fill="#2c3a58" />
        </pattern>
      </defs>

      {/* ---- back wall ---- */}
      <rect width={w} height={wallH * P} fill="url(#px-brick)" />
      <rect y={(wallH - 3) * P} width={w} height={P} fill="#3b3156" />
      <rect y={(wallH - 2) * P} width={w} height={2 * P} fill="#151122" />
      {/* whiteboard with a mini kanban */}
      <Box x={10} y={5} w={44} h={26} fill="#e8edf5" />
      <rect x={11 * P} y={29 * P} width={42 * P} height={P} fill="#b8c2d4" />
      {[0, 1, 2].map((c) => (
        <g key={c}>
          <rect x={(13 + c * 13) * P} y={8 * P} width={10 * P} height={P} fill="#7c8aa5" />
          {[0, 1, 2].slice(0, 3 - c).map((r) => <Box key={r} x={13 + c * 13} y={10 + r * 6} w={9} h={5} fill={['#fde68a', '#a5f3fc', '#fbcfe8'][(r + c) % 3]} line="#c7a96a" />)}
        </g>
      ))}
      {/* poster: rocket */}
      <Box x={62} y={6} w={20} h={24} fill="#3b2f63" line="#c9a476" />
      <Px x={66 * P} y={9 * P} rows={['....oo....', '...owwo...', '...owbwo..'.slice(0, 10), '...owwwo..'.slice(0, 10), '...owwwo..'.slice(0, 10), '..orwwwro.', '..orwwwro.', '...ooooo..', '....yy....', '...y..y...']}
        pal={{ o: OUT, w: '#e5e7eb', b: '#60a5fa', r: '#f43f5e', y: '#fbbf24' }} />
      <Px x={64 * P} y={24 * P} rows={['.y......y.......', '...........y....']} pal={{ y: '#fde68a' }} />
      {/* pennant string */}
      {Array.from({ length: 9 }, (_, i) => (
        <Px key={i} x={(178 + i * 10) * P} y={5 * P} rows={['oooooo', '.oxxo.', '..oo..']} pal={{ o: OUT, x: ['#f43f5e', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'][i % 5] }} />
      ))}
      <rect x={176 * P} y={5 * P} width={94 * P} height={P} fill="#141020" />
      {/* clock */}
      <Box x={186} y={13} w={14} h={14} fill="#f1f5f9" />
      <rect x={192 * P} y={16 * P} width={P} height={4 * P} fill={OUT} />
      <rect x={192 * P} y={19 * P} width={4 * P} height={P} fill={OUT} />
      {/* cork board */}
      <Box x={212} y={11} w={52} h={20} fill="#b07d4f" />
      {[[215, 13, '#fde68a'], [224, 15, '#bfdbfe'], [234, 13, '#fbcfe8'], [244, 16, '#bbf7d0'], [254, 13, '#fde68a'], [220, 21, '#fecaca'], [240, 22, '#ddd6fe']].map(([x, y, c], i) => (
        <g key={i}><Box x={x as number} y={y as number} w={7} h={7} fill={c as string} line={null} /><rect x={((x as number) + 3) * P} y={(y as number) * P} width={P} height={P} fill="#ef4444" /></g>
      ))}

      {/* ---- open space floor ---- */}
      <rect y={wallH * P} width={w} height={(l - wallH) * P} fill="url(#px-tile)" />
      <rect y={wallH * P} width={w} height={P} fill="#1b1f2b" />
      <text x="64" y={wallH * P + 26} className="o-zone">OPEN SPACE</text>
      {/* corner plants + water cooler */}
      <Px x={1 * P} y={(wallH + 2) * P} rows={PLANT_BIG} pal={{ o: OUT, G: '#34d399', n: '#15803d', w: '#d6c3a5' }} />
      <Px x={266 * P} y={(wallH + 2) * P} rows={PLANT_BIG} pal={{ o: OUT, G: '#4ade80', n: '#166534', w: '#94a3b8' }} />

      {/* ---- lounge (wood) ---- */}
      <rect y={l * P} width={split * P} height={h - L} fill="url(#px-wood)" />
      <rect y={(l - 1) * P} width={w} height={2 * P} fill="#151122" />
      <text x="70" y={L + 26} className="o-zone">LOUNGE</text>
      {/* rug */}
      <Box x={16} y={l + 40} w={78} h={30} fill="#7c3a5a" />
      <rect x={19 * P} y={(l + 43) * P} width={72 * P} height={24 * P} fill="#8f4568" />
      <rect x={21 * P} y={(l + 45) * P} width={68 * P} height={20 * P} fill="#7c3a5a" />
      {/* sofa */}
      <g>
        <Box x={22} y={l + 33} w={64} h={13} fill={SOFA('#5b6b8f').a} />
        <rect x={24 * P} y={(l + 35) * P} width={60 * P} height={P} fill={SOFA('#5b6b8f').h} />
        <Box x={20} y={l + 44} w={68} h={9} fill={SOFA('#5b6b8f').A} />
        <Box x={18} y={l + 38} w={6} h={16} fill={SOFA('#5b6b8f').a} />
        <Box x={84} y={l + 38} w={6} h={16} fill={SOFA('#5b6b8f').a} />
        <Box x={28} y={l + 36} w={8} h={7} fill="#fbbf24" />
      </g>
      {/* coffee table */}
      <Box x={40} y={l + 58} w={32} h={5} fill="#c9a476" />
      <rect x={42 * P} y={(l + 63) * P} width={P} height={3 * P} fill={OUT} /><rect x={69 * P} y={(l + 63) * P} width={P} height={3 * P} fill={OUT} />
      <Px x={46 * P} y={(l + 55) * P} rows={['oooo', 'owwo', 'oooo']} pal={{ o: OUT, w: '#60a5fa' }} />
      <Px x={60 * P} y={(l + 55) * P} rows={['.oo.', 'owwo', 'oooo']} pal={{ o: OUT, w: '#f8fafc' }} />
      {/* floor lamp */}
      <g>
        <Px x={6 * P} y={(l + 24) * P} rows={['.oooooo.', 'oyyyyyyo', 'oyyyyyyo', 'oooooooo', '...oo...']} pal={{ o: OUT, y: '#fde68a' }} />
        <rect x={9 * P} y={(l + 29) * P} width={2 * P} height={22 * P} fill="#4b5263" />
        <rect x={6 * P} y={(l + 51) * P} width={8 * P} height={2 * P} fill={OUT} />
        <ellipse cx={10 * P} cy={(l + 40) * P} rx={22 * P} ry={20 * P} fill="#fde68a" opacity={lamp} />
      </g>
      {/* armchair */}
      <Box x={97} y={l + 42} w={16} h={11} fill="#a5566f" />
      <Box x={95} y={l + 50} w={20} h={8} fill="#8a4259" />
      {/* coffee bar */}
      <g>
        <Box x={108} y={l + 10} w={54} h={14} fill="#2e2a3f" />
        <Px x={112 * P} y={(l + 2) * P} rows={COFFEE_MACHINE} pal={{ o: OUT, l: '#9aa3b5', k: '#1a1f29', g: '#4ade80' }} />
        {[124, 129, 134].map((x) => <Px key={x} x={x * P} y={(l + 6) * P} rows={['oooo', 'owwo', 'owwo', 'oooo']} pal={{ o: OUT, w: '#f8fafc' }} />)}
        <Box x={142} y={l + 2} w={16} h={10} fill="#141824" />
        <Px x={144 * P} y={(l + 4) * P} rows={['yy.yyy.yy', '.........', 'yyy.yy.yy']} pal={{ y: '#94a3b8' }} />
        <Box x={106} y={l + 23} w={58} h={3} fill="#c9a476" />
        <Box x={106} y={l + 25} w={58} h={8} fill="#3a3352" />
      </g>
      {/* arcade cabinet */}
      <Px x={154 * P} y={(l + 40) * P} rows={ARCADE} pal={{ o: OUT, a: '#7c3aed', A: '#5b21b6', k: '#0b1020', g: '#f472b6', G: '#4ade80', r: '#ef4444', y: '#fbbf24', b: '#60a5fa' }} />
      <rect className="px-blink" x={159 * P} y={(l + 45) * P} width={P} height={P} fill="#fbbf24" />
      <Px x={2 * P} y={(l + 58) * P} rows={PLANT_BIG} pal={{ o: OUT, G: '#34d399', n: '#15803d', w: '#d6c3a5' }} />

      {/* ---- review room ---- */}
      <rect x={split * P} y={l * P} width={w - split * P} height={h - L} fill="url(#px-carpet)" />
      <rect x={split * P} y={l * P} width={w - split * P} height={26 * P} fill="#1d2335" />
      <rect x={split * P} y={(l + 26) * P} width={w - split * P} height={P} fill="#151122" />
      <rect x={(split - 2) * P} y={l * P} width={2 * P} height={h - L} fill="#151122" />
      <text x="712" y={L + 26} className="o-zone">REVIEW ROOM</text>
      {/* TV with a diff */}
      <Box x={207} y={l + 7} w={40} h={20} fill="#0f1218" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={210 * P} y={(l + 10 + i * 3) * P} width={[24, 18, 30, 14, 26][i] * P} height={P * 2}
          fill={i === 2 ? '#34d399' : i === 3 ? '#f87171' : '#475069'} />
      ))}
      {/* bookshelf */}
      <Box x={256} y={l + 4} w={20} h={24} fill="#5b4436" />
      {[0, 1, 2].map((r) => (
        <g key={r}>
          <rect x={257 * P} y={(l + 11 + r * 7) * P} width={18 * P} height={P} fill={OUT} />
          {[0, 1, 2, 3, 4, 5].map((b) => <rect key={b} x={(258 + b * 3) * P} y={(l + 6 + r * 7) * P} width={2 * P} height={5 * P} fill={['#f43f5e', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa', '#f97316'][(b + r) % 6]} />)}
        </g>
      ))}
      {/* chairs behind the table */}
      {[806, 868, 930, 992].map((x) => <Box key={x} x={Math.round(x / P) - 5} y={l + 24} w={10} h={12} fill="#3a4258" />)}

      {/* entrance */}
      <g>
        <Box x={Math.round(door.x / P) - 7} y={Math.round(door.y / P) - 26} w={14} h={26} fill="#8b5e3c" />
        <rect x={(Math.round(door.x / P) + 3) * P} y={(Math.round(door.y / P) - 13) * P} width={P} height={2 * P} fill="#fbbf24" />
        <rect x={(Math.round(door.x / P) - 8) * P} y={Math.round(door.y / P) * P} width={16 * P} height={2 * P} fill="#4b2e2e" />
      </g>
      <rect width={w} height={h} fill="none" stroke="#151122" strokeWidth={P * 2} />
    </svg>
  )
}

/** front edge of the review table, drawn above the people sitting behind it */
export function PixelTable({ w }: { w: number }) {
  const W = Math.round(w / P)
  return (
    <svg className="px" width={w} height={14 * P} viewBox={`0 0 ${w} ${14 * P}`} shapeRendering="crispEdges" aria-hidden>
      <Box x={0} y={1} w={W} h={4} fill="#d8c6a4" />
      <rect x={P} y={2 * P} width={(W - 2) * P} height={P} fill="#e9dcc2" />
      <Box x={3} y={4} w={W - 6} h={6} fill="#4a3a30" />
      <rect x={5 * P} y={10 * P} width={P} height={4 * P} fill={OUT} />
      <rect x={(W - 6) * P} y={10 * P} width={P} height={4 * P} fill={OUT} />
      {[12, 28, 44].map((x) => <Box key={x} x={x} y={0} w={6} h={2} fill="#e5e7eb" line={null} />)}
    </svg>
  )
}
