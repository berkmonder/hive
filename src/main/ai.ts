/**
 * Small AI helpers that run the user's own Claude Code CLI headless (`claude -p`),
 * so they use the same login / subscription – no extra keys, no Hive server.
 */
import { spawn } from 'child_process'
import { basename } from 'path'
import { getState } from './store'

function claudeCommand(): string {
  const p = getState().providers.find((x) => x.id === 'claude')
  return (p?.command || 'claude').trim()
}

/** Run `claude -p` with the prompt on stdin and return its text output. */
export function runClaude(prompt: string, opts: { cwd?: string; args?: string; timeoutMs?: number } = {}): Promise<string> {
  const cmd = `${claudeCommand()} -p --output-format text ${opts.args ?? ''}`
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn('powershell.exe', ['-NoLogo', '-Command', cmd], { cwd: opts.cwd })
        : spawn(shell, ['-l', '-i', '-c', cmd], { cwd: opts.cwd, env: { ...process.env, HIVE_AGENT_ID: '' } })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Claude took too long to answer'))
    }, opts.timeoutMs ?? 120_000)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && out.trim()) resolve(out.trim())
      else reject(new Error(cleanErr(err) || cleanErr(out) || `claude exited with code ${code}`))
    })
    child.stdin.end(prompt)
  })
}

const cleanErr = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').slice(-3).join(' ').slice(0, 300)

/** Conventional-commit message from a diff. Falls back to a plain summary if Claude is unavailable. */
export async function commitMessage(diff: string, files: string[]): Promise<{ message: string; ai: boolean }> {
  const rules = getState().settings.commitRules
  const prompt = [
    'Write a git commit message for the diff below.',
    `Rules: ${rules}`,
    'Output ONLY the commit message (subject line, optionally a blank line and a short body). No quotes, no code fences, no explanations.',
    '',
    `Changed files: ${files.slice(0, 60).join(', ')}`,
    '',
    diff.slice(0, 60_000)
  ].join('\n')
  try {
    const out = await runClaude(prompt, { args: '--model haiku', timeoutMs: 90_000 })
    return { message: out.replace(/^```\w*\n?|```$/g, '').trim(), ai: true }
  } catch {
    const names = files.slice(0, 3).map((f) => basename(f)).join(', ')
    return { message: `chore: update ${files.length} file${files.length === 1 ? '' : 's'}${names ? ` (${names}${files.length > 3 ? ', …' : ''})` : ''}`, ai: false }
  }
}

/** Expand a short request into a structured prompt (goal, context, constraints, done when). */
export async function enhancePrompt(text: string, ctx: { project?: string; role?: string; branch?: string }): Promise<string> {
  const prompt = [
    'Rewrite the request below into a clear, well-structured prompt for an AI coding agent.',
    'Use short sections: Goal, Context, Constraints, Done when. Keep it concise and concrete; do not invent facts about the codebase –',
    'where something is unknown, tell the agent to find out. Write in the same language as the request.',
    'Output ONLY the improved prompt.',
    '',
    ctx.project ? `Project: ${ctx.project}` : '',
    ctx.role ? `Agent role: ${ctx.role}` : '',
    ctx.branch ? `Branch: ${ctx.branch}` : '',
    '',
    'Request:',
    text
  ].join('\n')
  return runClaude(prompt, { args: '--model haiku', timeoutMs: 90_000 })
}

/**
 * Ask a question to a copy of an agent's conversation without interrupting it:
 * the session is forked, read-only (plan mode), and the copy is thrown away.
 */
export function askSide(sessionId: string, cwd: string, question: string): Promise<string> {
  const q = `[Side question from the user – answer briefly from what you already know about this session; do not change any files]\n${question}`
  return runClaude(q, { cwd, args: `--resume ${sessionId} --fork-session --permission-mode plan`, timeoutMs: 180_000 })
}
