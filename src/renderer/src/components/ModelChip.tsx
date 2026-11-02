import { useEffect, useRef, useState } from 'react'
import type { Agent } from '@shared/types'
import { useStore } from '../store'
import { cleanError } from './common'

/** suggestions per CLI – any other model id can be typed */
const MODELS: Record<string, [string, string][]> = {
  claude: [['opus', 'Opus – most capable'], ['sonnet', 'Sonnet – balanced'], ['haiku', 'Haiku – fastest'], ['opusplan', 'Opus plans, Sonnet codes'], ['claude-fable-5-1', 'Fable 5.1']],
  codex: [['gpt-5-codex', 'GPT-5 Codex'], ['gpt-5', 'GPT-5']],
  gemini: [['gemini-2.5-pro', 'Gemini 2.5 Pro'], ['gemini-2.5-flash', 'Gemini 2.5 Flash']]
}
const EFFORTS: ['' | 'low' | 'medium' | 'high', string][] = [['', 'Default'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]

/**
 * "Claude Code · opus · high" chip on the agent screen: click to change this agent's model and effort.
 * A running Claude agent switches model live (/model); anything else resumes the conversation with the new settings.
 */
export function ModelChip({ agent }: { agent: Agent }) {
  const provider = useStore((s) => s.app.providers.find((p) => p.id === agent.providerId))
  const projectEffort = useStore((s) => s.app.projectSettings[agent.projectId]?.effort)
  const rt = useStore((s) => s.runtimes[agent.id])
  const toast = useStore((s) => s.toast)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [model, setModel] = useState(agent.model ?? '')
  const [effort, setEffort] = useState<string>(agent.effort ?? '')
  const box = useRef<HTMLDivElement>(null)
  const pid = agent.providerId
  const hasEffort = pid === 'claude' || pid === 'codex'
  const known = pid in MODELS

  useEffect(() => {
    if (!open) return
    setModel(agent.model ?? '')
    setEffort(agent.effort ?? '')
    const off = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', off)
    return () => window.removeEventListener('mousedown', off)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const shownModel = agent.model || provider?.model || 'default'
  const shownEffort = agent.effort || projectEffort || provider?.effort || ''

  const apply = async (): Promise<void> => {
    const m = model.trim()
    const modelChanged = m !== (agent.model ?? '')
    const effortChanged = effort !== (agent.effort ?? '')
    setOpen(false)
    if (!modelChanged && !effortChanged) return
    try {
      await window.api.updateAgent(agent.id, { model: m, effort })
      if (!rt?.running) return toast(`${agent.name} uses the new settings from its next start`, 'success')
      const idle = rt.status !== 'working'
      // Claude Code switches the model mid-conversation; effort (thinking budget) needs a restart
      if (pid === 'claude' && modelChanged && !effortChanged && idle) {
        window.api.input(agent.id, `/model ${m || provider?.model || 'default'}`)
        setTimeout(() => window.api.input(agent.id, '\r'), 80)
        return toast(`${agent.name} switched to ${m || 'the default model'}`, 'success')
      }
      if (idle) {
        await window.api.restartAgent(agent.id, true)
        return toast(`${agent.name} restarted with the new settings – conversation kept`, 'success')
      }
      toast(`${agent.name} is working – the new settings apply when you restart it (Resume keeps the conversation)`, 'info')
    } catch (e) {
      toast(cleanError(e), 'error')
    }
  }

  return (
    <div className="model-chip-wrap" ref={box}>
      <button className={`chip model-chip ${open ? 'on' : ''}`} title="Change this agent's model and reasoning effort" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 348)), y: r.bottom + 6 })
        setOpen(!open)
      }}>
        <span>{provider?.name ?? pid}</span>
        {(known || agent.model || provider?.model) && <span className="mono">· {shownModel}</span>}
        {hasEffort && shownEffort && <span>· {shownEffort}</span>}
        <span className="model-caret">▾</span>
      </button>
      {open && (
        <div className="model-pop" style={{ left: pos.x, top: pos.y }} onKeyDown={(e) => {
          if (e.key === 'Enter') apply()
          if (e.key === 'Escape') setOpen(false)
        }}>
          <div className="section-label">Model</div>
          <div className="model-list">
            <button className={!model ? 'on' : ''} onClick={() => setModel('')}>
              <b>Default</b><span>{provider?.model ? `CLI setting (${provider.model})` : "the CLI's own default"}</span>
            </button>
            {(MODELS[pid] ?? []).map(([id, label]) => (
              <button key={id} className={model === id ? 'on' : ''} onClick={() => setModel(id)}>
                <b className="mono">{id}</b><span>{label}</span>
              </button>
            ))}
          </div>
          <input className="mono" placeholder="…or type any model id" value={model} onChange={(e) => setModel(e.target.value)} />
          {hasEffort && (
            <>
              <div className="section-label">Reasoning effort</div>
              <div className="seg sm">
                {EFFORTS.map(([v, l]) => (
                  <button key={v} className={effort === v ? 'on' : ''} onClick={() => setEffort(v)}
                    title={v ? undefined : `Project / CLI default${projectEffort || provider?.effort ? ` (${projectEffort || provider?.effort})` : ''}`}>{l}</button>
                ))}
              </div>
            </>
          )}
          <p className="muted small">
            {!rt?.running ? 'Used from the next start.'
              : pid === 'claude' && effort === (agent.effort ?? '') ? 'Claude switches the model right away.'
              : 'The agent restarts and keeps its conversation.'}
          </p>
          <div className="row">
            <div className="spacer" />
            <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn sm" onClick={apply}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}
