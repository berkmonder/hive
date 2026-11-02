import { useEffect, useMemo, useRef, useState } from 'react'
import type { DevServer, PickedElement } from '@shared/types'
import { useStore } from '../store'
import { clamp, useLayout } from '../layout'
import { Terminal } from './Terminal'
import { Resizer } from './Resizer'
import { Icon, cleanError } from './common'
import { MockEditor, MockList } from './Mocks'

const uid = (): string => `srv-${Math.random().toString(36).slice(2, 9)}`
const DEVICES = { desktop: { w: 0, label: 'Desktop', icon: 'monitor' }, tablet: { w: 820, label: 'Tablet', icon: 'tablet' }, mobile: { w: 390, label: 'Mobile', icon: 'phone' } } as const
type Device = keyof typeof DEVICES

/** Dev servers of the current project with a terminal and a live preview. */
export function ServersView() {
  const { app, selectedProjectId, serverRuntimes, toast } = useStore()
  const L = useLayout()
  const project = app.projects.find((p) => p.id === selectedProjectId)!
  const list = app.servers.filter((s) => s.projectId === project.id)
  const [sel, setSel] = useState<string | null>(list[0]?.id ?? null)
  const [mockSel, setMockSel] = useState<string | null>(null)
  const [tab, setTab] = useState<'preview' | 'terminal'>('terminal')
  const [editing, setEditing] = useState<DevServer | null>(null)
  const [suggestions, setSuggestions] = useState<{ name: string; command: string; cwd: string }[]>([])
  const base = useRef(0)

  useEffect(() => {
    if (!sel || !list.some((s) => s.id === sel)) setSel(list[0]?.id ?? null)
  }, [list, sel])
  useEffect(() => {
    window.api.servers.suggest(project.id).then(setSuggestions).catch(() => setSuggestions([]))
  }, [project.id, list.length])

  const cur = list.find((s) => s.id === sel)
  const rt = cur ? serverRuntimes[cur.id] : undefined
  const url = cur?.url || rt?.url
  // jump to the preview the first time a URL shows up
  const seenUrl = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (url && url !== seenUrl.current) {
      seenUrl.current = url
      setTab('preview')
    }
  }, [url])

  const run = (p: Promise<unknown>): void => void p.catch((e) => toast(cleanError(e), 'error'))
  const add = async (s: { name: string; command: string; cwd: string }, start = true): Promise<void> => {
    const srv: DevServer = { id: uid(), projectId: project.id, name: s.name, command: s.command, cwd: s.cwd }
    await window.api.servers.save(srv)
    setSel(srv.id)
    setTab('terminal')
    if (start) run(window.api.servers.start(srv.id))
  }
  const unused = suggestions.filter((s) => !list.some((x) => x.command === s.command && x.cwd === s.cwd))

  return (
    <div className="servers-view" style={{ gridTemplateColumns: `${L.serversW}px 6px minmax(0, 1fr)` }}>
      <aside className="srv-list">
        <div className="srv-head">
          <b>Dev servers</b>
          <div className="spacer" />
          <button className="icon-btn" title="Add server" onClick={() => setEditing({ id: uid(), projectId: project.id, name: '', command: '', cwd: '' })}>
            <Icon name="plus" size={15} />
          </button>
        </div>
        {list.map((s) => {
          const r = serverRuntimes[s.id]
          const u = s.url || r?.url
          return (
            <div key={s.id} role="button" tabIndex={0} className={`srv-item ${s.id === sel && !mockSel ? 'on' : ''}`} onClick={() => { setSel(s.id); setMockSel(null) }}>
              <i className={`dot ${r?.running ? (u ? 'done' : 'working') : r?.exitCode ? 'waiting' : 'idle'}`} />
              <div className="srv-txt">
                <b>{s.name}</b>
                <span className="mono">{u ?? (s.cwd ? `${s.cwd}/ · ` : '') + s.command}</span>
              </div>
              <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                {r?.running ? (
                  <button className="icon-btn danger" title="Stop" onClick={() => run(window.api.servers.stop(s.id))}><Icon name="power" size={14} /></button>
                ) : (
                  <button className="icon-btn" title="Start" onClick={() => run(window.api.servers.start(s.id))}><Icon name="play" size={14} /></button>
                )}
              </span>
            </div>
          )
        })}
        {list.length === 0 && <p className="muted small pad">No dev servers yet.</p>}
        {unused.length > 0 && (
          <>
            <div className="card-title" style={{ margin: '14px 6px 6px' }}>Suggested</div>
            {unused.map((s) => (
              <button key={s.cwd + s.command} className="srv-suggest" onClick={() => add(s)} title={`Add and start: ${s.command}`}>
                <Icon name="plus" size={13} />
                <div className="srv-txt">
                  <b>{s.name}</b>
                  <span className="mono">{(s.cwd ? `${s.cwd}/ · ` : '') + s.command}</span>
                </div>
              </button>
            ))}
          </>
        )}
        <MockList projectId={project.id} sel={mockSel} onSel={setMockSel} />
      </aside>
      <Resizer axis="x" onStart={() => (base.current = L.serversW)} onDrag={(d) => L.set({ serversW: clamp(base.current + d, 200, 480) })} onReset={() => L.reset('serversW')} />

      <section className="srv-main">
        {mockSel ? (
          <MockEditor key={mockSel} id={mockSel} onGone={() => setMockSel(null)} />
        ) : !cur ? (
          <div className="welcome">
            <Icon name="server" size={28} />
            <p className="muted">Run your app's dev server here and preview it while agents work.</p>
            <button className="btn" onClick={() => setEditing({ id: uid(), projectId: project.id, name: 'dev', command: 'npm run dev', cwd: '' })}>
              <Icon name="plus" /> Add a dev server
            </button>
          </div>
        ) : (
          <>
            <header className="srv-bar">
              <div className="seg sm">
                <button className={tab === 'terminal' ? 'on' : ''} onClick={() => setTab('terminal')} style={{ width: 'auto', padding: '0 12px' }}>
                  <Icon name="terminal" size={13} /> Terminal
                </button>
                <button className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')} style={{ width: 'auto', padding: '0 12px' }}>
                  <Icon name="eye" size={13} /> Preview
                </button>
              </div>
              <b className="srv-title">{cur.name}</b>
              <span className="mono muted small">{(cur.cwd ? `${cur.cwd}/ $ ` : '$ ') + cur.command}</span>
              <div className="spacer" />
              {rt?.running ? (
                <>
                  <button className="btn ghost sm" onClick={() => run(window.api.servers.stop(cur.id).then(() => new Promise((r) => setTimeout(r, 1700))).then(() => window.api.servers.start(cur.id)))}>
                    <Icon name="restart" size={13} /> Restart
                  </button>
                  <button className="btn ghost sm" onClick={() => run(window.api.servers.stop(cur.id))}><Icon name="power" size={13} /> Stop</button>
                </>
              ) : (
                <button className="btn sm" onClick={() => run(window.api.servers.start(cur.id))}><Icon name="play" size={13} /> Start</button>
              )}
              <button className="icon-btn" title="Edit" onClick={() => setEditing({ ...cur })}><Icon name="edit" size={14} /></button>
            </header>
            <div className="srv-body">
              <div className="srv-term" style={{ display: tab === 'terminal' ? 'block' : 'none' }}>
                {rt ? <Terminal key={cur.id} agentId={cur.id} source="server" /> : (
                  <div className="empty-term">
                    <p>Not running</p>
                    <button className="btn" onClick={() => run(window.api.servers.start(cur.id))}><Icon name="play" /> Start</button>
                  </div>
                )}
              </div>
              {tab === 'preview' && <Preview key={cur.id} url={url} running={!!rt?.running} projectPath={project.path} />}
            </div>
          </>
        )}
      </section>

      {editing && (
        <ServerDialog server={editing} isNew={!list.some((s) => s.id === editing.id)} onClose={() => setEditing(null)}
          onSaved={(s) => { setSel(s.id); setEditing(null) }} />
      )}
    </div>
  )
}

