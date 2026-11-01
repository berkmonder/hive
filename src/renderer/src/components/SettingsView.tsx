import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_PROVIDERS, type AppSettings, type Provider } from '@shared/types'
import { ACCENTS, THEMES, useStore, type ThemeId } from '../store'
import { FONTS, LAYOUT_DEFAULTS, fontStack, useLayout, type Layout } from '../layout'
import { HiveLogo, Icon, cleanError } from './common'
import { AccountsSettings, CloneRepoModal } from './More'

type Section = 'projects' | 'appearance' | 'terminal' | 'editor' | 'agents' | 'input' | 'notifications' | 'about'
const SECTIONS: { id: Section; name: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'projects', name: 'Projects', icon: 'folder' },
  { id: 'appearance', name: 'Appearance', icon: 'palette' },
  { id: 'terminal', name: 'Terminal', icon: 'terminal' },
  { id: 'editor', name: 'Editor & review', icon: 'code' },
  { id: 'agents', name: 'Agents & CLIs', icon: 'cpu' },
  { id: 'input', name: 'Input & AI helpers', icon: 'mic' },
  { id: 'notifications', name: 'Notifications', icon: 'bell' },
  { id: 'about', name: 'About & data', icon: 'info' }
]

export function SettingsView() {
  const [section, setSection] = useState<Section>(() => {
    try {
      return (sessionStorage.getItem('hive.settingsTab') as Section) || 'appearance'
    } catch {
      return 'appearance'
    }
  })
  const go = (s: Section): void => {
    setSection(s)
    try {
      sessionStorage.setItem('hive.settingsTab', s)
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="settings">
      <nav className="set-nav">
        <h1><Icon name="gear" /> Settings</h1>
        {SECTIONS.map((s) => (
          <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => go(s.id)}>
            <Icon name={s.icon} size={15} /> {s.name}
          </button>
        ))}
        <p className="muted small set-nav-foot">Changes apply instantly.</p>
      </nav>
      <div className="set-body">
        {section === 'projects' && <ProjectsSettings />}
        {section === 'appearance' && <Appearance />}
        {section === 'terminal' && <TerminalSettings />}
        {section === 'editor' && <EditorSettings />}
        {section === 'agents' && <AgentSettings />}
        {section === 'input' && <InputSettings />}
        {section === 'notifications' && <NotificationSettings />}
        {section === 'about' && <About />}
      </div>
    </div>
  )
}

/* ---------- building blocks ---------- */

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <header>
        <h2>{title}</h2>
        {hint && <p className="muted small">{hint}</p>}
      </header>
      <div className="set-rows">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <b>{label}</b>
        {hint && <span>{hint}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button role="switch" aria-checked={on} disabled={disabled} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><i /></button>
}

function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg sm set-seg">
      {options.map(([v, l]) => (
        <button key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

function Slider({ value, min, max, step = 1, unit = '', onChange }: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="set-slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mono">{value}{unit}</span>
    </div>
  )
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: fontStack(value) }}>
      {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>)}
    </select>
  )
}

function ResetLink({ keys }: { keys: (keyof Layout)[] }) {
  const L = useLayout()
  const changed = keys.some((k) => L[k] !== LAYOUT_DEFAULTS[k])
  if (!changed) return null
  return <button className="link-btn" onClick={() => keys.forEach((k) => L.reset(k))}><Icon name="refresh" size={12} /> Reset to defaults</button>
}

/* ---------- sections ---------- */

