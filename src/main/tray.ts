/**
 * Menu bar (macOS) / system tray icon: how many agents need you, the agent list with
 * their status (click to open one), pause everything, open Hive, quit.
 */
import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import type { AgentStatus } from '@shared/types'
import { getState } from './store'
import type { AgentManager } from './agents'
import { TRAY_BLACK_1X, TRAY_BLACK_2X, TRAY_WHITE_1X, TRAY_WHITE_2X } from './trayIcons'

const DOT: Record<AgentStatus, string> = { waiting: '🔴', working: '🟢', done: '🔵', error: '🟠', idle: '⚪️' }
const LABEL: Record<AgentStatus, string> = { waiting: 'needs you', working: 'working', done: 'to review', error: 'error', idle: 'stopped' }

export function createTray(deps: { agents: AgentManager; win: () => BrowserWindow | null; show: () => void; send: (channel: string, payload: unknown) => void }): { refresh: () => void; destroy: () => void } {
  let tray: Tray | null = null
  let sig = ''

  const icon = (): Electron.NativeImage => {
    const mac = process.platform === 'darwin'
    const img = nativeImage.createFromBuffer(Buffer.from(mac ? TRAY_BLACK_1X : TRAY_WHITE_1X, 'base64'), { scaleFactor: 1 })
    img.addRepresentation({ scaleFactor: 2, buffer: Buffer.from(mac ? TRAY_BLACK_2X : TRAY_WHITE_2X, 'base64') })
    if (mac) img.setTemplateImage(true)
    return img
  }

  const open = (agentId?: string): void => {
    deps.show()
    if (agentId) setTimeout(() => deps.send('agent:focus', agentId), 150)
  }

  function refresh(): void {
    const st = getState()
    if (st.settings.trayIcon === false) {
      tray?.destroy()
      tray = null
      sig = ''
      return
    }
    if (!tray) {
      tray = new Tray(icon())
      tray.setToolTip('Hive')
      if (process.platform !== 'darwin') tray.on('click', () => open())
    }
    const rows = st.agents.map((a) => {
      const rt = deps.agents.runtime(a.id)
      const status: AgentStatus = rt.running ? rt.status : 'idle'
      return { a, status }
    })
    const count = (s: AgentStatus): number => rows.filter((r) => r.status === s).length
    const waiting = count('waiting') + count('error')
    const working = count('working')
    const next = `${waiting}|${working}|${rows.map((r) => `${r.a.id}:${r.status}:${r.a.name}`).join(',')}|${st.projects.map((p) => p.name).join(',')}`
    if (next === sig) return
    sig = next

    // macOS shows a number next to the icon when someone needs you
    if (process.platform === 'darwin') tray.setTitle(waiting ? ` ${waiting}` : working ? ` ${working}` : '', { fontType: 'monospacedDigit' })
    tray.setToolTip(`Hive – ${working} working${waiting ? ` · ${waiting} need you` : ''}`)

    const order: AgentStatus[] = ['waiting', 'error', 'working', 'done', 'idle']
    const items: Electron.MenuItemConstructorOptions[] = [
      { label: `${working} working · ${waiting} need you · ${count('done')} to review`, enabled: false },
      { type: 'separator' }
    ]
    for (const p of st.projects) {
      const mine = rows.filter((r) => r.a.projectId === p.id).sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status))
      if (!mine.length) continue
      items.push({ label: p.name, enabled: false })
      for (const r of mine.slice(0, 12))
        items.push({ label: `${DOT[r.status]}  ${r.a.name}`, sublabel: LABEL[r.status], toolTip: `${r.a.role} · ${LABEL[r.status]}`, click: () => open(r.a.id) })
      if (mine.length > 12) items.push({ label: `…and ${mine.length - 12} more`, enabled: false })
    }
    if (!rows.length) items.push({ label: 'No agents yet', enabled: false })
    const running = rows.filter((r) => r.status !== 'idle').length
    items.push(
      { type: 'separator' },
      { label: 'Open Hive', accelerator: 'CommandOrControl+O', click: () => open() },
      {
        label: 'Pause all agents after their turn',
        enabled: running > 0,
        click: () => {
          for (const id of deps.agents.runningIds()) deps.agents.pauseAfterTurn(id)
        }
      },
      { label: 'Settings…', click: () => (open(), setTimeout(() => deps.send('open:settings', null), 150)) },
      { type: 'separator' },
      { label: 'Quit Hive', accelerator: 'CommandOrControl+Q', click: () => app.quit() }
    )
    tray.setContextMenu(Menu.buildFromTemplate(items))
  }

  const timer = setInterval(refresh, 2000)
  refresh()
  return {
    refresh,
    destroy: () => {
      clearInterval(timer)
      tray?.destroy()
      tray = null
    }
  }
}
