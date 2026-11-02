/** Mock APIs: list (in the Servers sidebar) and editor (routes, settings, live request log). */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MockLogEntry, MockRoute, MockServer } from '@shared/types'
import { useStore } from '../store'
import { Icon, cleanError } from './common'

const rid = (): string => `r-${Math.random().toString(36).slice(2, 10)}`
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ANY']
const toast = (t: string, k: 'info' | 'success' | 'error' = 'info'): void => useStore.getState().toast(t, k)
const err = (e: unknown): void => toast(cleanError(e), 'error')

export function useMockState(): Record<string, boolean> {
  const [st, setSt] = useState<Record<string, boolean>>({})
  useEffect(() => {
    window.api.mocks.state().then(setSt).catch(() => undefined)
    return window.api.mocks.onState(setSt)
  }, [])
  return st
}

export function MockList({ projectId, sel, onSel }: { projectId: string; sel: string | null; onSel: (id: string) => void }) {
  const list = useStore((s) => s.app.mocks ?? []).filter((m) => m.projectId === projectId)
  const st = useMockState()
  const add = async (): Promise<void> => {
    const port = await window.api.mocks.freePort()
    const m: MockServer = {
      id: `mock-${Math.random().toString(36).slice(2, 9)}`, projectId, name: list.length ? `api-${list.length + 1}` : 'api', port, autoStart: true,
      routes: [
        { id: rid(), method: 'GET', path: '/users', status: 200, body: JSON.stringify([{ id: 1, name: 'Ada Lovelace' }, { id: 2, name: 'Alan Turing' }], null, 2), enabled: true },
        { id: rid(), method: 'GET', path: '/users/:id', status: 200, body: '{\n  "id": "{{params.id}}",\n  "name": "User {{params.id}}"\n}', enabled: true },
        { id: rid(), method: 'POST', path: '/users', status: 201, body: '{\n  "id": "{{uuid}}",\n  "name": "{{body.name}}",\n  "createdAt": "{{now}}"\n}', enabled: true }
      ]
    }
    await window.api.mocks.save(m)
    await window.api.mocks.start(m.id).catch(err)
    onSel(m.id)
  }
  return (
    <>
      <div className="srv-head" style={{ marginTop: 14 }}>
        <b>Mock APIs</b>
        <div className="spacer" />
        <button className="icon-btn" title="New mock API" onClick={add}><Icon name="plus" size={15} /></button>
      </div>
      {list.map((m) => (
        <div key={m.id} role="button" tabIndex={0} className={`srv-item ${m.id === sel ? 'on' : ''}`} onClick={() => onSel(m.id)}>
          <i className={`dot ${st[m.id] ? 'done' : 'idle'}`} />
          <div className="srv-txt">
            <b>{m.name}</b>
            <span className="mono">localhost:{m.port} · {m.routes.length} routes</span>
          </div>
          <span className="row-actions" onClick={(e) => e.stopPropagation()}>
            {st[m.id] ? (
              <button className="icon-btn danger" title="Stop" onClick={() => window.api.mocks.stop(m.id)}><Icon name="power" size={14} /></button>
            ) : (
              <button className="icon-btn" title="Start" onClick={() => window.api.mocks.start(m.id).catch(err)}><Icon name="play" size={14} /></button>
            )}
          </span>
        </div>
      ))}
      {list.length === 0 && <p className="muted small pad">Fake a backend: fixed routes with JSON answers, CORS included. Agents can add routes too.</p>}
    </>
  )
}