function Appearance() {
  const { theme, setTheme, accent, setAccent } = useStore()
  const L = useLayout()
  return (
    <>
      <Group title="Theme">
        <div className="theme-cards">
          {THEMES.map((t) => (
            <button key={t.id} className={`theme-card ${theme === t.id ? 'on' : ''}`} onClick={() => setTheme(t.id as ThemeId)}>
              <ThemeThumb id={t.id} />
              <b>{theme === t.id && <Icon name="check" size={13} />} {t.name}</b>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Accent colour" hint="Used for buttons, selections, the cursor and highlights.">
        <div className="accent-row">
          {ACCENTS.map((a) => (
            <button key={a.id} className={`accent-swatch ${accent === a.id ? 'on' : ''}`} onClick={() => setAccent(a.id)}>
              <i style={{ background: a.color }}>{accent === a.id && <Icon name="check" size={14} />}</i>
              <span>{a.name}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Layout">
        <Row label="Language" hint="Terminals, code and agent replies are not translated.">
          <Choice value={L.lang} options={[['en', 'English'], ['tr', 'Türkçe']]} onChange={(v) => {
            L.set({ lang: v })
            if (v === 'en') setTimeout(() => location.reload(), 50)
          }} />
        </Row>
        <Row label="Interface size" hint="Zooms the whole window (⌘+ / ⌘− work too).">
          <Choice value={L.uiScale} options={[[0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.2, '120%']]} onChange={(v) => L.set({ uiScale: v })} />
        </Row>
        <Row label="Room style" hint="How agents are shown in the Room view.">
          <Choice value={L.roomMode} options={[['office', 'Office'], ['desks', 'Desks']]} onChange={(v) => L.set({ roomMode: v })} />
        </Row>
        <Row label="Reduce motion" hint="Turns off walking, typing and pulsing animations.">
          <Toggle on={L.reduceMotion} onChange={(v) => L.set({ reduceMotion: v })} />
        </Row>
        <Row label="Panel sizes" hint="Sidebar, Changes panel, file lists and explorer widths.">
          <button className="btn ghost sm" onClick={() => {
            (['sidebarW', 'changesW', 'filesH', 'filesW', 'explorerW', 'serversW'] as (keyof Layout)[]).forEach((k) => L.reset(k))
            useStore.getState().toast('Panel sizes reset', 'success')
          }}>Reset panel sizes</button>
        </Row>
      </Group>
    </>
  )
}

function ThemeThumb({ id }: { id: ThemeId }) {
  const pal: Record<string, [string, string, string, string]> = {
    dark: ['#0e0f13', '#16181e', '#252934', '#eceef4'],
    midnight: ['#080a10', '#0e1119', '#1b2030', '#e8ecf6'],
    light: ['#f4f5f8', '#ffffff', '#e1e4eb', '#1d2130']
  }
  const draw = (k: string, clip?: string): ReactNode => {
    const [bg, panel, line, text] = pal[k]
    return (
      <g clipPath={clip}>
        <rect width="120" height="72" fill={bg} />
        <rect x="0" y="0" width="120" height="12" fill={panel} />
        <rect x="4" y="16" width="30" height="52" rx="3" fill={panel} />
        <rect x="38" y="16" width="78" height="52" rx="3" fill={panel} />
        <rect x="8" y="21" width="20" height="3" rx="1.5" fill="var(--accent)" />
        {[28, 34, 40].map((y) => <rect key={y} x="8" y={y} width="18" height="2.5" rx="1.2" fill={line} />)}
        {[22, 28, 34, 40, 46].map((y, i) => <rect key={y} x="43" y={y} width={[50, 62, 40, 56, 30][i]} height="2.5" rx="1.2" fill={i === 2 ? 'var(--accent)' : text} opacity={i === 2 ? 0.9 : 0.35} />)}
        <circle cx="7" cy="6" r="1.8" fill={line} /><circle cx="13" cy="6" r="1.8" fill={line} /><circle cx="19" cy="6" r="1.8" fill={line} />
      </g>
    )
  }
  return (
    <svg viewBox="0 0 120 72" className="theme-thumb">
      <defs><clipPath id="half"><path d="M60 0H120V72H60z" /></clipPath></defs>
      {id === 'system' ? (<>{draw('dark')}{draw('light', 'url(#half)')}</>) : draw(id)}
    </svg>
  )
}

function TerminalSettings() {
  const L = useLayout()
  return (
    <>
      <Group title="Terminal" hint="Applies to agent terminals, tiles (2px smaller) and dev servers.">
        <Row label="Font"><FontSelect value={L.termFont} onChange={(v) => L.set({ termFont: v })} /></Row>
        <Row label="Font size"><Slider value={L.termFontSize} min={10} max={20} unit="px" onChange={(v) => L.set({ termFontSize: v })} /></Row>
        <Row label="Cursor"><Choice value={L.termCursor} options={[['block', 'Block'], ['bar', 'Bar'], ['underline', 'Underline']]} onChange={(v) => L.set({ termCursor: v })} /></Row>
        <Row label="Blinking cursor"><Toggle on={L.termBlink} onChange={(v) => L.set({ termBlink: v })} /></Row>
        <Row label="Scrollback" hint="Lines kept in each terminal.">
          <Choice value={L.termScrollback} options={[[2000, '2k'], [5000, '5k'], [10000, '10k'], [50000, '50k']]} onChange={(v) => L.set({ termScrollback: v })} />
        </Row>
        <div className="term-sample" style={{ fontFamily: fontStack(L.termFont), fontSize: L.termFontSize }}>
          <div><span className="ts-acc">✻</span> Welcome to <b>Claude Code</b></div>
          <div><span className="ts-dim">&gt;</span> add a dark mode toggle to the navbar</div>
          <div><span className="ts-ok">●</span> Edit(src/components/Navbar.tsx) <span className="ts-dim">+12 −3</span></div>
          <div>Çalışıyor: ğüşıöç ✓ <span className={`ts-cur ${L.termCursor} ${L.termBlink ? 'blink' : ''}`} /></div>
        </div>
        <ResetLink keys={['termFont', 'termFontSize', 'termCursor', 'termBlink', 'termScrollback']} />
      </Group>
      <Group title="Dev servers">
        <Row label="Auto-reload preview" hint="Reload the preview when files in the project change.">
          <Toggle on={L.previewAutoReload} onChange={(v) => L.set({ previewAutoReload: v })} />
        </Row>
      </Group>
    </>
  )
}

function EditorSettings() {
  const L = useLayout()
  return (
    <>
      <Group title="Code editor">
        <Row label="Font"><FontSelect value={L.editorFont} onChange={(v) => L.set({ editorFont: v })} /></Row>
        <Row label="Font size"><Slider value={L.editorFontSize} min={10} max={22} unit="px" onChange={(v) => L.set({ editorFontSize: v })} /></Row>
        <Row label="Tab size"><Choice value={L.editorTabSize} options={[[2, '2'], [4, '4'], [8, '8']]} onChange={(v) => L.set({ editorTabSize: v })} /></Row>
        <Row label="Ligatures" hint="e.g. => and !== as single glyphs (font must support them)."><Toggle on={L.editorLigatures} onChange={(v) => L.set({ editorLigatures: v })} /></Row>
        <Row label="Word wrap"><Toggle on={L.editorWrap} onChange={(v) => L.set({ editorWrap: v })} /></Row>
        <Row label="Minimap"><Toggle on={L.editorMinimap} onChange={(v) => L.set({ editorMinimap: v })} /></Row>
        <Row label="Keymap"><Choice value={L.keymap} options={[['vscode', 'VS Code'], ['jetbrains', 'JetBrains']]} onChange={(v) => L.set({ keymap: v })} /></Row>
        <Row label="Auto save">
          <Choice value={L.autoSave} options={[['afterDelay', 'After delay'], ['onFocusChange', 'On focus change'], ['off', 'Off']]} onChange={(v) => L.set({ autoSave: v })} />
        </Row>
        {L.autoSave === 'afterDelay' && (
          <Row label="Auto save delay"><Slider value={L.autoSaveDelay / 1000} min={0.3} max={5} step={0.1} unit="s" onChange={(v) => L.set({ autoSaveDelay: Math.round(v * 1000) })} /></Row>
        )}
        <Row label="Markdown files open in"><Choice value={L.mdMode} options={[['edit', 'Edit'], ['split', 'Split'], ['preview', 'Preview']]} onChange={(v) => L.set({ mdMode: v })} /></Row>
        <ResetLink keys={['editorFont', 'editorFontSize', 'editorTabSize', 'editorLigatures', 'editorWrap', 'editorMinimap', 'keymap', 'autoSave', 'autoSaveDelay', 'mdMode']} />
      </Group>
      <Group title="Review (Changes panel)">
        <Row label="Diff layout"><Choice value={L.diffMode} options={[['unified', 'Unified'], ['split', 'Side by side']]} onChange={(v) => L.set({ diffMode: v })} /></Row>
        <Row label="Wrap long lines"><Toggle on={L.wrap} onChange={(v) => L.set({ wrap: v })} /></Row>
        <Row label="Diff text size"><Slider value={L.diffFont} min={10} max={18} step={0.5} unit="px" onChange={(v) => L.set({ diffFont: v })} /></Row>
      </Group>
    </>
  )
}

function useSettings(): [AppSettings, (p: Partial<AppSettings>) => void] {
  const settings = useStore((s) => s.app.settings)
  const save = (p: Partial<AppSettings>): void => {
    window.api.settings.save(p).catch((e) => useStore.getState().toast(cleanError(e), 'error'))
  }
  return [settings, save]
}

function AgentSettings() {
  const [s, save] = useSettings()
  const providers = useStore((st) => st.app.providers)
  const roles = useStore((st) => st.app.roles)
  const prompts = useStore((st) => st.app.prompts)
  return (
    <>
      <Group title="New agents">
        <Row label="Default CLI">
          <select value={s.defaultProviderId} onChange={(e) => save({ defaultProviderId: e.target.value })}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="Git worktree isolation" hint="Each isolated agent gets its own branch and folder.">
          <Choice value={s.worktreeDefault} options={[['auto', 'From 2nd agent'], ['always', 'Always'], ['never', 'Never']]} onChange={(v) => save({ worktreeDefault: v })} />
        </Row>
        <Row label="Prompts & roles" hint={`${prompts.length} saved prompts · ${roles.length} roles`}>
          <button className="btn ghost sm" onClick={() => useStore.getState().setShowLibrary('prompts')}><Icon name="book" size={13} /> Open library</button>
        </Row>
      </Group>
      <Group title="While agents work">
        <Row label="Queue messages while busy" hint="Enter adds to the agent's queue while it works; ⌘Enter still sends right away.">
          <Toggle on={s.queueWhenBusy} onChange={(v) => save({ queueWhenBusy: v })} />
        </Row>
        <Row label="Keep the Mac awake" hint="While an agent is working or a dev server runs.">
          <Toggle on={s.keepAwake} onChange={(v) => save({ keepAwake: v })} />
        </Row>
        <Row label="Pause idle agents" hint="Stop agents that waited this long; ▶ / Resume continues the conversation.">
          <Choice value={s.autoPauseMin} options={[[0, 'Never'], [30, '30 min'], [60, '1 h'], [180, '3 h']]} onChange={(v) => save({ autoPauseMin: v })} />
        </Row>
        <Row label="Project memory" hint="Shared notes Claude Code agents get at start (Memory tab).">
          <Choice value={s.memoryMode} options={[['readwrite', 'Read & write'], ['read', 'Read only'], ['off', 'Off']]} onChange={(v) => save({ memoryMode: v })} />
        </Row>
      </Group>
      <Group title="Commits & webhooks">
        <Row label="Attach the conversation to commits" hint="Commits made in Hive get the agent's recent conversation as a git note (git log --notes=hive).">
          <Toggle on={s.commitContext} onChange={(v) => save({ commitContext: v })} />
        </Row>
        <Row label="Webhook port" hint="Local port for Backlog → Webhooks (127.0.0.1 only).">
          <input type="number" style={{ width: 110 }} defaultValue={s.triggerPort} onBlur={(e) => Number(e.target.value) !== s.triggerPort && save({ triggerPort: Number(e.target.value) || 4317 })} />
        </Row>
      </Group>
      <Group title="AI commit messages" hint="✨ in the Changes panel writes the message from the real diff with your Claude Code (Haiku).">
        <textarea rows={3} defaultValue={s.commitRules} onBlur={(e) => e.target.value !== s.commitRules && save({ commitRules: e.target.value })} />
      </Group>
      <AccountsSettings />
      <ProvidersEditor />
    </>
  )
}

const BUILTIN = new Set(DEFAULT_PROVIDERS.map((p) => p.id))

function ProvidersEditor() {
  const saved = useStore((s) => s.app.providers)
  const [list, setList] = useState<Provider[]>(saved)
  const [checks, setChecks] = useState<Record<string, { ok: boolean; path?: string } | 'busy'>>({})
  useEffect(() => setList(saved), [saved])
  const dirty = useMemo(() => JSON.stringify(list) !== JSON.stringify(saved), [list, saved])
  const patch = (i: number, p: Partial<Provider>): void => setList(list.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const check = async (p: Provider): Promise<void> => {
    setChecks((c) => ({ ...c, [p.id]: 'busy' }))
    const r = await window.api.settings.checkCommand(p.command)
    setChecks((c) => ({ ...c, [p.id]: r }))
  }
  const saveAll = (): void => {
    window.api.settings.saveProviders(list)
      .then(() => useStore.getState().toast('CLIs saved – restart running agents to use the new command', 'success'))
      .catch((e) => useStore.getState().toast(cleanError(e), 'error'))
  }
  return (
    <Group title="CLIs" hint="The command each agent type runs. Commands start in a login shell, so anything on your PATH works.">
      <div className="cli-list">
        {list.map((p, i) => {
          const c = checks[p.id]
          return (
            <div key={p.id} className="cli-card">
              <div className="cli-head">
                <input className="cli-name" value={p.name} onChange={(e) => patch(i, { name: e.target.value })} />
                {BUILTIN.has(p.id) ? <span className="chip">built-in</span> : <span className="chip">custom</span>}
                <div className="spacer" />
                <button className="btn ghost sm" disabled={c === 'busy'} onClick={() => check(p)}>
                  {c === 'busy' ? 'Checking…' : 'Check'}
                </button>
                {BUILTIN.has(p.id) ? (
                  <button className="icon-btn" title="Restore default command" onClick={() => patch(i, DEFAULT_PROVIDERS.find((d) => d.id === p.id)!)}><Icon name="refresh" size={13} /></button>
                ) : (
                  <button className="icon-btn danger" title="Remove" onClick={() => setList(list.filter((_, j) => j !== i))}><Icon name="trash" size={13} /></button>
                )}
              </div>
              {c && c !== 'busy' && (
                <div className={`cli-check ${c.ok ? 'ok' : 'bad'}`}>
                  {c.ok ? <>Found: <span className="mono">{c.path}</span></> : <>Not found on your PATH – install it or use the full path.</>}
                </div>
              )}
              <div className="cli-fields">
                <label>Command<input className="mono" value={p.command} placeholder="(empty = plain shell)" onChange={(e) => patch(i, { command: e.target.value })} /></label>
                <label>Resume args<input className="mono" value={p.resumeArgs ?? ''} placeholder="e.g. --continue" onChange={(e) => patch(i, { resumeArgs: e.target.value || undefined })} /></label>
                <label>First task
                  <select value={p.promptArg === undefined ? '__type' : p.promptArg === '' ? '__pos' : '__flag'}
                    onChange={(e) => patch(i, { promptArg: e.target.value === '__type' ? undefined : e.target.value === '__pos' ? '' : (p.promptArg || '-p') })}>
                    <option value="__pos">as argument</option>
                    <option value="__flag">with a flag</option>
                    <option value="__type">typed into terminal</option>
                  </select>
                </label>
                {p.promptArg !== undefined && p.promptArg !== '' && (
                  <label>Flag<input className="mono" value={p.promptArg} onChange={(e) => patch(i, { promptArg: e.target.value })} /></label>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="row">
        <button className="btn ghost sm" onClick={() => {
          const id = `cli-${Math.random().toString(36).slice(2, 7)}`
          setList([...list, { id, name: 'New CLI', command: '' }])
        }}><Icon name="plus" size={13} /> Add CLI</button>
        <div className="spacer" />
        {dirty && <button className="btn ghost sm" onClick={() => setList(saved)}>Discard</button>}
        <button className="btn sm" disabled={!dirty} onClick={saveAll}>Save CLIs</button>
      </div>
    </Group>
  )
}

function InputSettings() {
  const [s, save] = useSettings()
  return (
    <>
      <Group title="Voice dictation" hint="🎤 in the message box. Audio is sent to OpenAI if you add a key, otherwise to a local Whisper command – nothing else.">
        <Row label="OpenAI API key" hint="Uses gpt-4o-mini-transcribe (about $0.003 per minute).">
          <input type="password" style={{ width: 260 }} placeholder="sk-…" defaultValue={s.openaiKey} onBlur={(e) => e.target.value !== s.openaiKey && save({ openaiKey: e.target.value.trim() })} />
        </Row>
        <Row label="Local Whisper command" hint={<>Free and offline, e.g. <span className="mono">whisper-cli -m ~/models/ggml-base.bin -nt -f {'{file}'}</span> (brew install whisper-cpp)</>}>
          <input className="mono" style={{ width: 320 }} placeholder="whisper-cli -m … -nt -f {file}" defaultValue={s.whisperCmd} onBlur={(e) => e.target.value !== s.whisperCmd && save({ whisperCmd: e.target.value.trim() })} />
        </Row>
        <Row label="Language" hint="Auto-detect works well; pick one for short phrases.">
          <Choice value={s.dictationLang} options={[['', 'Auto'], ['tr', 'Türkçe'], ['en', 'English'], ['de', 'Deutsch']]} onChange={(v) => save({ dictationLang: v })} />
        </Row>
      </Group>
      <Group title="Screenshots">
        <Row label="Capture & attach" hint="⌘⇧2 anywhere (or 📷 in the message box): drag to select an area, Space for a window. Pasting or dropping images works too.">
          <span className="kbd">⌘⇧2</span>
        </Row>
      </Group>
      <Group title="Prompt enhancer" hint="✨ in the message box turns a short request into Goal / Context / Constraints / Done when, using your Claude Code (Haiku). Undo is one click." >
        <div />
      </Group>
    </>
  )
}

function NotificationSettings() {
  const [s, save] = useSettings()
  const n = s.notify
  return (
    <Group title="Desktop notifications" hint="Clicking a notification opens that agent.">
      <Row label="Agent needs you" hint="Waiting for input or a permission."><Toggle on={n.waiting} onChange={(v) => save({ notify: { ...n, waiting: v } })} /></Row>
      <Row label="Agent finished"><Toggle on={n.done} onChange={(v) => save({ notify: { ...n, done: v } })} /></Row>
      <Row label="Agent crashed / exited with an error"><Toggle on={n.error} onChange={(v) => save({ notify: { ...n, error: v } })} /></Row>
      <Row label="Also while Hive is focused"><Toggle on={n.whenFocused} onChange={(v) => save({ notify: { ...n, whenFocused: v } })} /></Row>
      <Row label="Play sound"><Toggle on={!n.silent} onChange={(v) => save({ notify: { ...n, silent: !v } })} /></Row>
      <Row label="Dock badge" hint="Number of agents waiting for you on the app icon."><Toggle on={s.badge} onChange={(v) => save({ badge: v })} /></Row>
    </Group>
  )
}

const SHORTCUTS: [string, string][] = [
  ['⌘K', 'Search everything / command palette'],
  ['⌘⇧2', 'Screenshot → attach to next message'],
  ['⌘⏎', 'Send now even while the agent is busy'],
  ['⌘N', 'New agent'],
  ['⌘P', 'Quick open file (editor)'],
  ['⌘S', 'Save file'],
  ['⏎ / ⇧⏎', 'Send prompt / new line'],
  ['⌘⏎', 'Send a library prompt from the picker'],
  ['⌘+ / ⌘− / ⌘0', 'Zoom in / out / reset'],
  ['Right-click', 'Agent actions anywhere']
]

function About() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof window.api.settings.info>> | null>(null)
  useEffect(() => {
    window.api.settings.info().then(setInfo)
  }, [])
  return (
    <>
      <Group title="Hive">
        <div className="about-card">
          <div className="logo"><HiveLogo size={34} /></div>
          <div>
            <b>Hive {info?.version}</b>
            <span className="muted small">Electron {info?.electron} · Node {info?.node}{info?.hookPort ? ` · hooks on :${info.hookPort}` : ''}</span>
          </div>
        </div>
        <Row label="Data folder" hint={<span className="mono">{info?.userData}</span>}>
          <button className="btn ghost sm" onClick={() => window.api.settings.openData()}><Icon name="folder" size={13} /> Open</button>
        </Row>
        <Row label="Interface preferences" hint="Theme, fonts, editor and panel sizes stored on this computer.">
          <button className="btn ghost sm danger-text" onClick={() => {
            if (!confirm('Reset all interface preferences (theme, fonts, editor, panel sizes)?')) return
            try {
              localStorage.removeItem('hive.layout')
              localStorage.removeItem('hive.theme')
              localStorage.removeItem('hive.accent')
            } catch {
              /* ignore */
            }
            location.reload()
          }}>Reset all</button>
        </Row>
      </Group>
      <Group title="Keyboard shortcuts">
        <ul className="set-keys">
          {SHORTCUTS.map(([k, d]) => <li key={k}><span className="kbd">{k}</span>{d}</li>)}
        </ul>
      </Group>
    </>
  )
}

function ProjectsSettings() {
  const projects = useStore((s) => s.app.projects)
  const agents = useStore((s) => s.app.agents)
  const selected = useStore((s) => s.selectedProjectId)
  const [cloning, setCloning] = useState(false)
  return (
    <>
      <Group title="Projects" hint="Folders Hive works in. Link more folders to a project when the work spans several repos (e.g. API + web) – agents get access to all of them. Removing a project only takes it out of Hive; files stay on disk.">
        {projects.map((p) => (
          <Row key={p.id} label={p.name} hint={
            <span className="proj-folders">
              <span className="mono">{p.path}</span>
              {(p.folders ?? []).map((f) => (
                <span key={f} className="linked mono"><Icon name="plug" size={11} /> {f}
                  <button className="link-btn" title="Unlink folder" onClick={() => window.api.projectFolders(p.id, 'remove', f)}><Icon name="x" size={11} /></button>
                </span>
              ))}
            </span>
          }>
            <span className="muted small">{agents.filter((a) => a.projectId === p.id).length} agents</span>
            <button className="btn ghost sm" title="Agents may also read and edit these folders (restart running agents)" onClick={() => window.api.projectFolders(p.id, 'add')}><Icon name="plus" size={12} /> Link folder</button>
            {p.id !== selected && <button className="btn ghost sm" onClick={() => useStore.getState().selectProject(p.id)}>Open</button>}
            <button className="icon-btn" title="Show in Finder" onClick={() => window.api.openPath(p.path)}><Icon name="folder" size={14} /></button>
            <button className="icon-btn danger" title="Remove project from list" onClick={() => {
              if (confirm(`Remove "${p.name}" and its agents from Hive? (Files are not deleted.)`)) window.api.removeProject(p.id)
            }}><Icon name="trash" size={14} /></button>
          </Row>
        ))}
        <div className="row" style={{ paddingTop: 10 }}>
          <button className="btn ghost sm" onClick={() => window.api.addProject()}><Icon name="plus" size={13} /> Add folder…</button>
          <button className="btn ghost sm" onClick={() => setCloning(true)}><Icon name="github" size={13} /> Clone from Git…</button>
        </div>
      </Group>
      <Group title="Prompts & roles" hint="Saved prompts and agent roles – also reachable from ⌘K and the message box.">
        <Row label="Library" hint={<span>Prompts with placeholders, roles that become the agent's system prompt.</span>}>
          <button className="btn ghost sm" onClick={() => useStore.getState().setShowLibrary('prompts')}><Icon name="book" size={13} /> Open library</button>
        </Row>
      </Group>
      {cloning && <CloneRepoModal onClose={() => setCloning(false)} />}
    </>
  )
}
