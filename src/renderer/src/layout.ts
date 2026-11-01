import { create } from 'zustand'

/** UI layout preferences (panel sizes, diff options), remembered per machine. */
export interface Layout {
  sidebarW: number
  changesW: number
  filesH: number // file list height in the side panel
  filesW: number // file list width in full-screen review
  diffMode: 'unified' | 'split'
  wrap: boolean
  diffFont: number
  explorerW: number
  keymap: 'vscode' | 'jetbrains'
  autoSave: 'off' | 'afterDelay' | 'onFocusChange'
  autoSaveDelay: number
  mdMode: 'edit' | 'split' | 'preview'
  roomMode: 'office' | 'desks'
  serversW: number
  previewAutoReload: boolean
  uiScale: number
  termFont: string
  termFontSize: number
  termCursor: 'block' | 'bar' | 'underline'
  termBlink: boolean
  termScrollback: number
  editorFont: string
  editorFontSize: number
  editorMinimap: boolean
  editorWrap: boolean
  editorLigatures: boolean
  editorTabSize: number
  reduceMotion: boolean
  focusMode: 'terminal' | 'chat'
  splitIds: string[]
  splitDir: 'cols' | 'rows'
}

const DEFAULTS: Layout = { sidebarW: 300, changesW: 460, filesH: 190, filesW: 280, diffMode: 'unified', wrap: false, diffFont: 12.5, explorerW: 260, keymap: 'vscode', autoSave: 'afterDelay', autoSaveDelay: 1000, mdMode: 'split', roomMode: 'office', serversW: 280, previewAutoReload: false, uiScale: 1, termFont: 'Menlo', termFontSize: 13, termCursor: 'block', termBlink: true, termScrollback: 5000, editorFont: 'JetBrains Mono', editorFontSize: 13, editorMinimap: true, editorWrap: false, editorLigatures: true, editorTabSize: 2, reduceMotion: false, focusMode: 'terminal', splitIds: [], splitDir: 'cols' }
const KEY = 'hive.layout'

function load(): Layout {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return DEFAULTS
  }
}

export const useLayout = create<Layout & { set: (p: Partial<Layout>) => void; reset: (k: keyof Layout) => void }>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p)
    try {
      const { set: _s, reset: _r, ...rest } = get()
      localStorage.setItem(KEY, JSON.stringify(rest))
    } catch {
      /* storage unavailable */
    }
  },
  reset: (k) => get().set({ [k]: DEFAULTS[k] } as Partial<Layout>)
}))

export const LAYOUT_DEFAULTS = DEFAULTS
export const FONTS = ['Menlo', 'SF Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Monaco', 'Consolas', 'Source Code Pro', 'IBM Plex Mono']
/** CSS font stack with sensible fallbacks */
export const fontStack = (f: string): string => `"${f}", Menlo, "SF Mono", Consolas, monospace`

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))
