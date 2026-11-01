export interface ReplayTurn {
  index: number
  at: number
  user: string
  replies: string[]
  tools: { name: string; arg: string; resultChars: number }[]
  /** context window size after this turn (tokens) */
  context: number
  /** how much this turn added to the context */
  delta: number
  output: number
  model: string
}

export interface WeeklyReport {
  project: string
  from: number
  to: number
  agents: {
    agentId: string
    name: string
    role: string
    color: string
    cost: number
    commits: { hash: string; subject: string; at: number }[]
    added: number
    removed: number
    tasksDone: string[]
    roleChanges: number
  }[]
  daily: { day: string; cost: number }[]
  topFiles: { file: string; n: number }[]
  workflows: number
  cardsDone: number
  cardsOpen: number
}
