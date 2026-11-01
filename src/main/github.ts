/**
 * Read-only GitHub Issues import. Uses the GitHub CLI (`gh`, so private repos work with
 * your login); falls back to the public REST API for public repositories.
 */
import { execFile } from 'child_process'
import simpleGit from 'simple-git'

export interface GhIssue {
  number: number
  title: string
  body: string
  url: string
  labels: string[]
}

function viaGh(cwd: string): Promise<GhIssue[]> {
  const shell = process.env.SHELL || '/bin/zsh'
  const cmd = 'gh issue list --state open --limit 100 --json number,title,body,url,labels'
  return new Promise((resolve, reject) => {
    execFile(shell, ['-l', '-i', '-c', cmd], { cwd, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) return reject(new Error(String(errOut || err.message).trim().split('\n').pop()))
      try {
        const start = out.indexOf('[')
        const list = JSON.parse(out.slice(start)) as { number: number; title: string; body: string; url: string; labels: { name: string }[] }[]
        resolve(list.map((i) => ({ number: i.number, title: i.title, body: i.body ?? '', url: i.url, labels: i.labels.map((l) => l.name) })))
      } catch {
        reject(new Error('Could not read gh output'))
      }
    })
  })
}

async function viaApi(cwd: string): Promise<GhIssue[]> {
  const remote = (await simpleGit(cwd).raw(['remote', 'get-url', 'origin']).catch(() => '')).trim()
  const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/)
  if (!m) throw new Error('This project has no GitHub "origin" remote')
  const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/issues?state=open&per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Hive' }
  })
  if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText} (private repo? install and log in to the GitHub CLI: gh auth login)`)
  const list = (await res.json()) as { number: number; title: string; body: string | null; html_url: string; labels: { name: string }[]; pull_request?: unknown }[]
  return list.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, body: i.body ?? '', url: i.html_url, labels: i.labels.map((l) => l.name) }))
}

export async function listIssues(cwd: string): Promise<{ issues: GhIssue[]; via: 'gh' | 'api' }> {
  try {
    return { issues: await viaGh(cwd), via: 'gh' }
  } catch (ghErr) {
    try {
      return { issues: await viaApi(cwd), via: 'api' }
    } catch (apiErr) {
      throw new Error(`${(apiErr as Error).message}${/not found|command not found/i.test(String((ghErr as Error).message)) ? '' : ` · gh: ${(ghErr as Error).message}`}`)
    }
  }
}