function Preview({ url, running, projectPath }: { url?: string; running: boolean; projectPath: string }) {
  const L = useLayout()
  const [address, setAddress] = useState(url ?? '')
  const [src, setSrc] = useState(url ?? '')
  const [nonce, setNonce] = useState(0)
  const [device, setDevice] = useState<Device>('desktop')
  useEffect(() => {
    if (url) {
      setAddress(url)
      setSrc(url)
    }
  }, [url])
  // reload when agents (or you) change project files, if enabled
  useEffect(() => {
    if (!L.previewAutoReload) return
    window.api.fs.watch(projectPath)
    let t: ReturnType<typeof setTimeout>
    const off = window.api.fs.onChanged(({ root }) => {
      if (root !== projectPath) return
      clearTimeout(t)
      t = setTimeout(() => setNonce((n) => n + 1), 900)
    })
    return () => {
      clearTimeout(t)
      off()
      window.api.fs.unwatch(projectPath)
    }
  }, [L.previewAutoReload, projectPath])

  const go = (): void => {
    let u = address.trim()
    if (u && !/^https?:\/\//.test(u)) u = `http://${u}`
    setAddress(u)
    setSrc(u)
    setNonce((n) => n + 1)
  }
  const width = DEVICES[device].w
  const [picking, setPicking] = useState(false)
  const [share, setShare] = useState<{ url?: string; busy?: boolean } | null>(null)
  const port = (() => {
    try {
      return Number(new URL(src).port) || (src.startsWith('https') ? 443 : 80)
    } catch {
      return 0
    }
  })()
  const toggleShare = async (): Promise<void> => {
    if (share?.url) {
      await window.api.tunnel.close(port)
      setShare(null)
      return
    }
    setShare({ busy: true })
    try {
      const r = await window.api.tunnel.open(port)
      setShare({ url: r.url })
      await window.api.copyText(r.url)
      useStore.getState().toast(`Public URL copied (${r.tool}) – anyone with the link can open it`, 'success')
    } catch (e) {
      setShare(null)
      useStore.getState().toast(cleanError(e), 'error')
    }
  }
  const [picked, setPicked] = useState<PickedElement | null>(null)
  const pick = async (): Promise<void> => {
    if (picking) {
      window.api.extras.cancelPick(src)
      return
    }
    setPicking(true)
    try {
      const el = await window.api.extras.pick(src)
      if (el) setPicked(el)
    } catch (e) {
      useStore.getState().toast(cleanError(e), 'error')
    } finally {
      setPicking(false)
    }
  }
  return (
    <div className="preview">
      <div className="pv-bar">
        <button className="icon-btn" title="Reload" onClick={() => setNonce((n) => n + 1)}><Icon name="refresh" size={14} /></button>
        <input className="mono" value={address} placeholder={running ? 'Waiting for the server to print its URL…' : 'http://localhost:3000'}
          onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <div className="seg sm">
          {(Object.keys(DEVICES) as Device[]).map((d) => (
            <button key={d} className={device === d ? 'on' : ''} title={DEVICES[d].label} onClick={() => setDevice(d)}>
              <Icon name={DEVICES[d].icon} size={13} />
            </button>
          ))}
        </div>
        <label className="pv-auto" title="Reload the preview when project files change">
          <input type="checkbox" checked={L.previewAutoReload} onChange={(e) => L.set({ previewAutoReload: e.target.checked })} /> Auto-reload
        </label>
        <button className={`btn ${share?.url ? '' : 'ghost'} sm`} disabled={!src || !port || share?.busy} title="Share on a public HTTPS URL (Cloudflare quick tunnel, or localtunnel)" onClick={toggleShare}>
          <Icon name="external" size={13} /> {share?.busy ? 'Opening…' : share?.url ? 'Stop sharing' : 'Share'}
        </button>
        {share?.url && <button className="chip share-url mono" title="Copy" onClick={() => window.api.copyText(share.url!)}>{share.url.replace('https://', '')}</button>}
        <button className={`btn ${picking ? '' : 'ghost'} sm`} disabled={!src} title="Click an element in the preview to send it to an agent (Esc cancels)" onClick={pick}>
          <Icon name="target" size={13} /> {picking ? 'Click an element… (Esc)' : 'Pick element'}
        </button>
        <button className="icon-btn" title="Open in browser" disabled={!src} onClick={() => window.api.openLink(src)}><Icon name="external" size={14} /></button>
      </div>
      {picked && <PickDialog el={picked} onClose={() => setPicked(null)} />}
      <div className={`pv-stage ${width ? 'framed' : ''} ${picking ? 'picking' : ''}`}>
        {src ? (
          <iframe
            key={`${src}#${nonce}`}
            src={src}
            title="Preview"
            style={width ? { width, maxWidth: '100%' } : undefined}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
          />
        ) : (
          <div className="empty-term muted">
            <p>{running ? 'No URL detected yet – type one above or wait for the server to start.' : 'Start the server to see a preview.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ServerDialog({ server, isNew, onClose, onSaved }: { server: DevServer; isNew: boolean; onClose: () => void; onSaved: (s: DevServer) => void }) {
  const [s, setS] = useState(server)
  const toast = useStore((st) => st.toast)
  const valid = useMemo(() => s.name.trim() && s.command.trim(), [s])
  const save = async (start: boolean): Promise<void> => {
    if (!valid) return
    const v = { ...s, name: s.name.trim(), command: s.command.trim(), cwd: s.cwd.trim().replace(/^\.?\/*|\/+$/g, ''), url: s.url?.trim() || undefined }
    await window.api.servers.save(v)
    onSaved(v)
    if (start) window.api.servers.start(v.id).catch((e) => toast(cleanError(e), 'error'))
  }
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => (e.preventDefault(), save(isNew))}>
        <div className="modal-head">
          <h2>{isNew ? 'Add dev server' : 'Edit dev server'}</h2>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" /></button>
        </div>
        <label>Name<input autoFocus value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="web" /></label>
        <label>Command<input className="mono" value={s.command} onChange={(e) => setS({ ...s, command: e.target.value })} placeholder="npm run dev" /></label>
        <label>Folder (inside the project)<input className="mono" value={s.cwd} onChange={(e) => setS({ ...s, cwd: e.target.value })} placeholder="(project root)" /></label>
        <label>Preview URL (optional)
          <input className="mono" value={s.url ?? ''} onChange={(e) => setS({ ...s, url: e.target.value })} placeholder="detected automatically from the output" />
        </label>
        <div className="modal-foot">
          {!isNew && (
            <button type="button" className="btn ghost danger-text" onClick={async () => {
              if (!confirm(`Remove "${server.name}"?`)) return
              await window.api.servers.remove(server.id)
              onClose()
            }}><Icon name="trash" size={13} /> Remove</button>
          )}
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          {isNew ? <button className="btn" disabled={!valid}>Add &amp; start</button> : <button type="button" className="btn" disabled={!valid} onClick={() => save(false)}>Save</button>}
        </div>
      </form>
    </div>
  )
}

function PickDialog({ el, onClose }: { el: PickedElement; onClose: () => void }) {
  const { app, selectedProjectId, focusedAgentId, toast } = useStore()
  const agents = app.agents.filter((a) => a.projectId === selectedProjectId)
  const [agentId, setAgentId] = useState(focusedAgentId && agents.some((a) => a.id === focusedAgentId) ? focusedAgentId : agents[0]?.id ?? '')
  const [note, setNote] = useState('')
  const send = (): void => {
    const text = [
      note.trim() || 'Look at this element:',
      '',
      `Element in the running app (${el.url}):`,
      `- selector: \`${el.selector}\``,
      `- <${el.tag}> ${el.size}${el.text ? ` · text: "${el.text}"` : ''}`,
      `- ${el.style}`,
      '```html',
      el.html,
      '```'
    ].join('\n')
    window.api.queue.add(agentId, text).then(() => (toast('Sent to agent', 'success'), onClose())).catch((e) => toast(cleanError(e), 'error'))
  }
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2><Icon name="target" size={15} /> Send element to an agent</h2>
        <div className="picked">
          <code>{el.selector}</code>
          <span className="muted small">&lt;{el.tag}&gt; · {el.size}{el.text ? ` · “${el.text.slice(0, 60)}”` : ''}</span>
        </div>
        <label>What should change?<textarea autoFocus rows={3} value={note} placeholder="e.g. Make this button full width on mobile and use the accent colour" onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send()} /></label>
        <label>Agent
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
          </select>
        </label>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!agentId} onClick={send}><Icon name="send" size={13} /> Send</button>
        </div>
      </div>
    </div>
  )
}
