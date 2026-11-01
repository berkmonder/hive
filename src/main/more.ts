/**
 * Accounts & sign-in, automatic account / provider switching on usage limits,
 * Figma frames, tracker imports (Linear, Jira, Notion, Azure DevOps), cloning repos,
 * SKILL.md export / import and restoring the last session on launch.
 */
import { app, dialog, ipcMain, Notification } from 'electron'
import { execFile } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, dirname, join, relative } from 'path'
import { randomUUID } from 'crypto'
import type { Account, Agent, DevServer, Project, Skill, Task } from '@shared/types'
import { getState, updateState } from './store'
import type { FeatureCtx } from './features'
import { secretEnv } from './insights'
import { saveImage } from './media'

const shellRun = (cmd: string, cwd?: string, timeout = 300_000): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(process.env.SHELL || '/bin/zsh', ['-l', '-i', '-c', cmd], { cwd, timeout, maxBuffer: 32 * 1024 * 1024 }, (err, out, errOut) =>
      err ? reject(new Error(String(errOut || err.message).trim().split('\n').slice(-3).join(' '))) : resolve(out)
    )
  )
const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

// ---------------- accounts ----------------
export const accountDir = (a: Account): string => a.configDir || join(app.getPath('userData'), 'accounts', a.id)
/** Environment that points a CLI at an account's own config folder. */
export function accountEnv(agent: Agent): Record<string, string> {
  const id = agent.accountId === '' ? undefined : agent.accountId ?? getState().projectSettings[agent.projectId]?.accounts?.[agent.providerId]
  const acc = getState().settings.accounts.find((a) => a.id === id)
  if (!acc || acc.providerId !== agent.providerId) return {}
  const dir = accountDir(acc)
  mkdirSync(dir, { recursive: true })
  if (acc.providerId === 'claude') return { CLAUDE_CONFIG_DIR: dir }
  if (acc.providerId === 'codex') return { CODEX_HOME: dir }
  return {}
}
const claudeHome = (a?: Account): string => (a ? accountDir(a) : process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'))
const codexHome = (a?: Account): string => (a ? accountDir(a) : process.env.CODEX_HOME || join(homedir(), '.codex'))

const LOGIN: Record<string, string> = { claude: 'claude', codex: 'codex login', gemini: 'gemini' }

// ---------------- usage-limit detection ----------------
const LIMIT_RE = /usage limit (reached|exceeded)|you['’]ve hit your usage limit|5-hour limit reached|weekly limit reached|rate limit exceeded.*(retry|try again) (later|in)|quota exceeded|RESOURCE_EXHAUSTED/i

export function registerMore(ctx: FeatureCtx): { onData: (agentId: string, data: string) => void; recordRunning: () => void; restore: () => void } {
  const save = (fn: Parameters<typeof updateState>[0]): void => {
    updateState(fn)
    ctx.broadcastState()
  }
  const notify = (title: string, body: string, agentId?: string): void => {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body, silent: getState().settings.notify.silent })
    n.on('click', () => {
      ctx.win()?.show()
      if (agentId) ctx.send('agent:focus', agentId)
    })
    n.show()
  }

  // ---------- accounts & sign-in ----------
  ipcMain.handle('accounts:save', (_e, list: Account[]) => save((s) => (s.settings.accounts = list)))
  ipcMain.handle('accounts:signin', (_e, providerId: string, accountId?: string) => {
    const acc = getState().settings.accounts.find((a) => a.id === accountId)
    const env: Record<string, string> = {}
    if (acc?.providerId === 'claude') env.CLAUDE_CONFIG_DIR = accountDir(acc)
    if (acc?.providerId === 'codex') env.CODEX_HOME = accountDir(acc)
    if (acc) mkdirSync(accountDir(acc), { recursive: true })
    const cli = getState().providers.find((p) => p.id === providerId)?.command.split(' ')[0] || providerId
    const cmd = providerId === 'codex' ? `${cli} login` : providerId === 'claude' ? `${cli} /login` : cli
    const id = `signin-${providerId}-${accountId ?? 'default'}`
    const srv: DevServer = { id, projectId: '', name: `Sign in · ${providerId}`, command: cmd || LOGIN[providerId], cwd: '' }
    ctx.servers.stop(id)
    setTimeout(() => ctx.servers.start(srv, homedir(), env), 300)
    return id
  })
  ipcMain.handle('accounts:status', async (_e, providerId: string, accountId?: string) => {
    const acc = getState().settings.accounts.find((a) => a.id === accountId)
    if (providerId === 'claude') {
      const dir = claudeHome(acc)
      const cfg = [join(dir, '.credentials.json'), join(dir, '.claude.json'), join(homedir(), '.claude.json')].find(existsSync)
      try {
        const j = cfg ? JSON.parse(readFileSync(cfg, 'utf8')) : null
        const email = j?.oauthAccount?.emailAddress
        return email ? `Signed in as ${email}` : existsSync(join(dir, '.credentials.json')) ? 'Signed in' : 'Not signed in (or uses the macOS keychain)'
      } catch {
        return 'Unknown'
      }
    }
    if (providerId === 'codex') return existsSync(join(codexHome(acc), 'auth.json')) ? 'Signed in' : 'Not signed in'
    return existsSync(join(homedir(), '.gemini', 'oauth_creds.json')) || existsSync(join(homedir(), '.gemini', 'google_accounts.json')) ? 'Signed in' : 'Not signed in'
  })

  // ---------- auto switch on usage limits ----------
  const lastLimit = new Map<string, number>()
  async function switchAccount(agentId: string): Promise<void> {
    const a = getState().agents.find((x) => x.id === agentId)
    const st = getState().settings
    if (!a || !st.autoSwitch) return
    const pool: (Account | undefined)[] = [undefined, ...st.accounts.filter((x) => x.providerId === a.providerId)]
    const cur = a.accountId === '' ? undefined : a.accountId ?? getState().projectSettings[a.projectId]?.accounts?.[a.providerId]
    const i = pool.findIndex((x) => (x?.id ?? undefined) === cur)
    const next = pool.length > 1 ? pool[(i + 1) % pool.length] : null
    const sessions = a.sessions ?? []
    const last = sessions[sessions.length - 1]
    if (next !== null && next?.id !== cur) {
      // carry the conversation over to the other account's config folder
      let resumeArgs: string | undefined
      if (last && existsSync(last)) {
        if (a.providerId === 'claude') {
          const sid = basename(last, '.jsonl')
          const dir = join(claudeHome(next), 'projects', ctx.agentCwd(a).replace(/[^a-zA-Z0-9]/g, '-'))
          mkdirSync(dir, { recursive: true })
          copyFileSync(last, join(dir, `${sid}.jsonl`))
          resumeArgs = `--resume ${sid}`
        } else if (a.providerId === 'codex') {
          const from = codexHome(pool[i] ?? undefined)
          const rel = relative(from, last)
          const to = join(codexHome(next), rel.startsWith('..') ? join('sessions', basename(last)) : rel)
          mkdirSync(dirname(to), { recursive: true })
          copyFileSync(last, to)
          const id = basename(last).match(/([0-9a-f-]{36})\.jsonl$/)?.[1]
          resumeArgs = id ? `resume ${id}` : undefined
        }
      }
      save((s) => {
        const x = s.agents.find((y) => y.id === agentId)
        if (x) x.accountId = next?.id ?? '' // '' = your normal login (overrides the project default)
      })
      notify(`🔁 ${a.name}: switched account`, `Usage limit reached – continuing on ${next?.name ?? 'your default account'}.`, a.id)
      ctx.agents.restart(agentId, () => ctx.startAgent(agentId, false, resumeArgs ? undefined : 'Continue where you left off.', resumeArgs))
      return
    }
    // no other account: optional fallback provider
    if (st.fallbackProvider && st.fallbackProvider !== a.providerId) {
      const conv = last ? (await import('./transcript')).readConversation(last) : null
      const items = (await conv)?.items ?? []
      const task = [...items].reverse().find((x) => x.kind === 'user')?.text ?? ''
      const recap = [...items].reverse().find((x) => x.kind === 'assistant')?.text ?? ''
      save((s) => {
        const x = s.agents.find((y) => y.id === agentId)
        if (x) {
          x.providerId = st.fallbackProvider!
          delete x.accountId
        }
      })
      notify(`🔁 ${a.name}: switched to ${st.fallbackProvider}`, 'Usage limit reached – the task continues with the fallback CLI.', a.id)
      ctx.agents.restart(agentId, () =>
        ctx.startAgent(agentId, false, `[Taking over from another AI because of a usage limit]\nTask: ${task.slice(0, 3000)}\n\nLast progress report:\n${recap.slice(0, 3000)}\n\nCheck the current state of the files and continue.`)
      )
    }
  }

  // ---------- Figma ----------
  ipcMain.handle('figma:frame', async (_e, url: string, projectId?: string) => {
    const token = secretEnv(projectId ?? '').FIGMA_TOKEN
    if (!token) throw new Error('Add a FIGMA_TOKEN secret first (Figma → Settings → Security → Personal access tokens)')
    const m = url.match(/figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/)
    const node = decodeURIComponent(url.match(/node-id=([^&]+)/)?.[1] ?? '').replace('-', ':')
    if (!m || !node) throw new Error('Paste a Figma link to a frame (it must contain node-id=…)')
    const h = { 'X-Figma-Token': token }
    const img = (await (await fetch(`https://api.figma.com/v1/images/${m[1]}?ids=${encodeURIComponent(node)}&format=png&scale=2`, { headers: h })).json()) as { images?: Record<string, string>; err?: string }
    const src = img.images?.[node]
    if (!src) throw new Error(`Figma: ${img.err ?? 'no image for that frame'}`)
    const png = new Uint8Array(await (await fetch(src)).arrayBuffer())
    const info = (await (await fetch(`https://api.figma.com/v1/files/${m[1]}/nodes?ids=${encodeURIComponent(node)}&depth=3`, { headers: h })).json()) as {
      nodes?: Record<string, { document?: { name?: string; absoluteBoundingBox?: { width: number; height: number }; children?: { name: string; characters?: string; children?: unknown[] }[] } }>
    }
    const doc = info.nodes?.[node]?.document
    const texts: string[] = []
    const walk = (n: { characters?: string; children?: unknown[] } | undefined): void => {
      if (!n) return
      if (n.characters) texts.push(n.characters)
      ;(n.children as { characters?: string; children?: unknown[] }[] | undefined)?.forEach(walk)
    }
    walk(doc)
    const att = await saveImage(png, 'png')
    const box = doc?.absoluteBoundingBox
    return { ...att, name: doc?.name ?? 'Frame', size: box ? `${Math.round(box.width)}×${Math.round(box.height)}` : '', texts: texts.slice(0, 40), url }
  })

  // ---------- tracker imports ----------
  ipcMain.handle('tracker:import', async (_e, projectId: string, kind: 'linear' | 'jira' | 'notion' | 'azure', opts: Record<string, string>) => {
    const env = secretEnv(projectId)
    const need = (k: string): string => {
      if (!env[k]) throw new Error(`Add a ${k} secret first (Workspace → Secrets)`)
      return env[k]
    }
    let items: { key: string; title: string; body: string; url: string; labels: string[] }[] = []
    if (kind === 'linear') {
      const filter = [opts.team && `team: { key: { eq: "${opts.team}" } }`, opts.assignee === 'me' && 'assignee: { isMe: { eq: true } }', `state: { type: { nin: ["completed", "canceled"] } }`]
        .filter(Boolean)
        .join(', ')
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: need('LINEAR_API_KEY'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `{ issues(first: 100, filter: { ${filter} }) { nodes { identifier title description url labels { nodes { name } } } } }` })
      })
      const j = (await res.json()) as { data?: { issues: { nodes: { identifier: string; title: string; description?: string; url: string; labels: { nodes: { name: string }[] } }[] } }; errors?: { message: string }[] }
      if (!j.data) throw new Error(`Linear: ${j.errors?.[0]?.message ?? res.statusText}`)
      items = j.data.issues.nodes.map((n) => ({ key: n.identifier, title: n.title, body: n.description ?? '', url: n.url, labels: n.labels.nodes.map((l) => l.name) }))
    } else if (kind === 'jira') {
      const base = need('JIRA_BASE_URL').replace(/\/$/, '')
      const auth = Buffer.from(`${need('JIRA_EMAIL')}:${need('JIRA_API_TOKEN')}`).toString('base64')
      const jql = opts.jql || 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
      const res = await fetch(`${base}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,description,labels`, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } })
      if (!res.ok) throw new Error(`Jira: ${res.status} ${(await res.text()).slice(0, 160)}`)
      const j = (await res.json()) as { issues: { key: string; fields: { summary: string; description?: unknown; labels?: string[] } }[] }
      const adf = (n: unknown): string => {
        if (!n || typeof n !== 'object') return ''
        const o = n as { type?: string; text?: string; content?: unknown[] }
        const inner = (o.content ?? []).map(adf).join(o.type === 'doc' ? '\n\n' : '')
        return o.text ?? (o.type === 'listItem' ? `- ${inner}\n` : o.type === 'paragraph' ? `${inner}\n` : inner)
      }
      items = j.issues.map((i) => ({ key: i.key, title: i.fields.summary, body: adf(i.fields.description).trim(), url: `${base}/browse/${i.key}`, labels: i.fields.labels ?? [] }))
    } else if (kind === 'notion') {
      const db = (opts.database || '').match(/[0-9a-f]{32}|[0-9a-f-]{36}/i)?.[0]
      if (!db) throw new Error('Paste the Notion database link or id')
      const res = await fetch(`https://api.notion.com/v1/databases/${db}/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${need('NOTION_TOKEN')}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_size: 100 })
      })
      if (!res.ok) throw new Error(`Notion: ${res.status} ${(await res.text()).slice(0, 160)} – share the database with your integration`)
      const j = (await res.json()) as { results: { id: string; url: string; properties: Record<string, { type: string; title?: { plain_text: string }[]; rich_text?: { plain_text: string }[]; status?: { name: string }; select?: { name: string }; multi_select?: { name: string }[] }> }[] }
      items = j.results
        .map((p) => {
          const props = Object.entries(p.properties)
          const title = props.find(([, v]) => v.type === 'title')?.[1].title?.map((t) => t.plain_text).join('') ?? 'Untitled'
          const status = props.find(([, v]) => v.type === 'status')?.[1].status?.name ?? ''
          const body = props
            .filter(([, v]) => v.type === 'rich_text' && v.rich_text?.length)
            .map(([k, v]) => `**${k}:** ${v.rich_text!.map((t) => t.plain_text).join('')}`)
            .join('\n')
          const labels = props.flatMap(([, v]) => (v.type === 'multi_select' ? v.multi_select!.map((s) => s.name) : v.type === 'select' && v.select ? [v.select.name] : []))
          return { key: p.id.slice(0, 8), title, body, url: p.url, labels, status }
        })
        .filter((x) => !/done|complete|tamam|bitti/i.test(x.status))
    } else {
      const org = (opts.org || '').replace(/\/$/, '')
      if (!org || !opts.project) throw new Error('Organization URL and project are required')
      const auth = `Basic ${Buffer.from(`:${need('AZURE_DEVOPS_PAT')}`).toString('base64')}`
      const wiql = opts.wiql || `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] NOT IN ('Closed','Done','Removed') ORDER BY [System.ChangedDate] DESC`
      const r1 = await fetch(`${org}/${encodeURIComponent(opts.project)}/_apis/wit/wiql?api-version=7.0`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: wiql }) })
      if (!r1.ok) throw new Error(`Azure DevOps: ${r1.status} ${(await r1.text()).slice(0, 160)}`)
      const ids = ((await r1.json()) as { workItems: { id: number }[] }).workItems.slice(0, 100).map((w) => w.id)
      if (ids.length) {
        const r2 = await fetch(`${org}/_apis/wit/workitems?ids=${ids.join(',')}&fields=System.Title,System.Description,Microsoft.VSTS.Common.AcceptanceCriteria,System.Tags&api-version=7.0`, { headers: { Authorization: auth } })
        const j = (await r2.json()) as { value: { id: number; fields: Record<string, string> }[] }
        const strip = (h?: string): string => (h ?? '').replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|div|li)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
        items = j.value.map((w) => ({
          key: `#${w.id}`,
          title: w.fields['System.Title'],
          body: [strip(w.fields['System.Description']), w.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] && `**Acceptance criteria**\n${strip(w.fields['Microsoft.VSTS.Common.AcceptanceCriteria'])}`].filter(Boolean).join('\n\n'),
          url: `${org}/${encodeURIComponent(opts.project)}/_workitems/edit/${w.id}`,
          labels: (w.fields['System.Tags'] ?? '').split(';').map((t) => t.trim()).filter(Boolean)
        }))
      }
    }
    let added = 0
    let updated = 0
    save((s) => {
      for (const i of items) {
        const ex = s.tasks.find((t) => t.projectId === projectId && t.source?.kind === kind && t.source.key === i.key)
        const source: Task['source'] = { kind, key: i.key, url: i.url, labels: i.labels }
        if (ex) {
          Object.assign(ex, { title: i.title, body: i.body, source, updatedAt: Date.now() })
          updated++
        } else {
          s.tasks.push({ id: randomUUID(), projectId, title: i.title, body: i.body, status: 'todo', source, createdAt: Date.now(), updatedAt: Date.now() })
          added++
        }
      }
    })
    return { added, updated, total: items.length }
  })

  // ---------- clone a repo ----------
  ipcMain.handle('repos:list', async () => {
    const out: { name: string; url: string; description: string; host: 'github' | 'gitlab' }[] = []
    try {
      const gh = JSON.parse(await shellRun('gh repo list --limit 60 --json nameWithOwner,url,description', undefined, 20_000)) as { nameWithOwner: string; url: string; description?: string }[]
      out.push(...gh.map((r) => ({ name: r.nameWithOwner, url: r.url, description: r.description ?? '', host: 'github' as const })))
    } catch {
      /* gh missing / not logged in */
    }
    try {
      const gl = JSON.parse(await shellRun('glab repo list --per-page 60 --output json', undefined, 20_000)) as { path_with_namespace: string; http_url_to_repo: string; description?: string }[]
      out.push(...gl.map((r) => ({ name: r.path_with_namespace, url: r.http_url_to_repo, description: r.description ?? '', host: 'gitlab' as const })))
    } catch {
      /* glab missing */
    }
    return out
  })
  ipcMain.handle('repos:clone', async (_e, url: string) => {
    const res = await dialog.showOpenDialog(ctx.win()!, { title: 'Clone into which folder?', properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    const name = basename(url.replace(/\.git$/, '').replace(/\/$/, ''))
    const dest = join(res.filePaths[0], name)
    if (existsSync(dest)) throw new Error(`${dest} already exists`)
    // gh / glab URLs like "owner/repo" are cloned with the CLI so private repos use your login
    const cmd = /^[\w.-]+\/[\w.-]+$/.test(url) ? `gh repo clone ${q(url)} ${q(dest)}` : `git clone ${q(url)} ${q(dest)}`
    await shellRun(cmd, res.filePaths[0], 600_000)
    const project: Project = { id: randomUUID(), name, path: dest, createdAt: Date.now() }
    save((s) => s.projects.push(project))
    return project
  })

  // ---------- skills as SKILL.md ----------
  const skillMd = (s: Skill): string => `---\nname: ${s.name}\ndescription: ${s.description.replace(/\n/g, ' ')}\n---\n\n${s.body}\n`
  ipcMain.handle('skills:export', (_e, target: 'claude-project' | 'claude-user' | 'codex-user' | 'cursor-project', projectId?: string) => {
    const p = projectId ? ctx.findProject(projectId) : undefined
    const files: string[] = []
    for (const s of getState().skills) {
      const slug = s.name.replace(/[^\w-]+/g, '-').toLowerCase()
      let file: string
      let content = skillMd(s)
      if (target === 'claude-project') file = join(p!.path, '.claude', 'skills', slug, 'SKILL.md')
      else if (target === 'claude-user') file = join(claudeHome(), 'skills', slug, 'SKILL.md')
      else if (target === 'codex-user') file = join(codexHome(), 'skills', slug, 'SKILL.md')
      else {
        file = join(p!.path, '.cursor', 'rules', `${slug}.mdc`)
        content = `---\ndescription: ${s.description.replace(/\n/g, ' ')}\nalwaysApply: false\n---\n\n# ${s.name}\n\n${s.body}\n`
      }
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, content)
      files.push(file)
    }
    return files
  })
  ipcMain.handle('skills:importFiles', (_e, projectId?: string) => {
    const p = projectId ? getState().projects.find((x) => x.id === projectId) : undefined
    const roots = [p && join(p.path, '.claude', 'skills'), join(claudeHome(), 'skills'), join(codexHome(), 'skills')].filter(Boolean) as string[]
    let n = 0
    const found: Skill[] = []
    for (const r of roots) {
      if (!existsSync(r)) continue
      for (const d of readdirSync(r)) {
        const f = join(r, d, 'SKILL.md')
        if (!existsSync(f) || !statSync(f).isFile()) continue
        const text = readFileSync(f, 'utf8')
        const fm = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
        const meta = Object.fromEntries((fm?.[1] ?? '').split('\n').map((l) => [l.split(':')[0].trim(), l.split(':').slice(1).join(':').trim()]))
        found.push({ id: randomUUID(), name: meta.name || d, description: meta.description || '', body: (fm?.[2] ?? text).trim() })
      }
    }
    save((s) => {
      for (const sk of found) {
        const ex = s.skills.find((x) => x.name === sk.name)
        if (ex) Object.assign(ex, { description: sk.description, body: sk.body })
        else s.skills.push(sk)
        n++
      }
    })
    return n
  })

  // ---------- restore last session ----------
  function recordRunning(): void {
    const agentsOn = getState().agents.filter((a) => ctx.agents.isRunning(a.id)).map((a) => a.id)
    const serversOn = ctx.servers.all().filter((s) => s.running && !s.serverId.startsWith('signin-')).map((s) => s.serverId)
    updateState((s) => (s.lastRunning = { agents: agentsOn, servers: serversOn, at: Date.now() }))
  }
  function restore(): void {
    const st = getState()
    if (!st.settings.restoreSession || !st.lastRunning) return
    const { agents: ids, servers: srv } = st.lastRunning
    let n = 0
    for (const id of ids) {
      if (!st.agents.some((a) => a.id === id) || ctx.agents.isRunning(id)) continue
      try {
        ctx.startAgent(id, true)
        n++
      } catch (err) {
        console.warn('[restore]', err)
      }
    }
    for (const sid of srv) {
      const def = st.servers.find((x) => x.id === sid)
      if (!def) continue
      try {
        ctx.servers.start(def, join(ctx.findProject(def.projectId).path, def.cwd || ''), {})
        n++
      } catch (err) {
        console.warn('[restore]', err)
      }
    }
    if (n) ctx.send('toast', `Restored ${n} agent${n === 1 ? '' : 's'} / server${n === 1 ? '' : 's'} from last time`)
  }

  return {
    onData(agentId, data) {
      if (!LIMIT_RE.test(data)) return
      const now = Date.now()
      if (now - (lastLimit.get(agentId) ?? 0) < 120_000) return
      lastLimit.set(agentId, now)
      ctx.send('agent:limit', agentId)
      if (getState().settings.autoSwitch) setTimeout(() => switchAccount(agentId).catch((e) => console.warn('[switch]', e)), 1500)
    },
    recordRunning,
    restore
  }
}

