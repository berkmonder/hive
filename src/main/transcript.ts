/**
 * Reads a Claude Code session transcript (JSONL) as a conversation, plus the current
 * context-window usage. Cached by size+mtime so polling is cheap.
 */
import { statSync } from 'fs'
import { open } from 'fs/promises'
import type { ChatItem, Conversation } from '@shared/chat'
import { kindOf, readOther } from './otherclis'

const cache = new Map<string, { size: number; mtime: number; conv: Conversation }>()

type Block = { type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string; tool_use_id?: string; content?: unknown; is_error?: boolean }

function asText(c: unknown): string {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map((b: Block) => (b.type === 'text' ? b.text ?? '' : b.type === 'image' ? '[image]' : '')).join('\n')
  return ''
}

/** one-line summary of a tool call, e.g. Edit(src/app.ts) or Bash(npm test) */
function toolSummary(name: string, input: Record<string, unknown> = {}): string {
  const pick = (input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.url ?? input.description ?? input.prompt ?? '') as string
  const s = String(pick).replace(/\s+/g, ' ').trim()
  return s ? `${name}(${s.length > 90 ? s.slice(0, 90) + '…' : s})` : name
}

export async function readConversation(path: string, limit = 400): Promise<Conversation> {
  if (kindOf(path) !== 'claude') {
    const c = readOther(path).conv
    return { ...c, items: c.items.slice(-limit) }
  }
  let st
  try {
    st = statSync(path)
  } catch {
    return { items: [], context: null }
  }
  const hit = cache.get(path)
  if (hit && hit.size === st.size && hit.mtime === st.mtimeMs) return { ...hit.conv, items: hit.conv.items.slice(-limit) }
  const fh = await open(path, 'r')
  const text = (await fh.readFile()).toString('utf8')
  await fh.close()

  const items: ChatItem[] = []
  const tools = new Map<string, ChatItem>()
  const seen = new Set<string>()
  let context: Conversation['context'] = null
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let j: {
      type?: string
      isMeta?: boolean
      isSidechain?: boolean
      timestamp?: string
      uuid?: string
      message?: { id?: string; role?: string; model?: string; content?: unknown; usage?: Record<string, number> }
    }
    try {
      j = JSON.parse(line)
    } catch {
      continue
    }
    if (j.isSidechain || j.isMeta || !j.message) continue
    const at = j.timestamp ? Date.parse(j.timestamp) : 0
    const content = j.message.content
    if (j.type === 'user') {
      if (Array.isArray(content)) {
        for (const b of content as Block[]) {
          if (b.type === 'tool_result' && b.tool_use_id) {
            const t = tools.get(b.tool_use_id)
            if (t) {
              t.result = asText(b.content).slice(0, 4000)
              t.error = !!b.is_error
            }
          }
        }
      }
      const txt = asText(content).trim()
      if (!txt || txt.startsWith('<local-command') || txt.startsWith('<command-') || txt.startsWith('Caveat:')) continue
      items.push({ kind: 'user', text: txt, at })
    } else if (j.type === 'assistant') {
      const u = j.message.usage
      if (u && j.message.model !== '<synthetic>') {
        const used = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
        const model = j.message.model ?? ''
        const window = /\[1m\]|-1m/i.test(model) || used > 200_000 ? 1_000_000 : 200_000
        context = { used, window, model }
      }
      if (!Array.isArray(content)) continue
      for (const b of content as Block[]) {
        // streamed messages repeat blocks – keep one per (message id, block index-ish)
        const key = `${j.message.id}:${b.type}:${b.id ?? (b.text ?? '').slice(0, 60)}`
        if (seen.has(key)) continue
        seen.add(key)
        if (b.type === 'text' && b.text?.trim()) items.push({ kind: 'assistant', text: b.text.trim(), at })
        else if (b.type === 'tool_use' && b.name) {
          const item: ChatItem = { kind: 'tool', text: toolSummary(b.name, b.input), tool: b.name, input: JSON.stringify(b.input ?? {}, null, 2).slice(0, 4000), at }
          if (b.id) tools.set(b.id, item)
          items.push(item)
        }
      }
    }
  }
  const conv: Conversation = { items, context }
  cache.set(path, { size: st.size, mtime: st.mtimeMs, conv })
  return { ...conv, items: items.slice(-limit) }
}
