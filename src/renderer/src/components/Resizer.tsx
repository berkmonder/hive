import { useRef } from 'react'

interface Props {
  /** 'x' = vertical bar you drag left/right, 'y' = horizontal bar you drag up/down */
  axis: 'x' | 'y'
  /** called with the pointer delta since drag start (px) */
  onDrag: (delta: number) => void
  onStart?: () => void
  onReset?: () => void
  className?: string
}

/** Thin drag handle between panels. Double-click resets. */
export function Resizer({ axis, onDrag, onStart, onReset, className = '' }: Props) {
  const start = useRef(0)
  return (
    <div
      className={`resizer resizer-${axis} ${className}`}
      onDoubleClick={onReset}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        start.current = axis === 'x' ? e.clientX : e.clientY
        onStart?.()
        document.body.classList.add(`resizing-${axis}`)
      }}
      onPointerMove={(e) => {
        if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return
        onDrag((axis === 'x' ? e.clientX : e.clientY) - start.current)
      }}
      onPointerUp={(e) => {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
        document.body.classList.remove(`resizing-${axis}`)
      }}
    />
  )
}
