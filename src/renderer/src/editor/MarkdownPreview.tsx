import { useEffect, useMemo, useRef, useState } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { highlightLine, languageFor } from '../components/highlight'
import type { monaco } from './monaco'

const marked = new Marked({ gfm: true, breaks: false })
marked.use({
  renderer: {
    code({ text, lang }) {
      const l = lang ? languageFor(`x.${lang}`) ?? lang : undefined
      const html = text.split('\n').map((line) => highlightLine(line, l)).join('\n')
      return `<pre class="md-code"><code>${html}</code></pre>`
    }
  }
})

/**
 * Live, sanitised markdown preview of a Monaco model.
 * Links: http(s) open in the browser, relative .md links open in the editor.
 */
export function MarkdownPreview({ model, path, onOpen }: {
  model: monaco.editor.ITextModel
  path: string
  onOpen: (relPath: string) => void
}) {
  const [text, setText] = useState(model.getValue())
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setText(model.getValue())
    let t: ReturnType<typeof setTimeout>
    const sub = model.onDidChangeContent(() => {
      clearTimeout(t)
      t = setTimeout(() => setText(model.getValue()), 120)
    })
    return () => {
      clearTimeout(t)
      sub.dispose()
    }
  }, [model])

  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false }) as string
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'button', 'iframe', 'textarea', 'select'], FORBID_ATTR: ['style'] })
  }, [text])

  const dir = path.split('/').slice(0, -1).join('/')
  return (
    <div
      className="md-preview"
      ref={ref}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        if (!a) return
        e.preventDefault()
        const href = a.getAttribute('href') ?? ''
        if (/^https?:\/\//.test(href) || href.startsWith('mailto:')) window.open(href)
        else if (href.startsWith('#')) ref.current?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ behavior: 'smooth' })
        else if (href) {
          const parts = [...(dir ? dir.split('/') : []), ...href.split('#')[0].split('/')]
          const out: string[] = []
          for (const p of parts) p === '..' ? out.pop() : p && p !== '.' && out.push(p)
          onOpen(out.join('/'))
        }
      }}
    >
      <article className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
