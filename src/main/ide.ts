/**
 * Detect installed desktop IDEs and open a folder (or a file at a line) in them.
 *
 * We call each IDE's own launcher instead of `open -n`, because launchers hand the
 * request to an already running IDE window (`open -n` starts a second copy, which
 * JetBrains IDEs and VS Code ignore or refuse).
 *   VS Code family : <App>/Contents/Resources/app/bin/<code|cursor|windsurf>  folder -g file:line
 *   JetBrains      : <App>/Contents/MacOS/<webstorm|idea|…>                   folder | --line N file
 *   others         : open -a <App> folder [file]
 */
import { execFile, spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface Ide {
  id: string
  name: string
  family: 'vscode' | 'jetbrains' | 'other'
}

type MacEntry = Ide & { app: string[]; cli?: string }

const MAC_APPS: MacEntry[] = [
  { id: 'vscode', name: 'VS Code', family: 'vscode', app: ['Visual Studio Code.app'], cli: 'code' },
  { id: 'cursor', name: 'Cursor', family: 'vscode', app: ['Cursor.app'], cli: 'cursor' },
  { id: 'windsurf', name: 'Windsurf', family: 'vscode', app: ['Windsurf.app'], cli: 'windsurf' },
  { id: 'webstorm', name: 'WebStorm', family: 'jetbrains', app: ['WebStorm.app'] },
  { id: 'idea', name: 'IntelliJ IDEA', family: 'jetbrains', app: ['IntelliJ IDEA.app', 'IntelliJ IDEA Ultimate.app', 'IntelliJ IDEA CE.app', 'IntelliJ IDEA Community Edition.app'] },
  { id: 'pycharm', name: 'PyCharm', family: 'jetbrains', app: ['PyCharm.app', 'PyCharm Professional Edition.app', 'PyCharm CE.app', 'PyCharm Community Edition.app'] },
  { id: 'goland', name: 'GoLand', family: 'jetbrains', app: ['GoLand.app'] },
  { id: 'phpstorm', name: 'PhpStorm', family: 'jetbrains', app: ['PhpStorm.app'] },
  { id: 'rider', name: 'Rider', family: 'jetbrains', app: ['Rider.app'] },
  { id: 'rustrover', name: 'RustRover', family: 'jetbrains', app: ['RustRover.app'] },
  { id: 'clion', name: 'CLion', family: 'jetbrains', app: ['CLion.app'] },
  { id: 'rubymine', name: 'RubyMine', family: 'jetbrains', app: ['RubyMine.app'] },
  { id: 'datagrip', name: 'DataGrip', family: 'jetbrains', app: ['DataGrip.app'] },
  { id: 'studio', name: 'Android Studio', family: 'jetbrains', app: ['Android Studio.app'] },
  { id: 'fleet', name: 'Fleet', family: 'other', app: ['Fleet.app'] },
  { id: 'zed', name: 'Zed', family: 'other', app: ['Zed.app'] },
  { id: 'sublime', name: 'Sublime Text', family: 'other', app: ['Sublime Text.app'] },
  { id: 'xcode', name: 'Xcode', family: 'other', app: ['Xcode.app'] }
]

const CLI: (Ide & { bin: string })[] = [
  { id: 'vscode', name: 'VS Code', family: 'vscode', bin: 'code' },
  { id: 'cursor', name: 'Cursor', family: 'vscode', bin: 'cursor' },
  { id: 'idea', name: 'IntelliJ IDEA', family: 'jetbrains', bin: 'idea' },
  { id: 'webstorm', name: 'WebStorm', family: 'jetbrains', bin: 'webstorm' },
  { id: 'pycharm', name: 'PyCharm', family: 'jetbrains', bin: 'pycharm' },
  { id: 'goland', name: 'GoLand', family: 'jetbrains', bin: 'goland' },
  { id: 'zed', name: 'Zed', family: 'other', bin: 'zed' }
]

function findMacApp(names: string[]): string | null {
  const dirs = ['/Applications', join(homedir(), 'Applications'), '/Applications/JetBrains Toolbox', join(homedir(), 'Applications/JetBrains Toolbox')]
  for (const d of dirs) for (const n of names) if (existsSync(join(d, n))) return join(d, n)
  return null
}

/** The launcher binary inside a JetBrains .app (e.g. Contents/MacOS/webstorm). */
function jetbrainsBinary(app: string): string | null {
  const dir = join(app, 'Contents', 'MacOS')
  try {
    const bins = readdirSync(dir).filter((f) => !f.startsWith('.') && !/^(restarter|fsnotifier|printenv|repair|.*\.(sh|py))$/.test(f))
    return bins.length ? join(dir, bins[0]) : null
  } catch {
    return null
  }
}

/** Environment without Electron/Hive variables that could confuse other Electron apps (VS Code, Cursor). */
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) if (!/^(ELECTRON_|VSCODE_|AGENTROOM_|HIVE_|CHROME_)/.test(k)) env[k] = v
  return env
}

