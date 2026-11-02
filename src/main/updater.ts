/**
 * Updates from GitHub Releases – no update server and no code signing needed.
 *   check:   GET the latest release, compare with app.getVersion()
 *   install: download the right asset, then swap it in after Hive quits and start again
 *            macOS  .zip  -> replaces Hive.app
 *            Windows .exe -> silent NSIS install, then starts Hive
 *            Linux  .AppImage -> replaces the running AppImage
 */
import { app, ipcMain, shell } from 'electron'
import { spawn } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { getState, updateState } from './store'
import type { UpdateInfo } from '@shared/types'

const REPO = 'burakilk/hive'

const newer = (a: string, b: string): boolean => {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((x) => Number(x) || 0)
  const pb = b.replace(/^v/, '').split(/[.-]/).map((x) => Number(x) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

function pickAsset(assets: { name: string; browser_download_url: string; size: number }[]): UpdateInfo['asset'] {
  const want =
    process.platform === 'darwin'
      ? new RegExp(`mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}\\.zip$`)
      : process.platform === 'win32'
        ? /windows-setup\.exe$/
        : /\.AppImage$/
  const a = assets.find((x) => want.test(x.name))
  return a ? { name: a.name, url: a.browser_download_url, size: a.size } : undefined
}

/** where the running app lives (Hive.app bundle on macOS, the AppImage on Linux) */
const installTarget = (): string | null => {
  if (!app.isPackaged) return null
  if (process.platform === 'darwin') {
    const m = process.execPath.match(/^(.*?\.app)\//)
    return m ? m[1] : null
  }
  if (process.platform === 'linux') return process.env.APPIMAGE || null
  return process.execPath
}

export function registerUpdater(send: (channel: string, payload: unknown) => void): void {
  let latest: UpdateInfo | null = null
  let busy = false

  async function check(manual = false): Promise<UpdateInfo | null> {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'Hive', Accept: 'application/vnd.github+json' } })
      if (!res.ok) throw new Error(res.status === 404 ? 'No public release found on GitHub (the repository must be public for updates)' : `Could not reach GitHub (${res.status})`)
      const r = (await res.json()) as { tag_name: string; body?: string; html_url: string; assets: { name: string; browser_download_url: string; size: number }[] }
      updateState((s) => (s.settings.lastUpdateCheck = Date.now()))
      if (!newer(r.tag_name, app.getVersion())) {
        latest = null
        return null
      }
      const asset = pickAsset(r.assets)
      latest = { version: r.tag_name.replace(/^v/, ''), notes: r.body ?? '', url: r.html_url, asset, canInstall: !!asset && !!installTarget() }
      if (!manual && getState().settings.skipVersion === latest.version) return latest
      send('update:available', latest)
      return latest
    } catch (e) {
      if (manual) throw e
      return null
    }
  }

  async function download(a: NonNullable<UpdateInfo['asset']>): Promise<string> {
    const dir = join(app.getPath('temp'), 'hive-update')
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const file = join(dir, a.name)
    const res = await fetch(a.url, { headers: { 'User-Agent': 'Hive' } })
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
    const total = Number(res.headers.get('content-length')) || a.size
    const out = createWriteStream(file)
    let got = 0
    let last = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      got += value.length
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      if (Date.now() - last > 250) {
        last = Date.now()
        send('update:progress', total ? got / total : 0)
      }
    }
    await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())))
    send('update:progress', 1)
    return file
  }

  /** a detached script waits for Hive to exit, swaps the files and starts the new version */
  function swapAndRestart(file: string): void {
    const target = installTarget()
    if (!target) throw new Error('Updates can only be installed in the packaged app')
    const pid = process.pid
    const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
    if (process.platform === 'win32') {
      // NSIS: /S = silent (keeps the install folder), --force-run = start Hive afterwards
      spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
    } else if (process.platform === 'darwin') {
      const tmp = join(dirname(file), 'unzipped')
      const script = [
        `while kill -0 ${pid} 2>/dev/null; do sleep 0.3; done`,
        `rm -rf ${q(tmp)} && mkdir -p ${q(tmp)} && ditto -x -k ${q(file)} ${q(tmp)}`,
        `NEW="$(ls -d ${q(tmp)}/*.app | head -1)"`,
        `[ -d "$NEW" ] || exit 1`,
        `rm -rf ${q(target + '.old')} && mv ${q(target)} ${q(target + '.old')} && mv "$NEW" ${q(target)} || { mv ${q(target + '.old')} ${q(target)}; open ${q(target)}; exit 1; }`,
        `xattr -cr ${q(target)} 2>/dev/null`,
        `open ${q(target)}`,
        `rm -rf ${q(target + '.old')} ${q(tmp)}`
      ].join('\n')
      spawn('/bin/bash', ['-c', script], { detached: true, stdio: 'ignore' }).unref()
    } else {
      const script = [
        `while kill -0 ${pid} 2>/dev/null; do sleep 0.3; done`,
        `chmod +x ${q(file)} && mv -f ${q(file)} ${q(target)}`,
        `nohup ${q(target)} >/dev/null 2>&1 &`
      ].join('\n')
      spawn('/bin/bash', ['-c', script], { detached: true, stdio: 'ignore' }).unref()
    }
    setTimeout(() => app.quit(), 300)
  }

  ipcMain.handle('update:check', () => check(true))
  ipcMain.handle('update:skip', (_e, version: string) => updateState((s) => (s.settings.skipVersion = version)))
  ipcMain.handle('update:install', async () => {
    if (busy) return
    if (!latest) await check(true)
    if (!latest) throw new Error('Hive is up to date')
    if (!latest.asset || !latest.canInstall) {
      await shell.openExternal(latest.url)
      return 'opened'
    }
    busy = true
    try {
      const file = await download(latest.asset)
      swapAndRestart(file)
      return 'installing'
    } finally {
      busy = false
    }
  })

  // on launch (after a short delay) and every 6 hours
  const auto = (): void => {
    if (getState().settings.autoUpdateCheck !== false && existsSync(app.getPath('userData'))) check().catch(() => undefined)
  }
  setTimeout(auto, 15_000)
  setInterval(auto, 6 * 3600_000)
}
