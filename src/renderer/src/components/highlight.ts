import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import xml from 'highlight.js/lib/languages/xml'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import kotlin from 'highlight.js/lib/languages/kotlin'
import swift from 'highlight.js/lib/languages/swift'
import csharp from 'highlight.js/lib/languages/csharp'
import cpp from 'highlight.js/lib/languages/cpp'
import php from 'highlight.js/lib/languages/php'
import ruby from 'highlight.js/lib/languages/ruby'
import bash from 'highlight.js/lib/languages/bash'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import sql from 'highlight.js/lib/languages/sql'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import ini from 'highlight.js/lib/languages/ini'

const langs = { javascript, typescript, json, css, scss, xml, python, go, rust, java, kotlin, swift, csharp, cpp, php, ruby, bash, yaml, markdown, sql, dockerfile, ini }
for (const [name, def] of Object.entries(langs)) hljs.registerLanguage(name, def)

const BY_EXT: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  json: 'json', css: 'css', scss: 'scss', less: 'scss',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml',
  py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin', swift: 'swift',
  cs: 'csharp', c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', php: 'php', rb: 'ruby',
  sh: 'bash', zsh: 'bash', bash: 'bash', yml: 'yaml', yaml: 'yaml', md: 'markdown', mdx: 'markdown',
  sql: 'sql', toml: 'ini', ini: 'ini', env: 'ini'
}

export function languageFor(path: string): string | undefined {
  const base = path.split('/').pop()!.toLowerCase()
  if (base === 'dockerfile') return 'dockerfile'
  return BY_EXT[base.split('.').pop() ?? '']
}

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Highlight one line of code to HTML (escaped when the language is unknown). */
export function highlightLine(code: string, lang?: string): string {
  if (!lang || !code) return escape(code)
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
  } catch {
    return escape(code)
  }
}
