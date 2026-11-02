/** Usage / cost report shapes shared by main and renderer. */
export interface Tokens {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
  cost: number
}
export interface UsageEntry extends Tokens {
  day: string // YYYY-MM-DD (local)
  model: string
}
export interface AgentUsage extends Tokens {
  agentId: string
  sessions: number
  messages: number
  workMs: number
  models: string[]
  days: Record<string, number> // day -> cost
  /** messages you sent */
  prompts: number
  promptDays: Record<string, number> // day -> prompts
}
export interface UsageReport {
  agents: AgentUsage[]
  folder: Tokens & { sessions: number; days: Record<string, number> }
  generatedAt: number
}

