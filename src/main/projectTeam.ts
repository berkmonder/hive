/**
 * New projects start with the same agents (team) as your template project:
 * the one chosen in Settings, otherwise the first project you created that has agents.
 */
import { randomUUID } from 'crypto'
import type { Agent, Project } from '@shared/types'
import { getState, updateState } from './store'
import * as git from './git'

/** project whose agents new projects get (undefined = none / turned off) */
export function teamSource(exceptId?: string): Project | undefined {
  const st = getState()
  const pick = st.settings.newProjectAgents
  if (pick === 'none') return undefined
  const has = (p: Project): boolean => p.id !== exceptId && st.agents.some((a) => a.projectId === p.id)
  const chosen = pick ? st.projects.find((p) => p.id === pick) : undefined
  if (chosen && has(chosen)) return chosen
  return [...st.projects].sort((a, b) => a.createdAt - b.createdAt).find(has)
}

/** Copies every agent of `fromId` into `toId` (names, roles, CLIs, accounts, who leads whom). Not started. */
export async function copyTeam(fromId: string, toId: string): Promise<Agent[]> {
  const st = getState()
  const to = st.projects.find((p) => p.id === toId)
  if (!to) throw new Error('Project not found')
  const src = st.agents.filter((a) => a.projectId === fromId)
  const ids = new Map(src.map((a) => [a.id, randomUUID()]))
  const repo = src.some((a) => a.worktreePath) ? await git.isRepo(to.path).catch(() => false) : false
  const out: Agent[] = []
  for (const a of src) {
    const agent: Agent = {
      id: ids.get(a.id)!,
      projectId: toId,
      name: a.name,
      role: a.role,
      color: a.color,
      providerId: a.providerId,
      initialPrompt: a.initialPrompt,
      parentId: a.parentId ? ids.get(a.parentId) : undefined,
      accountId: a.accountId,
      effort: a.effort,
      createdAt: Date.now()
    }
    // keep worktree isolation where the new project allows it (git repo with a commit)
    if (a.worktreePath && repo) {
      try {
        Object.assign(agent, await git.createWorktree(to.path, agent.name, agent.id))
      } catch {
        /* no commits yet – the agent works in the project folder */
      }
    }
    out.push(agent)
  }
  updateState((s) => s.agents.push(...out))
  return out
}

/** called right after a project is created */
export async function seedNewProject(project: Project): Promise<void> {
  const from = teamSource(project.id)
  if (!from) return
  try {
    await copyTeam(from.id, project.id)
  } catch (e) {
    console.warn('[projects] could not copy the team', e)
  }
}
