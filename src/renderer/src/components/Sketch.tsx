import { useEffect, useRef, useState } from 'react'
import { Icon } from './common'

type Tool = 'pen' | 'circle' | 'arrow' | 'box'
type Shape = { tool: Tool; color: string; pts: [number, number][] }
const COLORS = ['#ff3b5c', '#ffcc00', '#22d3ee', '#22c55e']

/** Draw on a screenshot (circle, arrow, box, pen) so the agent knows exactly what you mean. */
export function SketchEditor({ src, onSave, onClose }: { src: string; onSave: (png: Uint8Array) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLImageElement | null>(null)
  const [tool, setTool] = useState<Tool>('circle')
  const [color, setColor] = useState(COLORS[0])
  const [shapes, setShapes] = useState<Shape[]>([])
  const cur = useRef<Shape | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    const i = new Image()
    i.onload = () => {
      img.current = i
      const c = canvas.current!
      c.width = i.naturalWidth
      c.height = i.naturalHeight
      draw()
    }
    i.src = src
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  const draw = (): void => {
    const c = canvas.current
    const i = img.current
    if (!c || !i) return
    const g = c.getContext('2d')!
    g.drawImage(i, 0, 0)
    const lw = Math.max(3, c.width / 300)
    for (const s of [...shapes, ...(cur.current ? [cur.current] : [])]) {
      g.strokeStyle = s.color
      g.fillStyle = s.color
      g.lineWidth = lw
      g.lineCap = 'round'
      g.lineJoin = 'round'
      const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]]
      g.beginPath()
      if (s.tool === 'pen') s.pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)))
      else if (s.tool === 'box') g.rect(a[0], a[1], b[0] - a[0], b[1] - a[1])
      else if (s.tool === 'circle') g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 + 1, Math.abs(b[1] - a[1]) / 2 + 1, 0, 0, Math.PI * 2)
      else {
        g.moveTo(a[0], a[1])
        g.lineTo(b[0], b[1])
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
        const h = lw * 5
        g.moveTo(b[0], b[1])
        g.lineTo(b[0] - h * Math.cos(ang - 0.45), b[1] - h * Math.sin(ang - 0.45))
        g.moveTo(b[0], b[1])
        g.lineTo(b[0] - h * Math.cos(ang + 0.45), b[1] - h * Math.sin(ang + 0.45))
      }
      g.stroke()
    }
  }
  useEffect(draw)

  const pos = (e: React.PointerEvent): [number, number] => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]
  }
  const save = (): void => {
    canvas.current!.toBlob(async (b) => b && onSave(new Uint8Array(await b.arrayBuffer())), 'image/png')
  }
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal sketch" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sketch-bar">
          <div className="seg sm">
            {(['circle', 'arrow', 'box', 'pen'] as Tool[]).map((t) => (
              <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)} style={{ width: 'auto', padding: '0 10px', textTransform: 'capitalize' }}>{t}</button>
            ))}
          </div>
          {COLORS.map((c) => <button key={c} className={`sk-color ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
          <button className="icon-btn" title="Undo" disabled={!shapes.length} onClick={() => setShapes(shapes.slice(0, -1))}><Icon name="undo" size={14} /></button>
          <div className="spacer" />
          <span className="muted small">Mark what the agent should look at</span>
          <button className="btn ghost sm" onClick={onClose}>Cancel</button>
          <button className="btn sm" onClick={save}><Icon name="check" size={13} /> Use image</button>
        </div>
        <div className="sketch-stage">
          <canvas ref={canvas}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              cur.current = { tool, color, pts: [pos(e)] }
            }}
            onPointerMove={(e) => {
              if (!cur.current) return
              if (cur.current.tool === 'pen') cur.current.pts.push(pos(e))
              else cur.current.pts = [cur.current.pts[0], pos(e)]
              force((n) => n + 1)
            }}
            onPointerUp={() => {
              if (cur.current && cur.current.pts.length > 1) setShapes([...shapes, cur.current])
              cur.current = null
            }} />
        </div>
      </div>
    </div>
  )
}
