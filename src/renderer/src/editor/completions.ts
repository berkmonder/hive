/**
 * VS Code-style extras Monaco lacks out of the box:
 *  - auto-import: suggest exported symbols from other project files / packages that
 *    aren't imported yet, and add the import line when accepted
 *  - import path completion: './lib/' lists folders and files, bare specifiers list packages
 */
import { monaco } from './monaco'

export interface ExportEntry {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum'
  /** project file path relative to root (no leading ./), or a package name */
  from: string
  pkg: boolean
}

const EXPORT_RE =
  /export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(function\*?|const|let|var|class|abstract\s+class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g
const EXPORT_LIST_RE = /export\s*\{([^}]*)\}/g

function kindOf(k: string): ExportEntry['kind'] {
  if (k.startsWith('function')) return 'function'
  if (k.includes('class')) return 'class'
  if (k === 'interface') return 'interface'
  if (k === 'type') return 'type'
  if (k === 'enum') return 'enum'
  return 'const'
}

export function exportsOf(source: string, from: string, pkg: boolean): ExportEntry[] {
  const out: ExportEntry[] = []
  const seen = new Set<string>()
  for (const m of source.matchAll(EXPORT_RE)) {
    if (seen.has(m[2])) continue
    seen.add(m[2])
    out.push({ name: m[2], kind: kindOf(m[1]), from, pkg })
  }
  for (const m of source.matchAll(EXPORT_LIST_RE)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name && /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default' && !seen.has(name)) {
        seen.add(name)
        out.push({ name, kind: 'const', from, pkg })
      }
    }
  }
  return out
}

const KIND: Record<ExportEntry['kind'], monaco.languages.CompletionItemKind> = {
  function: monaco.languages.CompletionItemKind.Function,
  class: monaco.languages.CompletionItemKind.Class,
  interface: monaco.languages.CompletionItemKind.Interface,
  type: monaco.languages.CompletionItemKind.TypeParameter,
  const: monaco.languages.CompletionItemKind.Constant,
  enum: monaco.languages.CompletionItemKind.Enum
}

const LANGS = ['typescript', 'javascript']
const STRIP_EXT = /\.(d\.ts|tsx?|jsx?|mts|cts|mjs|cjs)$/

/** Relative import specifier from one project file to another. */
function specifier(fromFile: string, toFile: string): string {
  const a = fromFile.split('/').slice(0, -1)
  const b = toFile.replace(STRIP_EXT, '').replace(/\/index$/, '').split('/')
  let i = 0
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
  const up = a.length - i
  const rest = b.slice(i).join('/')
  return (up === 0 ? './' : '../'.repeat(up)) + rest
}

