import type { RoleDef, SavedPrompt } from './library'
export type { RoleDef, SavedPrompt } from './library'
export type AgentStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error'

export interface Provider {
  id: string
  name: string
  /** Shell command used to launch the CLI */
  command: string
  /** Extra args appended when resuming a previous session (optional) */
  resumeArgs?: string
  /**
   * How to pass the first task on the command line. '' = positional argument,
   * e.g. '-i' = flag. Undefined = type it into the terminal once the CLI is idle.
   */
  promptArg?: string
}

export const DEFAULT_PROVIDERS: Provider[] = [
  { id: 'claude', name: 'Claude Code', command: 'claude', resumeArgs: '--continue', promptArg: '' },
  { id: 'codex', name: 'Codex CLI', command: 'codex', resumeArgs: 'resume --last', promptArg: '' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', promptArg: '-i' },
  { id: 'shell', name: 'Plain shell', command: '' }
]

export const ROLE_PRESETS = [
  { role: 'Frontend Developer', color: '#38bdf8' },
  { role: 'Backend Developer', color: '#a78bfa' },
  { role: 'Full Stack', color: '#f97316' },
  { role: 'Tests / QA', color: '#34d399' },
  { role: 'DevOps', color: '#facc15' },
  { role: 'Code Reviewer', color: '#f472b6' },
  { role: 'Docs Writer', color: '#94a3b8' }
]

export interface Project {
  id: string
  name: string
  path: string
  createdAt: number
}

export interface Agent {
  id: string
  projectId: string
  name: string
  role: string
  color: string
  providerId: string
  /** First prompt sent to the agent once its CLI starts (optional) */
  initialPrompt?: string
  /** If set, the agent works inside its own git worktree on this branch */
  branch?: string
  worktreePath?: string
  /** the lead agent this agent reports to */
  parentId?: string
  /** Claude Code transcripts of this agent's sessions (for usage/cost) */
  sessions?: string[]
  /** total time spent in the 'working' state */
  workMs?: number
  /** role changes made while the agent was running (morphing) */
  roleLog?: { from: string; to: string; at: number }[]
  /** stopped by "Pause project" – resume picks the conversation back up */
  paused?: boolean
  /** agent this one was forked from */
  forkedFrom?: string
  createdAt: number
}

export interface AgentRuntime {
  agentId: string
  status: AgentStatus
  running: boolean
  lastActivity: number
  exitCode?: number
  /** Why the process ended with an error (shown in the UI) */
  exitReason?: string
  /** messages waiting to be typed in, oldest first */
  queue?: QueuedMessage[]
  /** a project pause is waiting for this agent's turn to finish */
  pausing?: boolean
}

export interface QueuedMessage {
  id: string
  text: string
  at: number
}

/** Backlog card */
export interface Task {
  id: string
  projectId: string
  title: string
  body: string
  status: TaskStatus
  agentId?: string
  /** imported from GitHub Issues (read-only link) */
  source?: { kind: 'github'; number: number; url: string; labels?: string[] }
  createdAt: number
  updatedAt: number
}
export type TaskStatus = 'todo' | 'doing' | 'done'

/** A prompt that runs on a schedule */
export interface Schedule {
  id: string
  agentId: string
  title: string
  prompt: string
  kind: 'once' | 'hourly' | 'daily' | 'weekdays' | 'weekly'
  /** HH:MM (daily / weekdays / weekly), minute for hourly */
  time: string
  /** 0 = Sunday (weekly) */
  weekday?: number
  /** epoch ms (once) */
  onceAt?: number
  enabled: boolean
  lastRun?: number
  /** start a fresh session for every run instead of typing into the running one */
  fresh?: boolean
}

/** Reusable procedure agents can look up (MCP get_skill) or you can insert */
export interface Skill {
  id: string
  name: string
  description: string
  body: string
}

/** MCP server shared with every Claude Code agent */
export interface McpServerDef {
  id: string
  name: string
  type: 'stdio' | 'http'
  command?: string
  args?: string
  url?: string
  /** KEY=value per line (stdio env) or header lines (http) */
  env?: string
  enabled: boolean
}

export interface AppState {
  projects: Project[]
  agents: Agent[]
  providers: Provider[]
  prompts: SavedPrompt[]
  roles: RoleDef[]
  servers: DevServer[]
  settings: AppSettings
  tasks: Task[]
  schedules: Schedule[]
  skills: Skill[]
  mcpServers: McpServerDef[]
  /** prompt sent to the assigned agent when a card enters a column ({{title}}, {{body}}) */
  boardPrompts: Record<TaskStatus, string>
  /** project id -> shared memory notes (markdown) */
  memory: Record<string, string>
  /** per-project automation: test guard, budget */
  projectSettings: Record<string, ProjectSettings>
  workflows: Workflow[]
  workflowRuns: WorkflowRun[]
}

export interface ProjectSettings {
  /** run after an agent finishes a turn that changed files; failures go back to the agent */
  testGuard?: boolean
  testCommand?: string
  /** max automatic "fix the tests" round-trips in a row */
  testRetries?: number
  /** daily spend limit in USD (estimated, Claude Code agents) – agents pause when reached */
  dailyBudget?: number
}

export interface TestResult {
  agentId: string
  ok: boolean
  command: string
  output: string
  at: number
  /** sent back to the agent to fix */
  sentBack?: boolean
}

export interface Workflow {
  id: string
  projectId: string
  name: string
  steps: WorkflowStep[]
}
export interface WorkflowStep {
  agentId: string
  /** {{input}} = what you typed when starting, {{previous}} = the previous step's result */
  prompt: string
}
export interface WorkflowRun {
  id: string
  workflowId: string
  projectId: string
  name: string
  input: string
  step: number
  status: 'running' | 'done' | 'stopped' | 'failed'
  log: { step: number; agentId: string; output: string; at: number }[]
  startedAt: number
}

export interface PlanReview {
  agentId: string
  plan: string
  at: number
}

export interface Conflict {
  file: string
  agentIds: string[]
}

/** App-wide settings kept in state.json (UI-only preferences live in the renderer's localStorage). */
export interface AppSettings {
  /** desktop notifications per event */
  notify: { waiting: boolean; done: boolean; error: boolean; whenFocused: boolean; silent: boolean }
  /** dock / taskbar badge with the number of agents waiting for you */
  badge: boolean
  /** CLI pre-selected for new agents */
  defaultProviderId: string
  /** git worktree isolation for new agents: auto = from the 2nd agent on */
  worktreeDefault: 'auto' | 'always' | 'never'
  /** keep the Mac awake while agents work or dev servers run */
  keepAwake: boolean
  /** pause (stop + resume later) agents idle for this many minutes, 0 = never */
  autoPauseMin: number
  /** give Claude agents the project memory: off / read / read-write */
  memoryMode: 'off' | 'read' | 'readwrite'
  /** rules for AI commit messages */
  commitRules: string
  /** OpenAI key for voice dictation (optional – local whisper is used if found) */
  openaiKey: string
  /** dictation language hint, '' = auto */
  dictationLang: string
  /** local speech-to-text command, {file} = path of a 16 kHz WAV */
  whisperCmd: string
  /** let the message box queue messages while the agent is busy */
  queueWhenBusy: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  notify: { waiting: true, done: true, error: true, whenFocused: false, silent: false },
  badge: true,
  defaultProviderId: 'claude',
  worktreeDefault: 'auto',
  keepAwake: true,
  autoPauseMin: 0,
  memoryMode: 'readwrite',
  commitRules: 'Conventional Commits (feat:, fix:, refactor:, docs:, test:, chore:). Imperative mood, subject ≤ 72 chars, short body with the why when useful.',
  openaiKey: '',
  dictationLang: '',
  whisperCmd: '',
  queueWhenBusy: true
}

export const DEFAULT_BOARD_PROMPTS: Record<TaskStatus, string> = {
  todo: '',
  doing: 'Work on this task:\n\n# {{title}}\n\n{{body}}\n\nWhen you are done, summarise what you changed.',
  done: 'Review your work on "{{title}}": run the tests / build, double-check edge cases and tell me anything left to do.'
}

export interface DevServer {
  id: string
  projectId: string
  name: string
  command: string
  /** sub-folder of the project to run in ('' = project root) */
  cwd: string
  /** preview URL override (otherwise detected from the output) */
  url?: string
}

export interface ServerRuntime {
  serverId: string
  running: boolean
  url?: string
  startedAt?: number
  exitCode?: number
}

export interface NewAgentInput {
  projectId: string
  name: string
  role: string
  color: string
  providerId: string
  initialPrompt?: string
  useWorktree: boolean
  /** custom branch name when useWorktree is on (default hive/<name>) */
  branch?: string
  parentId?: string
}

export interface AgentPatch {
  name?: string
  role?: string
  color?: string
  providerId?: string
  initialPrompt?: string
  /** turn worktree isolation on/off (agent must be stopped) */
  useWorktree?: boolean
  /** rename the agent's branch, or choose it when enabling isolation */
  branch?: string
  /** lead agent id, or '' to detach */
  parentId?: string
}

export interface TeamEvent {
  kind: 'task' | 'report'
  from: string
  to: string
  text: string
  at: number
}

export interface GitSummary {
  isRepo: boolean
  branch?: string
  files: { path: string; status: string; added?: number; removed?: number }[]
  diff: string
}
