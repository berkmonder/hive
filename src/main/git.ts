import simpleGit from 'simple-git'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { basename, dirname, join } from 'path'
import { GitSummary } from '@shared/types'

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ı/g, 'i')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent'
  )
}

export async function isRepo(path: string): Promise<boolean> {
  try {
    return await simpleGit(path).checkIsRepo()
  } catch {
    return false
  }
}

/**
 * Creates `<parent>/.hive-worktrees/<project>/<slug>` on branch
 * `hive/<slug>` so every agent edits its own copy of the repo.
 */
export async function createWorktree(
  projectPath: string,
  agentName: string,
  agentId: string,
  branchName?: string,
  startPoint?: string
): Promise<{ branch: string; worktreePath: string }> {
  const git = simpleGit(projectPath)
  if (!(await git.checkIsRepo())) throw new Error('Project is not a git repository')
  const log = await git.log({ maxCount: 1 }).catch(() => null)
  if (!log?.latest) throw new Error('Repository has no commits yet – make an initial commit first')

  const slug = `${slugify(agentName)}-${agentId.slice(0, 4)}`
  const branch = branchName?.trim() || `hive/${slug}`
  await assertValidBranch(git, branch)
  const exists = (await git.branchLocal()).all.includes(branch)
  const root = join(dirname(projectPath), '.hive-worktrees', basename(projectPath))
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  const worktreePath = join(root, slug)
  // reuse an existing branch (e.g. when re-enabling isolation) or create a new one
  await git.raw(exists ? ['worktree', 'add', worktreePath, branch] : ['worktree', 'add', '-b', branch, worktreePath, ...(startPoint ? [startPoint] : [])])
  return { branch, worktreePath }
}

export async function removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
  try {
    await simpleGit(projectPath).raw(['worktree', 'remove', '--force', worktreePath])
  } catch (err) {
    console.warn('[git] worktree remove failed', err)
  }
}

export async function summary(cwd: string): Promise<GitSummary> {
  if (!existsSync(cwd) || !(await isRepo(cwd))) return { isRepo: false, files: [], diff: '' }
  const git = simpleGit(cwd)
  const status = await git.status()
  const files: GitSummary['files'] = status.files.map((f) => ({
    path: f.path,
    status: (f.index + f.working_dir).trim() || '?'
  }))
  // per-file +/- counts
  try {
    const numstat = await git.raw(['diff', '--numstat', 'HEAD'])
    for (const line of numstat.split('\n')) {
      const [add, del, ...rest] = line.split('\t')
      const f = files.find((x) => x.path === rest.join('\t'))
      if (f) Object.assign(f, { added: Number(add) || 0, removed: Number(del) || 0 })
    }
  } catch {
    /* no HEAD yet */
  }
  let diff = ''
  try {
    diff = await git.diff(['HEAD'])
  } catch {
    diff = await git.diff()
  }
  // show untracked files as additions too
  for (const f of status.not_added.slice(0, 20)) diff += `\n--- /dev/null\n+++ b/${f}\n(new untracked file)\n`
  return { isRepo: true, branch: status.current ?? undefined, files, diff: diff.slice(0, 400_000) }
}

export async function commitAll(cwd: string, message: string): Promise<string> {
  const git = simpleGit(cwd)
  await git.add(['-A'])
  const res = await git.commit(message)
  return res.commit
}

/** Merge an agent's branch into whatever branch the main project folder has checked out. */
export async function mergeBranch(projectPath: string, branch: string): Promise<string> {
  const git = simpleGit(projectPath)
  const status = await git.status()
  if (!status.isClean()) throw new Error('Main project folder has uncommitted changes – commit or stash them first')
  const res = await git.merge(['--no-ff', '-m', `Merge ${branch} (Hive)`, branch])
  return `${branch} → ${status.current}: ${res.summary.changes} files changed`
}