export function registerCompletions(
  root: string,
  getIndex: () => ExportEntry[],
  getPackages: () => string[]
): monaco.IDisposable {
  const rootPath = monaco.Uri.file(root).path
  const relOf = (model: monaco.editor.ITextModel): string | null =>
    model.uri.path.startsWith(rootPath + '/') ? model.uri.path.slice(rootPath.length + 1) : null

  const disposables: monaco.IDisposable[] = []

  // ---------- auto-import ----------
  for (const lang of LANGS) {
    disposables.push(
      monaco.languages.registerCompletionItemProvider(lang, {
        provideCompletionItems(model, position) {
          const file = relOf(model)
          if (!file) return { suggestions: [] }
          const word = model.getWordUntilPosition(position)
          if (word.word.length < 2) return { suggestions: [] }
          const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1)
          if (/\bimport\b|['"`]$|\.\s*$/.test(before)) return { suggestions: [] } // not in import lines or after a dot
          const text = model.getValue()
          const imported = new Set<string>()
          for (const m of text.matchAll(/import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
            if (m[1]) imported.add(m[1])
            m[2]?.split(',').forEach((p) => imported.add(p.trim().split(/\s+as\s+/).pop()!.trim()))
          }
          const declared = new Set(exportsOf(text, '', false).map((e) => e.name))
          const prefix = word.word.toLowerCase()
          const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)

          const suggestions: monaco.languages.CompletionItem[] = []
          for (const e of getIndex()) {
            if (suggestions.length > 80) break
            if (!e.name.toLowerCase().startsWith(prefix) || imported.has(e.name) || declared.has(e.name)) continue
            if (!e.pkg && e.from === file) continue
            const spec = e.pkg ? e.from : specifier(file, e.from)
            suggestions.push({
              label: { label: e.name, description: spec },
              kind: KIND[e.kind],
              detail: `Auto import from '${spec}'`,
              insertText: e.name,
              range,
              sortText: `~${e.pkg ? 1 : 0}${e.name}`,
              additionalTextEdits: [importEdit(model, e.name, spec, e.kind === 'interface' || e.kind === 'type')]
            })
          }
          return { suggestions }
        }
      })
    )
  }

  // ---------- import path completion ----------
  for (const lang of LANGS) {
    disposables.push(
      monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ['/', "'", '"'],
        async provideCompletionItems(model, position) {
          const file = relOf(model)
          if (!file) return { suggestions: [] }
          const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
          const m = line.match(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+|\bexport\s+\*\s+from\s+)(['"])([^'"]*)$/)
          if (!m) return { suggestions: [] }
          const spec = m[2]
          const lastSlash = spec.lastIndexOf('/')
          const range = new monaco.Range(position.lineNumber, position.column - (spec.length - lastSlash - 1), position.lineNumber, position.column)

          if (!spec.startsWith('.')) {
            return {
              suggestions: getPackages().map((p) => ({
                label: p, kind: monaco.languages.CompletionItemKind.Module, insertText: p, detail: 'package',
                range: new monaco.Range(position.lineNumber, position.column - spec.length, position.lineNumber, position.column)
              }))
            }
          }
          // resolve the directory part relative to the current file
          const parts = [...file.split('/').slice(0, -1), ...spec.slice(0, lastSlash + 1).split('/')]
          const dir: string[] = []
          for (const p of parts) p === '..' ? dir.pop() : p && p !== '.' && dir.push(p)
          let entries: { name: string; dir: boolean }[] = []
          try {
            entries = await window.api.fs.list(root, dir.join('/'))
          } catch {
            return { suggestions: [] }
          }
          const self = file.split('/').pop()
          return {
            suggestions: entries
              .filter((e) => e.dir || (/\.(tsx?|jsx?|mjs|cjs|json|css|scss|svg|png)$/.test(e.name) && e.name !== self && !e.name.endsWith('.d.ts')))
              .map((e) => {
                const label = e.dir ? e.name : /\.(tsx?|jsx?|mjs|cjs)$/.test(e.name) ? e.name.replace(STRIP_EXT, '') : e.name
                return {
                  label: e.dir ? `${label}/` : label,
                  kind: e.dir ? monaco.languages.CompletionItemKind.Folder : monaco.languages.CompletionItemKind.File,
                  insertText: e.dir ? `${label}/` : label,
                  range,
                  sortText: (e.dir ? '0' : '1') + label,
                  command: e.dir ? { id: 'editor.action.triggerSuggest', title: 'more' } : undefined
                }
              })
          }
        }
      })
    )
  }

  return { dispose: () => disposables.forEach((d) => d.dispose()) }
}

/** Text edit that adds `name` to an existing import from `spec`, or a new import line. */
function importEdit(model: monaco.editor.ITextModel, name: string, spec: string, typeOnly: boolean): monaco.languages.TextEdit {
  const lines = model.getLinesContent()
  const quote = lines.some((l) => /^import .* from "/.test(l)) ? '"' : "'"
  const semi = lines.some((l) => /^import .*;\s*$/.test(l)) ? ';' : ''
  const esc = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^(import\\s+(?:type\\s+)?(?:[\\w$]+\\s*,\\s*)?\\{)([^}]*)(\\}\\s*from\\s*['"]${esc}['"])`))
    if (m) {
      const items = m[2].trim().replace(/,\s*$/, '')
      const next = `${m[1]} ${items ? `${items}, ` : ''}${name} ${m[3]}`
      return { range: new monaco.Range(i + 1, 1, i + 1, m[0].length + 1), text: next.replace(/\{\s+/, '{ ') }
    }
  }
  let last = 0
  lines.forEach((l, i) => /^import\b/.test(l) && (last = i + 1))
  // skip a leading "use client" / shebang
  if (!last && /^(['"]use \w+['"]|#!)/.test(lines[0] ?? '')) last = 1
  return {
    range: new monaco.Range(last + 1, 1, last + 1, 1),
    text: `import ${typeOnly ? 'type ' : ''}{ ${name} } from ${quote}${spec}${quote}${semi}\n${last === 0 && lines[0]?.trim() ? '\n' : ''}`
  }
}
