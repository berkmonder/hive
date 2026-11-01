/**
 * Monaco (the VS Code editor) bundled locally – no CDN, works offline.
 */
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  }
}

// The editor can't see node_modules typings, so "cannot find module" errors would be noise.
// Keep syntax errors, drop semantic ones.
for (const d of [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults]) {
  d.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
  d.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true
  })
}

/** Editor theme that follows the app's CSS variables (incl. accent colour). */
export function applyTheme(): void {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string, fb: string): string => css.getPropertyValue(n).trim() || fb
  const accent = v('--accent', '#8b7cf6')
  if (document.documentElement.dataset.theme === 'light') {
    monaco.editor.defineTheme('hive', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '8a8fa3', fontStyle: 'italic' },
        { token: 'keyword', foreground: '8839d6' },
        { token: 'string', foreground: '2e7d32' },
        { token: 'number', foreground: 'c2410c' },
        { token: 'type', foreground: 'a16207' },
        { token: 'type.identifier', foreground: 'a16207' },
        { token: 'delimiter', foreground: '0e7490' },
        { token: 'tag', foreground: '0e7490' },
        { token: 'attribute.name', foreground: 'a21caf' },
        { token: 'string.key.json', foreground: '1d4ed8' }
      ],
      colors: {
        'editor.background': v('--bg', '#ffffff'),
        'editor.foreground': '#1f2330',
        'editorLineNumber.foreground': '#a3a9b8',
        'editorLineNumber.activeForeground': '#3b4152',
        'editor.lineHighlightBackground': '#00000008',
        'editor.selectionBackground': `${accent}40`,
        'editor.inactiveSelectionBackground': `${accent}20`,
        'editorCursor.foreground': accent,
        'editorWidget.background': v('--panel', '#ffffff'),
        'editorWidget.border': v('--border-2', '#d5d9e2'),
        'editorSuggestWidget.background': v('--panel', '#ffffff'),
        'editorSuggestWidget.selectedBackground': `${accent}26`,
        'minimap.background': v('--bg', '#ffffff'),
        focusBorder: `${accent}88`
      }
    })
    monaco.editor.setTheme('hive')
    return
  }
  monaco.editor.defineTheme('hive', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7394', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'string', foreground: 'c3e88d' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'type', foreground: 'ffcb6b' },
      { token: 'type.identifier', foreground: 'ffcb6b' },
      { token: 'identifier', foreground: 'd5d8e2' },
      { token: 'delimiter', foreground: '89ddff' },
      { token: 'tag', foreground: '89ddff' },
      { token: 'attribute.name', foreground: 'f2b8ff' },
      { token: 'attribute.value', foreground: 'c3e88d' },
      { token: 'string.key.json', foreground: '82aaff' },
      { token: 'string.value.json', foreground: 'c3e88d' }
    ],
    colors: {
      'editor.background': v('--bg', '#0e0f13'),
      'editor.foreground': '#d5d8e2',
      'editorLineNumber.foreground': v('--dim', '#5d6375'),
      'editorLineNumber.activeForeground': '#c9cdd8',
      'editor.lineHighlightBackground': '#ffffff08',
      'editor.selectionBackground': `${accent}44`,
      'editor.inactiveSelectionBackground': `${accent}22`,
      'editorCursor.foreground': v('--accent-2', '#a99cff'),
      'editorIndentGuide.background1': '#ffffff10',
      'editorIndentGuide.activeBackground1': '#ffffff28',
      'editorWidget.background': v('--panel-2', '#1c1f27'),
      'editorWidget.border': v('--border-2', '#323746'),
      'editorSuggestWidget.background': v('--panel-2', '#1c1f27'),
      'editorSuggestWidget.selectedBackground': `${accent}33`,
      'list.hoverBackground': '#ffffff0a',
      'scrollbarSlider.background': '#ffffff14',
      'scrollbarSlider.hoverBackground': '#ffffff22',
      'minimap.background': v('--bg', '#0e0f13'),
      focusBorder: `${accent}88`
    }
  })
  monaco.editor.setTheme('hive')
}

export { monaco }
