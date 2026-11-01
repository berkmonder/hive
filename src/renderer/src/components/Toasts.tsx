import { useStore } from '../store'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <i className="dot" />
          {t.text}
        </div>
      ))}
    </div>
  )
}
