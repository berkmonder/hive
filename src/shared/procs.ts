export interface ProcInfo {
  pid: number
  agentId: string
  command: string
  cpu: number
  memMb: number
  elapsed: string
  /** still running although it is no longer inside the agent's process tree */
  leftover: boolean
}
