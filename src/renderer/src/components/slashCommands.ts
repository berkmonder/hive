/** Built-in slash commands of each CLI, shown when you type "/" in the composer. */
export type SlashCommand = { name: string; desc: string; source: string }

const b = (list: [string, string][]): SlashCommand[] => list.map(([name, desc]) => ({ name, desc, source: 'built-in' }))

export const BUILTIN_SLASH: Record<string, SlashCommand[]> = {
  claude: b([
    ['clear', 'Clear the conversation and free up context'],
    ['compact', 'Summarise the conversation to free up context (optional focus)'],
    ['context', 'Show what fills the context window'],
    ['model', 'Switch the model'],
    ['resume', 'Resume an earlier conversation'],
    ['rewind', 'Go back to an earlier point in the conversation'],
    ['review', 'Review a pull request'],
    ['security-review', 'Security review of the pending changes'],
    ['init', 'Create a CLAUDE.md for this project'],
    ['memory', 'Edit CLAUDE.md memory files'],
    ['agents', 'Manage subagents'],
    ['mcp', 'Manage MCP servers'],
    ['permissions', 'View or change tool permissions'],
    ['hooks', 'Manage hooks'],
    ['add-dir', 'Add another working directory'],
    ['config', 'Open settings'],
    ['status', 'Version, model, account and connectivity'],
    ['cost', 'Token usage and cost of this session'],
    ['usage', 'Plan usage limits'],
    ['todos', 'Show the current todo list'],
    ['export', 'Export the conversation'],
    ['pr-comments', 'Get comments from a GitHub pull request'],
    ['plugin', 'Manage plugins'],
    ['doctor', 'Check the installation'],
    ['login', 'Sign in'],
    ['logout', 'Sign out'],
    ['bug', 'Report a bug'],
    ['help', 'Show help'],
    ['exit', 'Quit Claude Code']
  ]),
  codex: b([
    ['model', 'Choose the model and reasoning effort'],
    ['approvals', 'Choose what Codex may do without asking'],
    ['new', 'Start a new conversation'],
    ['resume', 'Resume an earlier conversation'],
    ['compact', 'Summarise the conversation to free up context'],
    ['review', 'Review the current changes'],
    ['diff', 'Show the git diff'],
    ['init', 'Create an AGENTS.md for this project'],
    ['mention', 'Mention a file'],
    ['status', 'Session configuration and token usage'],
    ['mcp', 'List MCP tools'],
    ['logout', 'Sign out'],
    ['quit', 'Quit Codex']
  ]),
  gemini: b([
    ['clear', 'Clear the screen and conversation'],
    ['compress', 'Replace the context with a summary'],
    ['chat', 'Save / resume / list conversation checkpoints'],
    ['memory', 'Show, add to or refresh GEMINI.md memory'],
    ['restore', 'Restore files to before a tool ran'],
    ['stats', 'Session statistics'],
    ['tools', 'List available tools'],
    ['mcp', 'List MCP servers and tools'],
    ['model', 'Switch the model'],
    ['directory', 'Manage workspace directories'],
    ['init', 'Create a GEMINI.md for this project'],
    ['copy', 'Copy the last answer'],
    ['auth', 'Change the sign-in method'],
    ['settings', 'Open settings'],
    ['help', 'Show help'],
    ['quit', 'Quit Gemini CLI']
  ])
}

/** Ranks by name prefix first, then name / description contains. */
export function matchSlash(all: SlashCommand[], q: string): SlashCommand[] {
  const s = q.toLowerCase()
  if (!s) return all
  const pre = all.filter((c) => c.name.toLowerCase().startsWith(s))
  const has = all.filter((c) => !pre.includes(c) && (c.name.toLowerCase().includes(s) || c.desc.toLowerCase().includes(s)))
  return [...pre, ...has]
}
