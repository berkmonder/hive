/**
 * QA browser for agents: a real Chromium window per agent (hidden until someone wants to watch)
 * driven through Hive's MCP tools – open a page, click, type, read text, console errors,
 * screenshots (saved as PNG files the agent can look at).
 */
import { app, BrowserWindow } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'

interface Tab {
  win: BrowserWindow
  log: string[]
}
const tabs = new Map<string, Tab>()
let quitting = false
app.on('before-quit', () => (quitting = true))

function tabFor(agentId: string, title: string): Tab {
  const cur = tabs.get(agentId)
  if (cur && !cur.win.isDestroyed()) return cur
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    title: `QA browser · ${title}`,
    webPreferences: { partition: 'persist:hive-qa', sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  const t: Tab = { win, log: [] }
  const push = (s: string): void => {
    t.log.push(s.slice(0, 600))
    if (t.log.length > 200) t.log.shift()
  }
  win.webContents.on('console-message', (e) => {
    const d = e as unknown as { level: string | number; message: string; lineNumber?: number; sourceId?: string }
    if (/Electron Security Warning/.test(d.message)) return
    const lv = typeof d.level === 'number' ? (['log', 'warn', 'error', 'error'][d.level] ?? 'log') : d.level === 'warning' ? 'warn' : d.level === 'error' ? 'error' : 'log'
    push(`[${lv}] ${d.message}${d.sourceId ? ` (${d.sourceId.split('/').pop()}:${d.lineNumber ?? 0})` : ''}`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => code !== -3 && push(`[load failed] ${desc} (${code}) ${url}`))
  win.webContents.on('render-process-gone', (_e, d) => push(`[crash] renderer ${d.reason}`))
  win.webContents.setWindowOpenHandler(({ url }) => {
    win.loadURL(url).catch(() => undefined)
    return { action: 'deny' }
  })
  win.on('close', (e) => {
    // closing the window only hides it – the agent keeps its session
    if (!quitting) {
      e.preventDefault()
      win.hide()
    }
  })
  tabs.set(agentId, t)
  return t
}

const js = (t: Tab, code: string): Promise<unknown> =>
  Promise.race([t.win.webContents.executeJavaScript(code, true), new Promise((_, j) => setTimeout(() => j(new Error('The page did not respond in 10 s')), 10_000))])
const S = (v: unknown): string => JSON.stringify(String(v ?? ''))

/** find an element by CSS selector, or by its visible text when the selector does not match */
const FIND = (sel: string): string => `(() => {
  const q = ${S(sel)};
  let el = null;
  try { el = document.querySelector(q) } catch {}
  if (!el) {
    const want = q.toLowerCase().trim();
    const cand = [...document.querySelectorAll('a,button,input,textarea,select,label,[role=button],[role=link],[role=tab],[role=menuitem],summary,[onclick]')];
    el = cand.find((e) => (e.innerText || e.value || e.getAttribute('aria-label') || e.placeholder || '').trim().toLowerCase() === want)
      || cand.find((e) => (e.innerText || e.value || e.getAttribute('aria-label') || e.placeholder || '').toLowerCase().includes(want));
  }
  return el;
})()`

async function waitLoad(t: Tab, ms = 15000): Promise<void> {
  if (!t.win.webContents.isLoading()) return
  await new Promise<void>((r) => {
    const done = (): void => {
      clearTimeout(timer)
      r()
    }
    const timer = setTimeout(done, ms)
    t.win.webContents.once('did-stop-loading', done)
  })
}

async function summary(t: Tab): Promise<string> {
  const info = (await js(t, `({ title: document.title, url: location.href, text: (document.body?.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 2500) })`)) as { title: string; url: string; text: string }
  const errors = t.log.filter((l) => l.startsWith('[error]') || l.startsWith('[load failed]') || l.startsWith('[crash]')).slice(-5)
  return [`${info.title || '(no title)'} – ${info.url}`, errors.length ? `Console errors:\n${errors.join('\n')}` : '', `Page text:\n${info.text}`].filter(Boolean).join('\n\n')
}

export const BROWSER_TOOLS = [
  { name: 'browser_open', description: "Open a URL in Hive's QA browser (a real Chromium, e.g. your dev server http://localhost:5173). Returns title, console errors and the visible text.", inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'browser_click', description: 'Click an element by CSS selector or by its visible text / label. Returns the page afterwards.', inputSchema: { type: 'object', properties: { target: { type: 'string', description: 'CSS selector or visible text' } }, required: ['target'] } },
  { name: 'browser_type', description: 'Type into an input (CSS selector, label or placeholder text). submit=true presses Enter / submits the form.', inputSchema: { type: 'object', properties: { target: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['target', 'text'] } },
  { name: 'browser_text', description: 'Visible text of the page or of one element (CSS selector).', inputSchema: { type: 'object', properties: { selector: { type: 'string' } } } },
  { name: 'browser_console', description: 'Console messages, failed requests and crashes since the last call.', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_screenshot', description: 'Screenshot of the page; returns the path of a PNG file you can open to look at it. width lets you check mobile layouts (e.g. 390).', inputSchema: { type: 'object', properties: { width: { type: 'number' } } } },
  { name: 'browser_eval', description: 'Run JavaScript in the page and return the JSON result (for checks a selector cannot do).', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'browser_show', description: 'Show the QA browser window to the user (so they can watch or take over).', inputSchema: { type: 'object', properties: {} } }
]

export async function browserTool(agentId: string, agentName: string, name: string, args: Record<string, unknown>): Promise<string> {
  const t = tabFor(agentId, agentName)
  switch (name) {
    case 'browser_open': {
      let url = String(args.url ?? '').trim()
      if (!/^(https?|file):\/\//i.test(url)) url = `http://${url}`
      t.log = []
      await t.win.loadURL(url).catch((e) => t.log.push(`[load failed] ${(e as Error).message}`))
      await waitLoad(t)
      return summary(t)
    }
    case 'browser_click': {
      const ok = await js(t, `(() => { const el = ${FIND(String(args.target))}; if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true })()`)
      if (!ok) throw new Error(`Nothing matches "${args.target}"`)
      await new Promise((r) => setTimeout(r, 400))
      await waitLoad(t)
      return summary(t)
    }
    case 'browser_type': {
      const ok = await js(
        t,
        `(() => { let el = ${FIND(String(args.target))}; if (el && el.tagName === 'LABEL' && el.control) el = el.control; if (!el) return false;
          el.focus(); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set; set ? set.call(el, ${S(args.text)}) : (el.value = ${S(args.text)});
          el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
          ${args.submit ? `el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); if (el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();` : ''}
          return true })()`
      )
      if (!ok) throw new Error(`No input matches "${args.target}"`)
      await new Promise((r) => setTimeout(r, 400))
      await waitLoad(t)
      return args.submit ? summary(t) : 'Typed.'
    }
    case 'browser_text': {
      const sel = String(args.selector ?? '')
      const text = await js(t, sel ? `(() => { const el = ${FIND(sel)}; return el ? el.innerText : null })()` : `document.body?.innerText`)
      if (text === null) throw new Error(`Nothing matches "${sel}"`)
      return String(text).slice(0, 8000)
    }
    case 'browser_console': {
      const out = t.log.splice(0)
      return out.length ? out.join('\n') : '(no console messages)'
    }
    case 'browser_screenshot': {
      const w = Number(args.width) || 0
      const [ow, oh] = t.win.getContentSize()
      if (w) {
        t.win.setContentSize(Math.max(320, Math.min(2560, w)), oh)
        await new Promise((r) => setTimeout(r, 500))
      }
      const img = await t.win.webContents.capturePage()
      if (w) t.win.setContentSize(ow, oh)
      const dir = join(app.getPath('userData'), 'qa-shots')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `${agentId.slice(0, 8)}-${Date.now()}.png`)
      const { writeFileSync } = await import('fs')
      writeFileSync(file, img.toPNG())
      return `Saved ${img.getSize().width}×${img.getSize().height} screenshot: ${file}\nOpen that file to look at it.`
    }
    case 'browser_eval': {
      const r = await js(t, `(async () => { const v = await (async () => { ${String(args.code)} })(); try { return JSON.stringify(v) } catch { return String(v) } })()`)
      return String(r ?? 'undefined').slice(0, 8000)
    }
    case 'browser_show':
      t.win.show()
      return 'The QA browser is now visible to the user.'
  }
  throw new Error(`Unknown browser tool ${name}`)
}

export const showQaBrowser = (agentId: string): boolean => {
  const t = tabs.get(agentId)
  if (!t || t.win.isDestroyed()) return false
  t.win.show()
  return true
}
export const closeQaBrowser = (agentId: string): void => {
  const t = tabs.get(agentId)
  tabs.delete(agentId)
  if (t && !t.win.isDestroyed()) t.win.destroy()
}
