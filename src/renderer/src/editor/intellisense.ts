/**
 * Feeds Monaco's TypeScript service with the whole workspace so completions work
 * across files and for library APIs: project sources become (hidden) models,
 * dependency type definitions become extra libs, tsconfig "paths" are honoured.
 */
import { monaco } from './monaco'
import { exportsOf, registerCompletions, type ExportEntry } from './completions'

export const SOURCE_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i
const uri = (root: string, path: string): monaco.Uri => monaco.Uri.file(`${root}/${path}`)

export interface WorkspaceInfo {
  files: number
  libs: number
  dispose: () => void
}

/** Lenient JSON (tsconfig allows comments and trailing commas). */
function parseJsonc(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(
      text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
        .replace(/,(\s*[}\]])/g, '$1')
    )
  } catch {
    return null
  }
}

export async function loadWorkspace(root: string, isCancelled: () => boolean): Promise<WorkspaceInfo> {
  const ts = monaco.languages.typescript
  const disposables: monaco.IDisposable[] = []
  const created: monaco.editor.ITextModel[] = []

  // 1) tsconfig paths / baseUrl
  try {
    const cfg = (await window.api.fs.readOptional(root, 'tsconfig.json')) ?? (await window.api.fs.readOptional(root, 'jsconfig.json'))
    const co = (parseJsonc(cfg ?? '')?.compilerOptions ?? {}) as { baseUrl?: string; paths?: Record<string, string[]> }
    if (co.paths || co.baseUrl) {
      for (const d of [ts.typescriptDefaults, ts.javascriptDefaults]) {
        d.setCompilerOptions({
          ...d.getCompilerOptions(),
          baseUrl: uri(root, co.baseUrl ?? '.').toString(),
          paths: co.paths
        })
      }
    }
  } catch {
    /* no tsconfig */
  }

  // 2) dependency type definitions
  let libs = 0
  const libExports: ExportEntry[] = []
  try {
    const typeFiles = await window.api.fs.typeLibs(root)
    if (isCancelled()) return { files: 0, libs: 0, dispose: () => undefined }
    const byPath = new Map(typeFiles.map((f) => [f.path, f.content]))
    for (const f of typeFiles) {
      const u = uri(root, f.path).toString()
      disposables.push(ts.typescriptDefaults.addExtraLib(f.content, u), ts.javascriptDefaults.addExtraLib(f.content, u))
      if (!f.path.endsWith('package.json')) continue
      libs++
      // exports of the package entry, for auto-import
      try {
        const meta = JSON.parse(f.content) as { name?: string; types?: string }
        const dir = f.path.slice(0, -'package.json'.length)
        const entry = byPath.get(dir + (meta.types ?? 'index.d.ts').replace(/^\.\//, '')) ?? byPath.get(dir + 'index.d.ts')
        if (!meta.name || !entry) continue
        const spec = meta.name.startsWith('@types/')
          ? meta.name.slice(7).replace(/^(.+)__(.+)$/, '@$1/$2')
          : meta.name
        if (spec === 'node') continue
        libExports.push(...exportsOf(entry, spec, true))
      } catch {
        /* skip */
      }
    }
  } catch (e) {
    console.warn('[intellisense] type libs', e)
  }

  // 3) project sources as models (opening a file later reuses its model)
  let files = 0
  try {
    const sources = await window.api.fs.sources(root)
    if (isCancelled()) return { files: 0, libs, dispose: () => disposables.forEach((d) => d.dispose()) }
    for (const f of sources) {
      const u = uri(root, f.path)
      if (monaco.editor.getModel(u)) continue
      created.push(monaco.editor.createModel(f.content, undefined, u))
      files++
    }
  } catch (e) {
    console.warn('[intellisense] sources', e)
  }

  // 4) auto-import + import path completion
  let packages: string[] = []
  try {
    const raw = await window.api.fs.readOptional(root, 'package.json')
    if (raw) {
      const pj = JSON.parse(raw)
      packages = Object.keys({ ...pj.dependencies, ...pj.devDependencies, ...pj.peerDependencies })
    }
  } catch {
    /* no package.json */
  }
  const rootPath = monaco.Uri.file(root).path
  const cache = new Map<string, { v: number; e: ExportEntry[] }>()
  const projectIndex = (): ExportEntry[] => {
    const out: ExportEntry[] = []
    for (const m of monaco.editor.getModels()) {
      const p = m.uri.path
      if (!p.startsWith(rootPath + '/') || !SOURCE_RE.test(p) || p.includes('/node_modules/')) continue
      const key = m.uri.toString()
      let c = cache.get(key)
      if (!c || c.v !== m.getVersionId()) {
        c = { v: m.getVersionId(), e: exportsOf(m.getValue(), p.slice(rootPath.length + 1), false) }
        cache.set(key, c)
      }
      out.push(...c.e)
    }
    return out
  }
  disposables.push(registerCompletions(root, () => [...projectIndex(), ...libExports], () => packages))

  return {
    files,
    libs,
    dispose: () => {
      disposables.forEach((d) => d.dispose())
      created.forEach((m) => !m.isDisposed() && m.dispose())
    }
  }
}
