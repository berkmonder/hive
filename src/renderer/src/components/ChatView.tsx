import { useEffect, useMemo, useRef, useState } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Conversation } from '@shared/chat'
import { useStore } from '../store'
import { Icon } from './common'
import { fmtTok } from './UsageView'
import { speak } from '../speech'

const md = new Marked({ gfm: true, breaks: true })
const html = (s: string): string => DOMPurify.sanitize(md.parse(s, { async: false }) as string)



/** Polls the agent's Claude Code transcript (only while something shows it). */
export function useConversation(agentId: string, enabled: boolean, everyMs = 2500): (Conversation & { none?: boolean }) | null {
  const [conv, setConv] = useState<(Conversation & { none?: boolean }) | null>(null)
  const status = useStore((s) => s.runtimes[agentId]?.status)
  const isClaude = useStore((s) => ['claude', 'codex', 'gemini'].includes(s.app.agents.find((a) => a.id === agentId)?.providerId ?? ''))
  useEffect(() => {
    if (!enabled || !isClaude) return
    let alive = true
    const load = (): void => {
      window.api.conversation(agentId).then((c) => alive && setConv(c)).catch(() => undefined)
    }
    load()
    const t = setInterval(load, status === 'working' ? everyMs : everyMs * 3)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [agentId, enabled, isClaude, status, everyMs])
  return isClaude ? conv : null
}

/** "ctx 42% · 84k / 200k" – turns amber and red as the context window fills. */
export function ContextBadge({ conv }: { conv: Conversation | null }) {
  const c = conv?.context
  if (!c) return null
  const pct = Math.round((c.used / c.window) * 100)
  const lvl = pct >= 80 ? 'hi' : pct >= 55 ? 'mid' : 'lo'
  return (
    <span className={`chip ctx-badge ${lvl}`} title={`Context window: ${c.used.toLocaleString()} of ${c.window.toLocaleString()} tokens (${c.model})${pct >= 80 ? '\nConsider /compact or a fresh session.' : ''}`}>
      <i style={{ width: `${Math.min(100, pct)}%` }} />
      <span>ctx {pct}% · {fmtTok(c.used)}/{fmtTok(c.window)}</span>
    </span>
  )
}

/** The terminal session read as a chat: your messages, replies and collapsed tool calls. */
export function ChatView({ agentId, conv }: { agentId: string; conv: (Conversation & { none?: boolean }) | null }) {
  const end = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [speaking, setSpeaking] = useState<number | null>(null)
  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  const agent = useStore((s) => s.app.agents.find((a) => a.id === agentId))
  const items = conv?.items ?? []
  const rendered = useMemo(() => items.map((it) => (it.kind === 'tool' ? '' : html(it.text))), [items])
  useEffect(() => {
    if (stick.current) end.current?.scrollIntoView({ block: 'end' })
  }, [items.length])

  if (!agent || !['claude', 'codex', 'gemini'].includes(agent.providerId))
    return <div className="chat-empty muted">The conversation view reads Claude Code, Codex and Gemini sessions. Use the terminal for {agent?.name ?? 'this agent'}.</div>
  if (!conv) return <div className="chat-empty muted">Loading conversation…</div>
  if (conv.none || !items.length)
    return <div className="chat-empty muted">No conversation yet – it appears here once {agent.name} gets its first message.</div>

  return (
    <div className="chat" ref={box} onScroll={(e) => {
      const el = e.currentTarget
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }}>
      {items.map((it, i) =>
        it.kind === 'tool' ? (
          <details key={i} className={`chat-tool ${it.error ? 'err' : ''}`}>
            <summary><Icon name="terminal" size={12} /> <span className="mono">{it.text}</span>{it.error && <em>error</em>}</summary>
            {it.input && it.input !== '{}' && <pre className="mono">{it.input}</pre>}
            {it.result && <pre className="mono res">{it.result}</pre>}
          </details>
        ) : (
          <div key={i} className={`chat-msg ${it.kind}`}>
            <div className="chat-who">{it.kind === 'user' ? 'You' : agent.name}{it.at ? <time>{new Date(it.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time> : null}
              {it.kind === 'assistant' && (
                <button className={`icon-btn chat-speak ${speaking === i ? 'on' : ''}`} title={speaking === i ? 'Stop reading' : 'Read aloud'} onClick={() => {
                  if (speaking === i) {
                    window.speechSynthesis?.cancel()
                    setSpeaking(null)
                  } else {
                    setSpeaking(i)
                    speak(it.text, () => setSpeaking((x) => (x === i ? null : x)))
                  }
                }}><Icon name="volume" size={12} /></button>
              )}
            </div>
            <div className="md-body chat-body" dangerouslySetInnerHTML={{ __html: rendered[i] }} />
          </div>
        )
      )}
      <div ref={end} />
    </div>
  )
}
