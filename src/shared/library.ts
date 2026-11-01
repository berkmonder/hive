/** Built-in prompt and role library (users can edit/extend these in the app). */

export interface SavedPrompt {
  id: string
  title: string
  body: string
}

export interface RoleDef {
  id: string
  name: string
  color: string
  /** extra instructions given to the agent's CLI for every session (Claude Code: --append-system-prompt) */
  instructions: string
}

/** Variables usable in prompts: {{agent}} {{role}} {{branch}} {{project}} */
export const PROMPT_VARS = ['agent', 'role', 'branch', 'project'] as const

export const DEFAULT_PROMPTS: SavedPrompt[] = [
  {
    id: 'p-review',
    title: 'Review my changes',
    body:
      'Review the uncommitted changes in this repository (git diff, including untracked files). Point out bugs, security problems, missing tests and readability issues. Group findings by severity with file:line references and a concrete fix for each. Do not change any code yet.'
  },
  {
    id: 'p-tests',
    title: 'Write tests for recent changes',
    body:
      'Add or update automated tests for the changes on this branch. Follow the existing test framework and conventions, cover edge cases and error paths, then run the test suite and fix anything that fails.'
  },
  {
    id: 'p-fix',
    title: 'Make tests and lint pass',
    body:
      "Find and run this project's test, lint and type-check commands. Fix every failure with the smallest correct change, re-run until everything passes, and summarise what you fixed."
  },
  {
    id: 'p-tour',
    title: 'Explain this codebase',
    body:
      'Give me a concise tour of this codebase: what it does, the main folders and entry points, how data flows through it, and how to run, test and deploy it. Keep it under 30 lines.'
  },
  {
    id: 'p-pr',
    title: 'Write a PR description',
    body:
      'Write a pull request title and description for the changes on {{branch}} compared to the main branch: summary, motivation, notable changes, how it was tested, and risks or follow-ups. Output it as Markdown.'
  },
  {
    id: 'p-security',
    title: 'Security check',
    body:
      'Audit the changes on this branch for security issues: injection, authentication/authorisation gaps, secrets in code, unsafe deserialisation, path traversal, risky dependencies. Report each finding with file:line, severity and a fix.'
  },
  {
    id: 'p-cleanup',
    title: 'Clean up without changing behaviour',
    body:
      'Simplify and tidy the code you changed in this session without changing behaviour: remove dead code, improve names, reduce duplication, keep diffs small. Run the tests afterwards.'
  },
  {
    id: 'p-commit',
    title: 'Commit my work',
    body: 'Stage your changes and create a commit with a clear conventional-commit message describing what and why. Do not push.'
  },
  {
    id: 'p-status',
    title: 'Status report',
    body: 'In at most 5 bullet points: what you have done so far, what is left, and anything blocking you or needing my decision.'
  }
]

export const DEFAULT_ROLES: RoleDef[] = [
  {
    id: 'r-frontend',
    name: 'Frontend Developer',
    color: '#38bdf8',
    instructions:
      'You are a senior frontend engineer. Focus on UI components, accessibility, responsive layout and client-side state. Follow the existing design system and styling conventions, avoid new dependencies unless necessary, and verify changes in the running app when a dev server is available.'
  },
  {
    id: 'r-backend',
    name: 'Backend Developer',
    color: '#a78bfa',
    instructions:
      'You are a senior backend engineer. Focus on APIs, data models, validation, error handling and performance. Keep endpoints backwards compatible unless asked otherwise, write or update tests for every behaviour change, and never log secrets.'
  },
  {
    id: 'r-fullstack',
    name: 'Full Stack',
    color: '#f97316',
    instructions:
      'You are a senior full-stack engineer. Deliver features end to end (API, UI, tests) in small, reviewable steps and keep frontend and backend contracts in sync.'
  },
  {
    id: 'r-qa',
    name: 'Tests / QA',
    color: '#34d399',
    instructions:
      'You are a QA engineer. Your job is tests: write and improve automated tests, reproduce reported bugs with a failing test first, and keep the suite fast and reliable. Only change production code when a test proves a bug.'
  },
  {
    id: 'r-devops',
    name: 'DevOps',
    color: '#facc15',
    instructions:
      'You are a DevOps engineer. Focus on build, CI/CD, containers, infrastructure-as-code and developer tooling. Prefer reproducible, documented changes; never run destructive commands against shared environments without asking.'
  },
  {
    id: 'r-reviewer',
    name: 'Code Reviewer',
    color: '#f472b6',
    instructions:
      'You are a meticulous code reviewer. Do NOT modify files. Read diffs and code, then report findings grouped by severity (blocker, major, minor, nit) with file:line references and suggested fixes.'
  },
  {
    id: 'r-docs',
    name: 'Docs Writer',
    color: '#94a3b8',
    instructions:
      'You are a technical writer. Keep README, guides and code comments accurate and concise. Write for a new team member, include runnable examples, and do not change application code.'
  }
]

/**
 * Prompt chaining: {{prompt:Title}} pulls in another saved prompt, {{skill:name}} a skill's steps.
 * Shared rules live in one prompt and are reused everywhere (nested up to 5 levels).
 */
export function expandRefs(body: string, prompts: SavedPrompt[], skills: { name: string; body: string }[] = [], depth = 0): string {
  if (depth > 5) return body
  return body.replace(/\{\{\s*(prompt|skill)\s*:\s*([^}]+?)\s*\}\}/gi, (m, kind: string, name: string) => {
    const n = name.toLowerCase()
    if (kind.toLowerCase() === 'skill') return skills.find((s) => s.name.toLowerCase() === n)?.body ?? m
    const p = prompts.find((x) => x.title.toLowerCase() === n || x.id === name)
    return p ? expandRefs(p.body, prompts, skills, depth + 1) : m
  })
}

export function fillPrompt(body: string, vars: Partial<Record<(typeof PROMPT_VARS)[number], string>>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => vars[k as keyof typeof vars] ?? m)
}

import type { Skill } from './types'

/** Starter skills – procedures any agent can look up with get_skill or you can insert from ⌘K */
export const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'sk-release',
    name: 'release-checklist',
    description: 'Steps before tagging a release',
    body: '1. Make sure the working tree is clean and on the main branch.\n2. Run the full test suite and the production build.\n3. Update CHANGELOG.md with user-facing changes since the last tag.\n4. Bump the version (semver) in package files.\n5. Commit "chore(release): vX.Y.Z", tag vX.Y.Z, and report the commands to push (do not push yourself).'
  },
  {
    id: 'sk-bugfix',
    name: 'bug-fix',
    description: 'Reproduce → failing test → fix → verify',
    body: '1. Reproduce the bug and describe the root cause in one paragraph.\n2. Write a failing test that captures it.\n3. Make the smallest fix that makes the test pass.\n4. Run the related test files and the linter.\n5. Summarise cause, fix and any risk.'
  },
  {
    id: 'sk-endpoint',
    name: 'new-api-endpoint',
    description: 'Add an API endpoint the way this project does it',
    body: '1. Find two existing endpoints and follow their structure (routing, validation, error handling, naming).\n2. Add input validation and typed request/response models.\n3. Add tests for success, validation error and not-found/unauthorised cases.\n4. Document the endpoint (README or OpenAPI) if the project does so.'
  }
]