export function MockEditor({ id, onGone }: { id: string; onGone: () => void }) {
  const saved = useStore((s) => (s.app.mocks ?? []).find((m) => m.id === id))
  const st = useMockState()
  const [m, setM] = useState<MockServer | null>(saved ?? null)
  const [sel, setSel] = useState<string | null>(saved?.routes[0]?.id ?? null)
  const [log, setLog] = useState<MockLogEntry[]>([])
  const [tool, setTool] = useState<null | 'ai' | 'openapi'>(null)
  const [toolText, setToolText] = useState('')
  const [busy, setBusy] = useState(false)
  const [tryOut, setTryOut] = useState<string>('')
  const dirty = useRef(false)

  // take outside changes (agents adding routes, record mode) unless we are editing right now
  useEffect(() => {
    if (saved && !dirty.current) setM(saved)
  }, [saved])
  useEffect(() => {
    setSel(saved?.routes[0]?.id ?? null)
    window.api.mocks.logs(id).then(setLog).catch(() => undefined)
    return window.api.mocks.onLog((e) => e.mockId === id && setLog((l) => [...l, e].slice(-300)))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  // autosave
  useEffect(() => {
    if (!m || !dirty.current) return
    const t = setTimeout(() => {
      dirty.current = false
      window.api.mocks.save(m).catch(err)
    }, 450)
    return () => clearTimeout(t)
  }, [m])
  const route = m?.routes.find((r) => r.id === sel)
  const base = m ? `http://localhost:${m.port}` : ''
  const running = !!st[id]
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of log) if (e.routeId) c[e.routeId] = (c[e.routeId] ?? 0) + 1
    return c
  }, [log])
  if (!m) return null

  const patch = (p: Partial<MockServer>): void => {
    dirty.current = true
    setM({ ...m, ...p })
  }
  const patchRoute = (p: Partial<MockRoute>): void => patch({ routes: m.routes.map((r) => (r.id === sel ? { ...r, ...p } : r)) })
  const addRoute = (): void => {
    const r: MockRoute = { id: rid(), method: 'GET', path: '/new', status: 200, body: '{\n  "ok": true\n}', enabled: true }
    patch({ routes: [...m.routes, r] })
    setSel(r.id)
  }
  const restart = async (): Promise<void> => {
    await window.api.mocks.save(m)
    dirty.current = false
    await window.api.mocks.start(id).catch(err)
  }
  const runTool = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.mocks.save(m)
      dirty.current = false
      const n = tool === 'ai' ? await window.api.mocks.generate(id, toolText) : await window.api.mocks.openapi(id, toolText)
      toast(`Added ${n} route${n === 1 ? '' : 's'}`, 'success')
      setTool(null)
      setToolText('')
    } catch (e) {
      err(e)
    } finally {
      setBusy(false)
    }
  }
  const tryRoute = async (): Promise<void> => {
    if (!route) return
    const path = route.path.replace(/:(\w+)/g, '1').replace(/\*$/, 'x')
    try {
      const r = await window.api.mocks.try(base + path, route.method === 'ANY' ? 'GET' : route.method, ['GET', 'ANY', 'DELETE'].includes(route.method) ? undefined : '{"name":"Test"}')
      setTryOut(`${r.status} · ${r.ms} ms\n\n${r.text}`)
    } catch (e) {
      setTryOut(`Request failed: ${(e as Error).message}${running ? '' : ' – start the mock first'}`)
    }
  }
  let bodyErr = ''
  if (route?.body.trim().startsWith('{') || route?.body.trim().startsWith('[')) {
    try {
      JSON.parse(route.body.replace(/\{\{[^}]+\}\}/g, '0'))
    } catch (e) {
      bodyErr = (e as Error).message
    }
  }

  return (
    <div className="mock-ed">
      <header className="srv-bar">
        <i className={`dot ${running ? 'done' : 'idle'}`} />
        <input className="mock-name" value={m.name} onChange={(e) => patch({ name: e.target.value.replace(/\s+/g, '-') })} />
        <span className="muted small">port</span>
        <input className="mono mock-port" type="number" value={m.port} onChange={(e) => patch({ port: Number(e.target.value) || m.port })} />
        <button className="link-btn mono" title="Copy the base URL" onClick={() => window.api.copyText(base).then(() => toast('Base URL copied', 'success'))}>{base}</button>
        <div className="spacer" />
        {running ? (
          <>
            <button className="btn ghost sm" onClick={restart}><Icon name="restart" size={13} /> Restart</button>
            <button className="btn ghost sm" onClick={() => window.api.mocks.stop(id)}><Icon name="power" size={13} /> Stop</button>
          </>
        ) : (
          <button className="btn sm" onClick={restart}><Icon name="play" size={13} /> Start</button>
        )}
        <button className="icon-btn danger" title="Delete mock" onClick={() => {
          if (!confirm(`Delete mock "${m.name}"?`)) return
          window.api.mocks.remove(id).then(onGone)
        }}><Icon name="trash" size={14} /></button>
      </header>
      <div className="mock-opts">
        <label>Unmatched requests go to <input className="mono" placeholder="https://api.example.com (optional)" value={m.fallbackUrl ?? ''} onChange={(e) => patch({ fallbackUrl: e.target.value || undefined })} /></label>
        <label className="check" title="Save the real backend's answers as routes"><input type="checkbox" disabled={!m.fallbackUrl} checked={!!m.record} onChange={(e) => patch({ record: e.target.checked })} /> Record</label>
        <label>Latency <input type="number" min={0} step={50} style={{ width: 80 }} value={m.latencyMs ?? 0} onChange={(e) => patch({ latencyMs: Number(e.target.value) || undefined })} /> ms</label>
        <label className="check"><input type="checkbox" checked={m.autoStart} onChange={(e) => patch({ autoStart: e.target.checked })} /> Start with Hive</label>
      </div>
      <div className="mock-body">
        <aside className="mock-routes">
          {m.routes.map((r) => (
            <button key={r.id} className={`mock-route ${r.id === sel ? 'on' : ''} ${r.enabled ? '' : 'off'}`} onClick={() => setSel(r.id)}>
              <span className={`mm m-${r.method.toLowerCase()}`}>{r.method}</span>
              <span className="mono mp">{r.path}</span>
              <span className={`ms s${String(r.status)[0]}`}>{r.status}</span>
              {counts[r.id] ? <sup>{counts[r.id]}</sup> : null}
            </button>
          ))}
          <div className="mock-route-actions">
            <button className="btn ghost sm" onClick={addRoute}><Icon name="plus" size={12} /> Route</button>
            <button className="btn ghost sm" title="Describe the API – Claude writes the routes" onClick={() => setTool('ai')}><Icon name="sparkle" size={12} /> Generate</button>
            <button className="btn ghost sm" title="Paste an OpenAPI / Swagger JSON" onClick={() => setTool('openapi')}><Icon name="inbox" size={12} /> OpenAPI</button>
          </div>
        </aside>
        <section className="mock-route-ed">
          {route ? (
            <>
              <div className="row">
                <select value={route.method} onChange={(e) => patchRoute({ method: e.target.value })} style={{ width: 100 }}>
                  {METHODS.map((x) => <option key={x}>{x}</option>)}
                </select>
                <input className="mono" style={{ flex: 1 }} value={route.path} onChange={(e) => patchRoute({ path: e.target.value.startsWith('/') || e.target.value === '*' ? e.target.value : `/${e.target.value}` })} />
                <input className="mono" type="number" title="Status" style={{ width: 80 }} value={route.status} onChange={(e) => patchRoute({ status: Number(e.target.value) || 200 })} />
                <input type="number" title="Delay (ms)" placeholder="delay" style={{ width: 80 }} value={route.delayMs ?? ''} onChange={(e) => patchRoute({ delayMs: Number(e.target.value) || undefined })} />
                <label className="check"><input type="checkbox" checked={route.enabled} onChange={(e) => patchRoute({ enabled: e.target.checked })} /> On</label>
              </div>
              <label>Response body <small className="muted">{'{{params.id}} {{query.q}} {{body.name}} {{uuid}} {{now}}'}</small>
                <textarea className="mono" rows={9} spellCheck={false} value={route.body} onChange={(e) => patchRoute({ body: e.target.value })} />
              </label>
              {bodyErr && <p className="mock-warn">JSON: {bodyErr}</p>}
              <label>Headers <small className="muted">one per line, e.g. X-Total-Count: 42</small>
                <textarea className="mono" rows={2} value={route.headers ?? ''} onChange={(e) => patchRoute({ headers: e.target.value || undefined })} />
              </label>
              <div className="row">
                <button className="btn ghost sm" onClick={tryRoute}><Icon name="send" size={12} /> Try it</button>
                <button className="btn ghost sm" onClick={() => window.api.copyText(`curl -X ${route.method === 'ANY' ? 'GET' : route.method} '${base}${route.path.replace(/:(\w+)/g, '1')}'`).then(() => toast('curl copied', 'success'))}>curl</button>
                <div className="spacer" />
                <button className="btn ghost sm danger-text" onClick={() => {
                  patch({ routes: m.routes.filter((r) => r.id !== route.id) })
                  setSel(m.routes.find((r) => r.id !== route.id)?.id ?? null)
                }}><Icon name="trash" size={12} /> Delete route</button>
              </div>
              {tryOut && <pre className="mock-try mono" onClick={() => setTryOut('')}>{tryOut}</pre>}
            </>
          ) : (
            <div className="muted small pad">Add a route, generate them from a description, or import an OpenAPI file.</div>
          )}
        </section>
      </div>
      <section className="mock-log">
        <div className="row">
          <b>Requests</b><span className="muted small">{log.length}</span>
          <div className="spacer" />
          <button className="link-btn" onClick={() => window.api.mocks.clearLogs(id).then(() => setLog([]))}>Clear</button>
        </div>
        <div className="mock-log-list mono">
          {log.length === 0 && <span className="muted">Point your app at {base} – requests show up here.</span>}
          {[...log].reverse().slice(0, 120).map((e, i) => (
            <div key={i} className={`ml s${String(e.status)[0]}`} title={e.body || ''} onClick={() => e.routeId && setSel(e.routeId)}>
              <span className="muted">{new Date(e.at).toLocaleTimeString()}</span>
              <span className={`mm m-${e.method.toLowerCase()}`}>{e.method}</span>
              <span className="mp">{e.path}</span>
              <span className="ms">{e.status}</span>
              <span className="muted">{e.ms} ms{e.proxied ? ' · fallback' : !e.routeId ? ' · no route' : ''}</span>
            </div>
          ))}
        </div>
      </section>
      {tool && (
        <div className="backdrop" onMouseDown={() => !busy && setTool(null)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>{tool === 'ai' ? 'Generate routes' : 'Import OpenAPI'}</h2>
            <p className="muted small">{tool === 'ai' ? 'Describe the API – resources, fields, what the app needs. Your Claude Code writes realistic routes and answers.' : 'Paste an OpenAPI 3 or Swagger 2 document (JSON). Every path becomes a route with its example (or a sample built from the schema).'}</p>
            <textarea rows={10} className={tool === 'openapi' ? 'mono' : ''} autoFocus value={toolText} placeholder={tool === 'ai' ? 'e.g. A shop: products with name, price, stock and images; carts; orders with status; login that returns a JWT.' : '{ "openapi": "3.0.0", "paths": { … } }'} onChange={(e) => setToolText(e.target.value)} />
            <div className="modal-foot">
              <button className="btn ghost" disabled={busy} onClick={() => setTool(null)}>Cancel</button>
              <button className="btn" disabled={busy || !toolText.trim()} onClick={runTool}>{busy ? 'Working…' : tool === 'ai' ? 'Generate' : 'Import'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
