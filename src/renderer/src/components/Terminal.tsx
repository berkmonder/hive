import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { subscribeAgentData, terminalTheme, useStore } from '../store'
import { fontStack, useLayout } from '../layout'

/**
 * Several views can show the same agent at once (agent view, split view, grid tile).
 * Only one of them – the "owner" – may resize the pty (otherwise every view fights over
 * the size and the TUI redraws garbage) and answer terminal queries. The owner is the
 * most recently focused / mounted full-size view; tiles only own it when nothing else does.
 */
type Owner = { id: number; compact: boolean; claim: () => void; follow: (cols: number, rows: number) => void }
/** last size the owner gave the pty */
const ptySize = new Map<string, { cols: number; rows: number }>()
const owners = new Map<string, Owner[]>()
let seq = 0
const ownerOf = (key: string): Owner | undefined => {
  const list = owners.get(key) ?? []
  return list.filter((o) => !o.compact).slice(-1)[0] ?? list.slice(-1)[0]
}
function register(key: string, o: Owner): () => void {
  owners.set(key, [...(owners.get(key) ?? []).filter((x) => x.id !== o.id), o])
  return () => {
    const was = ownerOf(key)
    owners.set(key, (owners.get(key) ?? []).filter((x) => x.id !== o.id))
    const now = ownerOf(key)
    if (was?.id === o.id && now) now.claim() // hand the pty size to the next view
  }
}
function promote(key: string, id: number): void {
  const list = owners.get(key) ?? []
  const o = list.find((x) => x.id === id)
  if (o) owners.set(key, [...list.filter((x) => x.id !== id), o])
}

interface Props {
  /** agent id, or a dev server id when source = 'server' */
  agentId: string
  source?: 'agent' | 'server'
  /** smaller text for tiles (font size from Settings − 2) */
  compact?: boolean
  autoFocus?: boolean
}