/**
 * Start a detached process. Resolves once it is clearly running (or finished OK);
 * rejects with its error output if it fails right away.
 */
function launch(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = ''
    let settled = false
    const done = (err?: Error): void => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }
    let child
    try {
      child = spawn(cmd, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: cleanEnv() })
    } catch (err) {
      return done(err as Error)
    }
    child.stderr?.on('data', (d) => (stderr += String(d)))
    child.on('error', (err) => done(err))
    child.on('exit', (code) => (code === 0 ? done() : done(new Error(stderr.trim().split('\n').slice(-3).join(' ') || `${cmd} exited with code ${code}`))))
    setTimeout(() => {
      child.stderr?.removeAllListeners()
      child.stderr?.destroy()
      child.unref()
      done()
    }, 2500)
  })
}

const which = (bin: string): Promise<boolean> =>
  new Promise((res) => execFile(process.platform === 'win32' ? 'where' : 'which', [bin], (err) => res(!err)))

let cache: Ide[] | null = null

export async function listIdes(): Promise<Ide[]> {
  if (cache) return cache
  const found: Ide[] = []
  if (process.platform === 'darwin') {
    for (const a of MAC_APPS) if (findMacApp(a.app)) found.push({ id: a.id, name: a.name, family: a.family })
  } else {
    for (const c of CLI) if (await which(c.bin)) found.push({ id: c.id, name: c.name, family: c.family })
  }
  if (found.length) cache = found
  return found
}

/** Open `folder` (and optionally `file` at `line`) in the given IDE. */
export async function openInIde(id: string, folder: string, file?: string, line?: number): Promise<void> {
  const at = line && line > 0 ? line : 1
  if (process.platform === 'darwin') {
    const entry = MAC_APPS.find((a) => a.id === id)
    const app = entry && findMacApp(entry.app)
    if (!entry || !app) throw new Error(`${entry?.name ?? id} is not installed`)

    if (entry.family === 'vscode') {
      const cli = join(app, 'Contents', 'Resources', 'app', 'bin', entry.cli ?? 'code')
      if (existsSync(cli)) return launch(cli, [folder, ...(file ? ['-g', `${file}:${at}`] : [])])
    }
    if (entry.family === 'jetbrains') {
      const bin = jetbrainsBinary(app)
      if (bin) {
        // open the project first, then the file inside it at the line
        await launch(bin, [folder])
        if (file) {
          await new Promise((r) => setTimeout(r, 800))
          await launch(bin, ['--line', String(at), file])
        }
        return
      }
    }
    // generic macOS way: send the folder/file as "open document" events to the app
    return launch('open', ['-a', app, folder, ...(file ? [file] : [])])
  }

  const c = CLI.find((x) => x.id === id)
  if (!c) throw new Error(`Unknown IDE ${id}`)
  const args =
    c.family === 'vscode' ? [folder, ...(file ? ['-g', `${file}:${at}`] : [])]
    : c.family === 'jetbrains' ? (file ? ['--line', String(at), file] : [folder])
    : [folder, ...(file ? [file] : [])]
  if (process.platform === 'win32') {
    spawn(c.bin, args, { detached: true, stdio: 'ignore', shell: true, env: cleanEnv() }).unref()
    return
  }
  return launch(c.bin, args)
}
