export interface ChatItem {
  kind: 'user' | 'assistant' | 'tool'
  text: string
  /** tool name (kind = tool) */
  tool?: string
  input?: string
  result?: string
  error?: boolean
  at: number
}

export interface Conversation {
  items: ChatItem[]
  /** tokens in the context window after the last reply */
  context: { used: number; window: number; model: string } | null
}
