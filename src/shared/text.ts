/** Strip ANSI / TUI noise and return the last meaningful line(s) of terminal output. */
export function lastLines(raw: string, count = 1, max = 90): string[] {
  const text = raw
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '') // OSC
    .replace(/\x1b\[[0-9;]*m/g, '') // colors stay inline
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '\n') // other CSI (cursor moves) => line break
    .replace(/\x1b[@-_]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '\n')
  return text
    .split('\n')
    .map((l) => l.replace(/[─-▟]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 2 && /[\p{L}\p{N}]/u.test(l) && !/^\[process exited/.test(l))
    .slice(-count)
    .map((l) => (l.length > max ? l.slice(0, max - 2) + '…' : l))
}

export function lastLine(raw: string): string {
  return lastLines(raw)[0] ?? ''
}

/** Human explanation for a non-zero exit, using the last output line as context. */
export function exitReason(code: number, tail: string, command: string): string {
  const bin = command.trim().split(/\s+/)[0] || 'shell'
  if (code === 127) return `Command not found: "${bin}". Is it installed and on your PATH?`
  if (code === 126) return `"${bin}" is not executable.`
  const line = lastLine(tail)
  return line ? `Exited with code ${code}: ${line}` : `Exited with code ${code}`
}

// ---------- "what is the agent doing" from a rendered screen ----------
/** UI chrome of Claude Code / Codex / Gemini that is never the interesting line. */
const CHROME = [
  /shift\+tab|esc to (interrupt|cancel)|\? for shortcuts|ctrl\+[a-z]|⏵⏵|auto[- ]?mode|accept edits|bypass permissions|plan mode on/i,
  /^\s*(tip|hint):/i,
  /^\s*[─━═╭╮╰╯│┃┌┐└┘├┤\-–—_=\s]+$/,
  /^\s*[>❯›»]\s*/, // prompt / input box
  /^\s*\d+\s*$/,
  /^\s*(\/\w+\s+)?for (help|more)/i,
  /^\s*context left|^\s*\d+% context|tokens? used/i,
  /press (enter|esc)|to continue/i
]
const ACTION = /^\s*[⏺●◉•]\s+(.+)/ // tool call / assistant message bullets
const SPINNER = /^\s*[·✻✳✶✢✽∗*+✦◆⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+([A-Z][\p{L}'’-]+…)/u
const RESULT = /^\s*⎿\s*/

function tidy(s: string, max = 110): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/**
 * Pick the most informative recent line from a rendered terminal screen
 * (bottom-up): the last tool call / message bullet, else a spinner ("Thinking…"),
 * else the last line that isn't UI chrome.
 */
export function pickActivity(lines: string[]): string {
  let spinner = ''
  let fallback = ''
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 80; i--) {
    // drop box borders around input boxes / panels
    const l = lines[i].replace(/^[\s│┃║]+|[\s│┃║]+$/g, '')
    if (!l.trim()) continue
    const sp = l.match(SPINNER)
    if (sp) {
      spinner ||= sp[1]
      continue
    }
    if (CHROME.some((r) => r.test(l))) continue
    const act = l.match(ACTION)
    if (act) return tidy(act[1])
    if (RESULT.test(l)) continue
    if (!fallback && /[\p{L}\p{N}]{3}/u.test(l) && l.trim().length > 6) fallback = l
  }
  return tidy(spinner || fallback)
}
