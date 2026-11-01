import { useMemo } from 'react'
import { highlightLine, languageFor } from './highlight'

type Kind = 'ctx' | 'add' | 'del' | 'hunk' | 'note'
interface Line {
  kind: Kind
  text: string
  old?: number
  new?: number
}

/** Parse a unified diff into typed lines with old/new line numbers. */
function parse(diff: string): Line[] {
  const out: Line[] = []
  let o = 0
  let n = 0
  let inHunk = false
  for (const l of diff.replace(/\n+$/, '').split('\n')) {
    const h = l.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/)
    if (h) {
      o = Number(h[1])
      n = Number(h[2])
      inHunk = true
      out.push({ kind: 'hunk', text: h[3].trim() ? `@@ ${h[3].trim()}` : `Lines ${n}+` })
    } else if (!inHunk) {
      if (!/^(diff |index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/.test(l) && l.trim()) out.push({ kind: 'note', text: l })
    } else if (l.startsWith('+')) out.push({ kind: 'add', text: l.slice(1), new: n++ })
    else if (l.startsWith('-')) out.push({ kind: 'del', text: l.slice(1), old: o++ })
    else if (l.startsWith('\\')) continue
    else out.push({ kind: 'ctx', text: l.slice(1), old: o++, new: n++ })
  }
  return out
}

/** Pair deletions with additions so they sit side by side. */
function toSplit(lines: Line[]): [Line | null, Line | null][] {
  const rows: [Line | null, Line | null][] = []
  for (let i = 0; i < lines.length; ) {
    const l = lines[i]
    if (l.kind === 'del' || l.kind === 'add') {
      const dels: Line[] = []
      const adds: Line[] = []
      while (i < lines.length && lines[i].kind === 'del') dels.push(lines[i++])
      while (i < lines.length && lines[i].kind === 'add') adds.push(lines[i++])
      for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push([dels[k] ?? null, adds[k] ?? null])
    } else {
      rows.push([l, l])
      i++
    }
  }
  return rows
}

interface Props {
  diff: string
  path: string
  mode: 'unified' | 'split'
  wrap: boolean
  fontSize: number
}

export function DiffView({ diff, path, mode, wrap, fontSize }: Props) {
  const lang = languageFor(path)
  const lines = useMemo(() => parse(diff), [diff])
  const html = useMemo(() => new Map(lines.map((l) => [l, highlightLine(l.text, lang)])), [lines, lang])
  const style = { fontSize, ['--diff-font' as string]: `${fontSize}px` }
  const cls = `diff ${wrap ? 'wrap' : ''}`

  if (!lines.some((l) => l.kind !== 'note'))
    return <div className={cls} style={style}><div className="diff-empty">{diff.trim() || 'Select a file'}</div></div>

  const code = (l: Line | null) =>
    l ? <span className="dcode" dangerouslySetInnerHTML={{ __html: html.get(l) || ' ' }} /> : <span className="dcode" />

  if (mode === 'split') {
    return (
      <div className={`${cls} split`} style={style}>
        {toSplit(lines).map(([a, b], i) =>
          a?.kind === 'hunk' || a?.kind === 'note' ? (
            <div key={i} className={`dl k-${a.kind}`}><span className="dcode">{a.text}</span></div>
          ) : (
            <div key={i} className="srow">
              <div className={`dl ${a ? `k-${a.kind}` : 'k-pad'}`}>
                <span className="ln">{a?.old ?? ''}</span>
                <span className="sign">{a?.kind === 'del' ? '−' : ''}</span>
                {code(a && a.kind !== 'add' ? a : null)}
              </div>
              <div className={`dl ${b ? `k-${b.kind}` : 'k-pad'}`}>
                <span className="ln">{b?.new ?? ''}</span>
                <span className="sign">{b?.kind === 'add' ? '+' : ''}</span>
                {code(b && b.kind !== 'del' ? b : null)}
              </div>
            </div>
          )
        )}
      </div>
    )
  }

  return (
    <div className={cls} style={style}>
      {lines.map((l, i) =>
        l.kind === 'hunk' || l.kind === 'note' ? (
          <div key={i} className={`dl k-${l.kind}`}><span className="dcode">{l.text}</span></div>
        ) : (
          <div key={i} className={`dl k-${l.kind}`}>
            <span className="ln">{l.old ?? ''}</span>
            <span className="ln">{l.new ?? ''}</span>
            <span className="sign">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}</span>
            {code(l)}
          </div>
        )
      )}
    </div>
  )
}
