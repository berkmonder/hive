import type { Schedule } from './types'

const hm = (time: string): [number, number] => {
  const [h, m] = time.split(':').map((x) => Number(x) || 0)
  return [Math.min(23, Math.max(0, h)), Math.min(59, Math.max(0, m))]
}

/** Next time (epoch ms) the schedule fires strictly after `from`, or null if never again. */
export function nextRun(s: Schedule, from: number): number | null {
  if (s.kind === 'once') return s.onceAt && s.onceAt > from && !s.lastRun ? s.onceAt : null
  const d = new Date(from)
  if (s.kind === 'hourly') {
    const minute = hm(s.time.includes(':') ? s.time : `0:${s.time}`)[1]
    const t = new Date(d)
    t.setMinutes(minute, 0, 0)
    if (t.getTime() <= from) t.setHours(t.getHours() + 1)
    return t.getTime()
  }
  const [h, m] = hm(s.time)
  if (s.kind === 'monthly') {
    for (let i = 0; i < 3; i++) {
      const y = d.getFullYear()
      const mo = d.getMonth() + i
      const last = new Date(y, mo + 1, 0).getDate()
      const t = new Date(y, mo, Math.min(s.monthDay ?? 1, last), h, m, 0, 0)
      if (t.getTime() > from) return t.getTime()
    }
    return null
  }
  for (let i = 0; i < 8; i++) {
    const t = new Date(d)
    t.setDate(d.getDate() + i)
    t.setHours(h, m, 0, 0)
    if (t.getTime() <= from) continue
    const wd = t.getDay()
    if (s.kind === 'weekdays' && (wd === 0 || wd === 6)) continue
    if (s.kind === 'weekly' && wd !== (s.weekday ?? 1)) continue
    return t.getTime()
  }
  return null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function describeSchedule(s: Schedule): string {
  switch (s.kind) {
    case 'once':
      return s.onceAt ? `Once · ${new Date(s.onceAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Once'
    case 'hourly':
      return `Every hour at :${String(hm(s.time.includes(':') ? s.time : `0:${s.time}`)[1]).padStart(2, '0')}`
    case 'daily':
      return `Every day at ${s.time}`
    case 'weekdays':
      return `Weekdays at ${s.time}`
    case 'weekly':
      return `Every ${DAYS[s.weekday ?? 1]} at ${s.time}`
    case 'monthly':
      return `Monthly on day ${s.monthDay ?? 1} at ${s.time}`
  }
}