export function Terminal({ agentId, compact, autoFocus, source = 'agent' }: Props) {
  const isServer = source === 'server'
  const io = isServer
    ? { key: `srv:${agentId}`, buffer: window.api.servers.buffer, input: window.api.servers.input, resize: window.api.servers.resize }
    : { key: agentId, buffer: window.api.agentBuffer, input: window.api.input, resize: window.api.resize }
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current!
    const L0 = useLayout.getState()
    const sizeOf = (n: number): number => Math.max(8, compact ? n - 2 : n)
    const term = new XTerm({
      fontFamily: fontStack(L0.termFont),
      fontSize: sizeOf(L0.termFontSize),
      cursorBlink: L0.termBlink,
      cursorStyle: L0.termCursor,
      allowProposedApi: true,
      scrollback: L0.termScrollback,
      theme: terminalTheme()
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    // links: plain URLs in the output + OSC 8 hyperlinks (Claude Code uses those)
    const openUri = async (uri: string): Promise<void> => {
      if (/^(https?|mailto):/i.test(uri)) {
        window.api.openLink(uri)
        return
      }
      if (uri.startsWith('file://')) {
        // file links inside the agent's folder open in the built-in editor
        const u = new URL(uri)
        const path = decodeURIComponent(u.pathname)
        const line = Number(u.hash.match(/(\d+)/)?.[1]) || undefined
        const cwd = isServer ? '' : await window.api.agentCwd(agentId)
        if (cwd && path.startsWith(cwd + '/')) useStore.getState().openCode(cwd, path.slice(cwd.length + 1), line)
        else window.api.openPath(path)
      }
    }
    term.loadAddon(new WebLinksAddon((e, uri) => (e.preventDefault(), openUri(uri))))
    term.options.linkHandler = {
      allowNonHttpProtocols: true,
      activate: (e, uri) => (e.preventDefault(), openUri(uri)),
      hover: () => (el.style.cursor = 'pointer'),
      leave: () => (el.style.cursor = '')
    }
    // correct widths for emoji / symbols and combining marks
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    term.open(el)
    // macOS hands out decomposed text (s + ̧ ) e.g. in file names: compose it (ş) before drawing
    const nfc = (s: string): string => (/[\u0300-\u036f]/.test(s) ? s.normalize('NFC') : s)

    let disposed = false
    const me = ++seq
    const isOwner = (): boolean => ownerOf(io.key)?.id === me
    // replay what happened while this view was not mounted, then stream live
    const pending: string[] = []
    let replayed = false
    // while the snapshot is written, xterm answers old queries (cursor position, device
    // attributes…) – those answers must not reach the agent as typed input
    let replaying = true
    const unsub = subscribeAgentData(io.key, (d) => (replayed ? term.write(nfc(d)) : void pending.push(d)))
    io.buffer(agentId).then((res) => {
      if (disposed) return
      const snap = typeof res === 'string' ? { data: res, cols: 0, rows: 0 } : res
      // IPC is ordered: every chunk that arrived before this reply is already in the snapshot
      pending.length = 0
      // draw the snapshot at the size it was taken, then fit to this view
      if (snap.cols && snap.rows) {
        if (!ptySize.has(io.key)) ptySize.set(io.key, { cols: snap.cols, rows: snap.rows })
        if (!isOwner()) term.resize(snap.cols, snap.rows)
      }
      term.write(nfc(snap.data), () => {
        replaying = false
        if (disposed) return
        requestAnimationFrame(() => doFit(true))
      })
      replayed = true
    })

    const input = term.onData((d) => {
      if (replaying) return
      // keystrokes from the view you type in; terminal replies only from the owner view
      const typing = el.contains(document.activeElement)
      if (typing || isOwner()) io.input(agentId, d)
    })
    const focusIn = (): void => {
      // the view you work in takes over the pty size
      if (ownerOf(io.key)?.id === me) return
      promote(io.key, me)
      sentCols = 0
      sentRows = 0
      requestAnimationFrame(() => doFit(true))
    }
    el.addEventListener('focusin', focusIn)
    const unregister = register(io.key, {
      id: me,
      compact: !!compact,
      claim: () => {
        sentCols = 0
        sentRows = 0
        requestAnimationFrame(() => doFit(true))
      },
      // other views mirror the owner's size so the TUI output lines up
      follow: (cols, rows) => {
        if (!disposed && (term.cols !== cols || term.rows !== rows)) term.resize(cols, rows)
      }
    })
    // follow accent changes
    const unsubStore = useStore.subscribe((st, prev) => {
      if (st.accent !== prev.accent || st.resolvedTheme !== prev.resolvedTheme) requestAnimationFrame(() => (term.options.theme = terminalTheme()))
    })
    // follow Settings → Terminal live
    const unsubLayout = useLayout.subscribe((l, p) => {
      if (l.termFont !== p.termFont) term.options.fontFamily = fontStack(l.termFont)
      if (l.termFontSize !== p.termFontSize) term.options.fontSize = sizeOf(l.termFontSize)
      if (l.termCursor !== p.termCursor) term.options.cursorStyle = l.termCursor
      if (l.termBlink !== p.termBlink) term.options.cursorBlink = l.termBlink
      if (l.termScrollback !== p.termScrollback) term.options.scrollback = l.termScrollback
      if (l.termFont !== p.termFont || l.termFontSize !== p.termFontSize) requestAnimationFrame(() => doFit())
    })
    const unsubTheme = (): void => {
      unsubStore()
      unsubLayout()
    }

    // Every pty resize makes TUIs like Claude Code redraw everything, and a burst of
    // them leaves duplicated / overlapping lines. So: fit locally right away, but tell
    // the pty only once the size has settled, and only if cols/rows really changed.
    let sentCols = 0
    let sentRows = 0
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const sendSize = (): void => {
      if (disposed || !isOwner() || (term.cols === sentCols && term.rows === sentRows)) return
      sentCols = term.cols
      sentRows = term.rows
      io.resize(agentId, term.cols, term.rows)
      ptySize.set(io.key, { cols: term.cols, rows: term.rows })
      for (const o of owners.get(io.key) ?? []) if (o.id !== me) o.follow(term.cols, term.rows)
    }
    const doFit = (immediate = false): void => {
      if (disposed || el.clientWidth === 0 || el.clientHeight === 0) return
      if (!isOwner()) {
        // not the owner: show the agent at the pty's size (clipped) instead of re-wrapping it
        const p = ptySize.get(io.key)
        if (p && (term.cols !== p.cols || term.rows !== p.rows)) term.resize(p.cols, p.rows)
        if (p) return
      }
      try {
        const dims = fit.proposeDimensions()
        if (!dims || (dims.cols === term.cols && dims.rows === term.rows && sentCols)) return
        fit.fit()
      } catch {
        return /* not yet laid out */
      }
      clearTimeout(resizeTimer)
      if (immediate) sendSize()
      else resizeTimer = setTimeout(sendSize, 250)
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(() => doFit()))
    ro.observe(el)
    requestAnimationFrame(() => doFit(true))
    if (autoFocus) setTimeout(() => term.focus(), 50)

    return () => {
      disposed = true
      clearTimeout(resizeTimer)
      ro.disconnect()
      el.removeEventListener('focusin', focusIn)
      unregister()
      unsub()
      unsubTheme()
      input.dispose()
      term.dispose()
    }
  }, [agentId, compact, autoFocus, source]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="terminal" ref={ref} onMouseDown={(e) => e.stopPropagation()} />
}
