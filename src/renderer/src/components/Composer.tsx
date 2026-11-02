import { useEffect, useRef, useState } from 'react'
import { PromptPicker, promptFor, sendPrompt } from './Library'
import { FigmaButton } from './More'
import { useStore } from '../store'
import { Recorder } from '../dictation'
import { Icon, cleanError } from './common'
import { SketchEditor } from './Sketch'
import { BUILTIN_SLASH, matchSlash, type SlashCommand } from './slashCommands'

type Shot = { path: string; dataUrl: string }

/** Prompt box: send / queue, prompt library, screenshots & images, dictation, prompt enhancer. */
export function Composer({ agentId, compact }: { agentId: string; compact?: boolean }) {
  const draftKey = (id: string): string => `hive.draft.${id}`
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey(agentId)) ?? ''
    } catch {
      return ''
    }
  })
  // unsent text survives switching agents and restarting Hive
  const firstDraft = useRef(true)
  useEffect(() => {
    if (firstDraft.current) {
      firstDraft.current = false
      return
    }
    try {
      setText(localStorage.getItem(draftKey(agentId)) ?? '')
    } catch {
      setText('')
    }
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      if (text.trim()) localStorage.setItem(draftKey(agentId), text)
      else localStorage.removeItem(draftKey(agentId))
    } catch {
      /* storage unavailable */
    }
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
  const [shots, setShots] = useState<Shot[]>([])
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null)
  const [rec, setRec] = useState<'idle' | 'rec' | 'busy'>('idle')
  const [level, setLevel] = useState(0)
  const [enhancing, setEnhancing] = useState(false)
  const [undo, setUndo] = useState<string | null>(null)
  const [sketch, setSketch] = useState<{ i: number; src: string } | null>(null)
  const recorder = useRef<Recorder | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const agent = useStore((s) => s.app.agents.find((a) => a.id === agentId))
  const rt = useStore((s) => s.runtimes[agentId])
  const queueWhenBusy = useStore((s) => s.app.settings.queueWhenBusy)
  const insert = useStore((s) => s.composerInsert)
  const pending = useStore((s) => s.pendingShots)
  const toast = useStore((s) => s.toast)
  const running = !!rt?.running
  const busy = running && rt?.status === 'working'

  // "/" menu: the CLI's built-in commands plus custom commands / skills / prompts
  const [custom, setCustom] = useState<SlashCommand[]>([])
  const [slashSel, setSlashSel] = useState(0)
  const [slashOff, setSlashOff] = useState(false)
  const slashList = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setCustom([])
    window.api.slashCommands(agentId).then(setCustom).catch(() => undefined)
  }, [agentId, agent?.providerId])
  const slashQ = text.match(/^\/(\S*)$/)?.[1]
  const slashItems = slashQ === undefined || slashOff ? [] : matchSlash([...custom, ...(BUILTIN_SLASH[agent?.providerId ?? ''] ?? [])], slashQ).slice(0, 60)
  const slashOpen = slashItems.length > 0
  useEffect(() => setSlashSel(0), [slashQ])
  useEffect(() => {
    if (!text.startsWith('/')) setSlashOff(false)
  }, [text])
  useEffect(() => {
    slashList.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }, [slashSel])
  const pickSlash = (c: SlashCommand, run: boolean): void => {
    if (run) void send('auto', `/${c.name}`)
    else {
      setText(`/${c.name} `)
      ta.current?.focus()
    }
  }

  // ⌘⇧2 screenshots and ⌘K "insert prompt" land in the visible composer
  useEffect(() => {
    if (pending.length) setShots((s) => [...s, ...useStore.getState().takeShots()])
  }, [pending])
  useEffect(() => {
    if (!insert) return
    setText((t) => (t.trim() ? `${t}\n\n${insert.text}` : insert.text))
    ta.current?.focus()
  }, [insert])

  const message = (override?: string): string => {
    const t = (override ?? text).trim()
    const att = shots.map((s) => `[Screenshot: ${s.path}]`).join('\n')
    return [t, att && `${att}\n(Look at the attached image file${shots.length > 1 ? 's' : ''}.)`].filter(Boolean).join('\n\n')
  }

  const send = async (mode: 'auto' | 'queue' = 'auto', override?: string): Promise<void> => {
    const m = message(override)
    if (!m) return
    try {
      if (!running) {
        await window.api.startAgent(agentId, false)
        await window.api.queue.add(agentId, m)
        toast(`Starting ${agent?.name} – your message is sent when it is ready`, 'info')
      } else if (mode === 'queue' || (busy && queueWhenBusy)) {
        await window.api.queue.add(agentId, m)
      } else {
        // bracketed paste keeps multi-line prompts in one message for TUIs like Claude Code
        window.api.input(agentId, m.includes('\n') ? `\x1b[200~${m}\x1b[201~` : m)
        setTimeout(() => window.api.input(agentId, '\r'), 80)
      }
      setText('')
      setShots([])
      setUndo(null)
    } catch (e) {
      toast(cleanError(e), 'error')
    }
  }

  const screenshot = async (): Promise<void> => {
    const s = await window.api.media.screenshot().catch((e) => (toast(cleanError(e), 'error'), null))
    if (s) setShots((x) => [...x, s])
  }

  const addFiles = async (files: FileList | File[]): Promise<boolean> => {
    let any = false
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      any = true
      const a = await window.api.media.saveImage(new Uint8Array(await f.arrayBuffer()), f.type.split('/')[1] || 'png')
      setShots((x) => [...x, a])
    }
    return any
  }

  const mic = async (): Promise<void> => {
    if (rec === 'busy') return
    if (rec === 'idle') {
      try {
        recorder.current = new Recorder()
        await recorder.current.start(setLevel)
        setRec('rec')
      } catch (e) {
        toast(cleanError(e), 'error')
      }
      return
    }
    setRec('busy')
    try {
      const said = await recorder.current!.stop()
      if (said) setText((t) => (t.trim() ? `${t.trimEnd()} ${said}` : said))
      ta.current?.focus()
    } catch (e) {
      toast(cleanError(e), 'error')
    } finally {
      setRec('idle')
      setLevel(0)
    }
  }
  useEffect(() => () => recorder.current?.cancel(), [])

  const enhance = async (): Promise<void> => {
    if (!text.trim() || enhancing) return
    setEnhancing(true)
    try {
      const better = await window.api.enhancePrompt(text, agentId)
      setUndo(text)
      setText(better)
    } catch (e) {
      toast(`Prompt enhancer: ${cleanError(e)}`, 'error')
    } finally {
      setEnhancing(false)
    }
  }

  const queue = rt?.queue ?? []
  return (
    <div className={`composer ${compact ? 'compact' : ''}`}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        addFiles(e.dataTransfer.files)
      }}>
      {queue.length > 0 && (
        <div className="queue">
          <div className="queue-head">
            <Icon name="list" size={12} /> Queued · sent one by one when {agent?.name} is free
            <div className="spacer" />
            <button className="link-btn" onClick={() => window.api.queue.edit(agentId, { clear: true })}>Clear</button>
          </div>
          {queue.map((q, i) => (
            <div key={q.id} className="queue-item">
              <span className="qn">{i + 1}</span>
              <span className="qt" title={q.text}>{q.text}</span>
              {i > 0 && <button className="icon-btn" title="Move up" onClick={() => window.api.queue.edit(agentId, { up: q.id })}><Icon name="chevronUp" size={12} /></button>}
              <button className="icon-btn" title="Send now" onClick={() => window.api.queue.edit(agentId, { sendNow: q.id })}><Icon name="send" size={12} /></button>
              <button className="icon-btn" title="Remove" onClick={() => window.api.queue.edit(agentId, { remove: q.id })}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {sketch && (
        <SketchEditor src={sketch.src} onClose={() => setSketch(null)} onSave={async (png) => {
          const a = await window.api.media.saveImage(png, 'png')
          setShots((x) => x.map((s, j) => (j === sketch.i ? a : s)))
          setSketch(null)
        }} />
      )}
      {shots.length > 0 && (
        <div className="shots">
          {shots.map((s, i) => (
            <div key={s.path} className="shot" title="Click to draw on it">
              <img src={s.dataUrl} alt="" onClick={async () => setSketch({ i, src: await window.api.media.readImage(s.path) })} />
              <button onClick={() => setShots(shots.filter((_, j) => j !== i))}><Icon name="x" size={11} /></button>
            </div>
          ))}
        </div>
      )}
      {slashOpen && (
        <div className="slash-menu" ref={slashList} onMouseDown={(e) => e.preventDefault()}>
          {slashItems.map((c, i) => (
            <button key={`${c.source}:${c.name}`} className={`slash-item ${i === slashSel ? 'on' : ''}`} onMouseEnter={() => setSlashSel(i)} onClick={() => pickSlash(c, true)}>
              <b className="mono">/{c.name}</b>
              <span className="slash-desc">{c.desc}</span>
              {c.source !== 'built-in' && <span className="slash-src">{c.source}</span>}
            </button>
          ))}
          <div className="slash-hint">↑↓ choose · Enter run · Tab add arguments · Esc close</div>
        </div>
      )}
      <textarea
        ref={ta}
        rows={compact ? 2 : 3}
        value={text}
        placeholder={
          !running
            ? 'Agent is stopped – type a task and press Enter to start it with that task'
            : busy && queueWhenBusy
              ? `${agent?.name} is working – Enter adds to the queue, ⌘Enter sends right away`
              : 'Give your agent a prompt or task: Enter to send, Shift+Enter for a new line'
        }
        onChange={(e) => setText(e.target.value)}
        onPaste={async (e) => {
          const files = Array.from(e.clipboardData.files)
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault()
            await addFiles(files)
          }
        }}
        onKeyDown={(e) => {
          if (slashOpen && !e.nativeEvent.isComposing) {
            const n = slashItems.length
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setSlashSel((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
              return
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault()
              const c = slashItems[Math.min(slashSel, n - 1)]
              // Enter runs the command, Tab completes it so you can add arguments
              pickSlash(c, e.key === 'Enter')
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setSlashOff(true)
              return
            }
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if ((e.metaKey || e.ctrlKey) && running) {
              const m = message()
              if (m) {
                window.api.input(agentId, m.includes('\n') ? `\x1b[200~${m}\x1b[201~` : m)
                setTimeout(() => window.api.input(agentId, '\r'), 80)
                setText('')
                setShots([])
              }
            } else send()
          }
        }}
      />
      <div className="composer-bar">
        <button className="btn ghost sm" title="Prompt library" onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setPicker({ x: r.left, y: r.top - 430 })
        }}>
          <Icon name="book" size={13} /> {compact ? '' : 'Prompts'}
        </button>
        {picker && agent && (
          <PromptPicker style={{ left: picker.x, top: Math.max(10, picker.y) }} onClose={() => setPicker(null)}
            onPick={(p, now) => {
              setPicker(null)
              if (now) sendPrompt([agent], p.body)
              else setText(promptFor(p.body, agent))
            }} />
        )}
        <button className="icon-btn" title="Attach a screenshot (⌘⇧2 works anywhere) – or paste / drop an image" onClick={screenshot}>
          <Icon name="camera" size={15} />
        </button>
        <FigmaButton />
        <button className={`icon-btn mic ${rec}`} title={rec === 'rec' ? 'Stop & transcribe' : 'Dictate'} onClick={mic}
          style={rec === 'rec' ? { ['--lvl' as string]: level } : undefined}>
          <Icon name={rec === 'busy' ? 'refresh' : 'mic'} size={15} />
        </button>
        <button className={`icon-btn ${enhancing ? 'spin' : ''}`} disabled={!text.trim() || enhancing} title="Enhance prompt (goal, context, constraints, done when)" onClick={enhance}>
          <Icon name="sparkle" size={15} />
        </button>
        {undo !== null && (
          <button className="link-btn" onClick={() => (setText(undo), setUndo(null))}>Undo enhance</button>
        )}
        {running && (
          <>
            <button className="icon-btn" title="Send Esc (interrupt the agent)" onClick={() => window.api.input(agentId, '\x1b')}><span className="kbd">esc</span></button>
            {!compact && <button className="icon-btn" title="Send Ctrl+C" onClick={() => window.api.input(agentId, '\x03')}><span className="kbd">^C</span></button>}
          </>
        )}
        <div className="spacer" />
        {running && busy && (
          <button className="btn ghost sm" disabled={!text.trim() && !shots.length} title="Add to queue" onClick={() => send('queue')}>
            <Icon name="list" size={13} /> Queue
          </button>
        )}
        <button className="send" disabled={!text.trim() && !shots.length} onClick={() => send()} title={running ? 'Send' : 'Start with this task'}>
          <Icon name={running ? 'send' : 'play'} size={16} />
        </button>
      </div>
    </div>
  )
}