/** Diff of a single file. Untracked files are shown as all-added lines. */
export async function fileDiff(cwd: string, file: string): Promise<string> {
  const git = simpleGit(cwd)
  const untracked = (await git.status()).not_added.includes(file)
  if (untracked) {
    const full = join(cwd, file)
    if (!existsSync(full) || statSync(full).isDirectory()) return `(new folder) ${file}`
    if (statSync(full).size > 1_000_000) return `(new file, ${statSync(full).size} bytes – too large to show)`
    const text = readFileSync(full, 'utf8')
    if (text.includes('\u0000')) return '(new binary file)'
    const lines = text.split('\n')
    return [`diff --git a/${file} b/${file}`, 'new file', '--- /dev/null', `+++ b/${file}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => '+' + l)].join('\n')
  }
  let d = ''
  try {
    d = await git.diff(['HEAD', '--', file])
  } catch {
    d = await git.diff(['--', file])
  }
  return d || '(no textual changes)'
}

/** Throw away the changes to one tracked file (restores it from HEAD). */
export async function revertFile(cwd: string, file: string): Promise<void> {
  await simpleGit(cwd).raw(['checkout', 'HEAD', '--', file])
}

async function assertValidBranch(git: ReturnType<typeof simpleGit>, name: string): Promise<void> {
  try {
    await git.raw(['check-ref-format', '--branch', name])
  } catch {
    throw new Error(`"${name}" is not a valid branch name`)
  }
}

/** Rename an agent's branch (works while it is checked out in the worktree). */
export async function renameBranch(projectPath: string, from: string, to: string): Promise<void> {
  const git = simpleGit(projectPath)
  await assertValidBranch(git, to)
  if ((await git.branchLocal()).all.includes(to)) throw new Error(`Branch "${to}" already exists`)
  await git.raw(['branch', '-m', from, to])
}

/** True if the folder has uncommitted changes. */
export async function isDirty(cwd: string): Promise<boolean> {
  if (!existsSync(cwd)) return false
  return !(await simpleGit(cwd).status()).isClean()
}

/** Branch the main project folder has checked out (what an agent branch is merged into). */
export async function currentBranch(projectPath: string): Promise<string | undefined> {
  try {
    return (await simpleGit(projectPath).status()).current ?? undefined
  } catch {
    return undefined
  }
}

async function mergeBase(cwd: string, base: string): Promise<string | undefined> {
  try {
    return (await simpleGit(cwd).raw(['merge-base', base, 'HEAD'])).trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Everything an agent touched on its branch: commits since it branched off `base`
 * plus uncommitted work (untracked files included).
 */
export async function branchSummary(cwd: string, base: string): Promise<GitSummary> {
  const plain = await summary(cwd)
  if (!plain.isRepo) return plain
  const mb = await mergeBase(cwd, base)
  if (!mb) return plain
  const git = simpleGit(cwd)
  const files = new Map<string, GitSummary['files'][number]>()
  for (const line of (await git.raw(['diff', '--name-status', mb])).split('\n')) {
    const [st, ...rest] = line.split('\t')
    if (!st) continue
    const path = rest[rest.length - 1]
    files.set(path, { path, status: st[0] })
  }
  for (const line of (await git.raw(['diff', '--numstat', mb])).split('\n')) {
    const [add, del, ...rest] = line.split('\t')
    const f = files.get(rest.join('\t'))
    if (f) Object.assign(f, { added: Number(add) || 0, removed: Number(del) || 0 })
  }
  for (const f of plain.files) if (f.status.startsWith('?') && !files.has(f.path)) files.set(f.path, f)
  let diff = await git.diff([mb])
  for (const f of plain.files.filter((x) => x.status.startsWith('?')).slice(0, 20)) diff += `\n--- /dev/null\n+++ b/${f.path}\n(new untracked file)\n`
  return { isRepo: true, branch: plain.branch, files: [...files.values()], diff: diff.slice(0, 400_000) }
}

export async function branchFileDiff(cwd: string, base: string, file: string): Promise<string> {
  const mb = await mergeBase(cwd, base)
  if (!mb) return fileDiff(cwd, file)
  const git = simpleGit(cwd)
  if ((await git.status()).not_added.includes(file)) return fileDiff(cwd, file)
  return (await git.diff([mb, '--', file])) || '(no textual changes)'
}
