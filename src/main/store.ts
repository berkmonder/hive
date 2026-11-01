import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AppState, DEFAULT_BOARD_PROMPTS, DEFAULT_PROVIDERS, DEFAULT_SETTINGS } from '@shared/types'
import { DEFAULT_SKILLS } from '@shared/library'
import { DEFAULT_PROMPTS, DEFAULT_ROLES } from '@shared/library'

const file = () => join(app.getPath('userData'), 'state.json')

let state: AppState = { projects: [], agents: [], providers: DEFAULT_PROVIDERS, prompts: DEFAULT_PROMPTS, roles: DEFAULT_ROLES, servers: [], settings: DEFAULT_SETTINGS, tasks: [], schedules: [], skills: DEFAULT_SKILLS, mcpServers: [], boardPrompts: DEFAULT_BOARD_PROMPTS, memory: {}, projectSettings: {}, workflows: [], workflowRuns: [] }

export function loadState(): AppState {
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppState>
      state = {
        projects: raw.projects ?? [],
        agents: raw.agents ?? [],
        // keep user-edited providers, but make sure defaults exist
        providers: mergeProviders(raw.providers ?? []),
        // first run seeds the library; afterwards the user's list is the source of truth
        prompts: raw.prompts ?? DEFAULT_PROMPTS,
        roles: raw.roles ?? DEFAULT_ROLES,
        servers: raw.servers ?? [],
        settings: { ...DEFAULT_SETTINGS, ...raw.settings, notify: { ...DEFAULT_SETTINGS.notify, ...raw.settings?.notify } },
        tasks: raw.tasks ?? [],
        schedules: raw.schedules ?? [],
        skills: raw.skills ?? DEFAULT_SKILLS,
        mcpServers: raw.mcpServers ?? [],
        boardPrompts: { ...DEFAULT_BOARD_PROMPTS, ...raw.boardPrompts },
        memory: raw.memory ?? {},
        projectSettings: raw.projectSettings ?? {},
        workflows: raw.workflows ?? [],
        workflowRuns: raw.workflowRuns ?? []
      }
    }
  } catch (err) {
    console.error('[store] failed to load state, starting fresh', err)
  }
  return state
}

export function mergeProviders(saved: AppState['providers']): AppState['providers'] {
  const byId = new Map(DEFAULT_PROVIDERS.map((p) => [p.id, p]))
  for (const p of saved) byId.set(p.id, { ...byId.get(p.id), ...p }) // user edits win
  return [...byId.values()]
}

export function getState(): AppState {
  return state
}

export function updateState(mutator: (s: AppState) => void): AppState {
  mutator(state)
  save()
  return state
}

function save(): void {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = file() + '.tmp'
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, file()) // atomic replace
}
