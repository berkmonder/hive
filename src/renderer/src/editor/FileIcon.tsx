/** Small coloured file-type badges for the explorer and tabs. */
const TYPES: Record<string, [string, string]> = {
  ts: ['TS', '#3b82f6'], tsx: ['TSX', '#38bdf8'], js: ['JS', '#facc15'], jsx: ['JSX', '#fde047'], mjs: ['JS', '#facc15'], cjs: ['JS', '#facc15'],
  json: ['{}', '#fbbf24'], md: ['M↓', '#94a3b8'], mdx: ['M↓', '#94a3b8'], css: ['#', '#60a5fa'], scss: ['#', '#f472b6'], less: ['#', '#818cf8'],
  html: ['<>', '#fb923c'], vue: ['V', '#34d399'], svelte: ['S', '#f97316'], py: ['PY', '#60a5fa'], go: ['GO', '#22d3ee'], rs: ['RS', '#fb923c'],
  java: ['J', '#f87171'], kt: ['KT', '#a78bfa'], swift: ['SW', '#fb923c'], rb: ['RB', '#f87171'], php: ['PHP', '#a5b4fc'], cs: ['C#', '#a78bfa'],
  c: ['C', '#93c5fd'], h: ['H', '#93c5fd'], cpp: ['C++', '#93c5fd'], sh: ['$', '#86efac'], yml: ['Y', '#f472b6'], yaml: ['Y', '#f472b6'],
  toml: ['T', '#a8a29e'], env: ['•', '#facc15'], lock: ['🔒', '#78716c'], sql: ['DB', '#fcd34d'], svg: ['SVG', '#fb923c'],
  png: ['IMG', '#a78bfa'], jpg: ['IMG', '#a78bfa'], jpeg: ['IMG', '#a78bfa'], gif: ['IMG', '#a78bfa'], webp: ['IMG', '#a78bfa'], ico: ['IMG', '#a78bfa'],
  txt: ['TXT', '#94a3b8'], gitignore: ['GIT', '#f87171'], dockerfile: ['🐳', '#38bdf8']
}

export function FileIcon({ name, dir, open }: { name: string; dir?: boolean; open?: boolean }) {
  if (dir)
    return (
      <svg className="ficon" width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path d={open ? 'M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H7l-3 7H3z M4 20l3-9h15l-3 9z' : 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'}
          fill="color-mix(in srgb, var(--accent) 55%, #8b93a7)" opacity=".85" />
      </svg>
    )
  const lower = name.toLowerCase()
  const ext = lower === 'dockerfile' ? 'dockerfile' : lower.startsWith('.') && !lower.slice(1).includes('.') ? lower.slice(1) : lower.split('.').pop() ?? ''
  const [label, color] = TYPES[ext] ?? ['', '#8b93a7']
  return (
    <span className="ficon badge" style={{ color }}>
      {label || <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" /></svg>}
    </span>
  )
}
