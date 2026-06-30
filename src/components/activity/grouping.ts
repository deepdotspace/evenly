/**
 * grouping — bucket a reverse-chron activity stream into calendar-day sections
 * (Today / Yesterday / a date) for the feed, a UX pattern that makes a long
 * history scannable. Input rows are assumed already sorted newest-first.
 */

import type { RecordData } from 'deepspace'
import type { ActivityData } from '../../lib/data/types'

export interface DaySection {
  /** Stable key (the local YYYY-MM-DD of the day). */
  key: string
  /** Human label: "Today", "Yesterday", or a formatted date. */
  label: string
  rows: RecordData<ActivityData>[]
}

const DAY = 86_400_000

/** Local midnight (ms) for a timestamp. */
function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dayKey(ms: number): string {
  const d = new Date(ms)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** "Today" / "Yesterday" / "Wednesday, June 24" / "June 24, 2025". */
export function dayLabel(ms: number, now = Date.now()): string {
  const today = startOfDay(now)
  const that = startOfDay(ms)
  const diffDays = Math.round((today - that) / DAY)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString('en-US', {
    weekday: sameYear && diffDays < 7 ? 'long' : undefined,
    month: 'long',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

/**
 * Group rows into one section per calendar day, newest day first. Bucketed by day
 * key (not by adjacency) so the input need not be perfectly day-contiguous: rows
 * that interleave across days (e.g. an activity stream merged from several groups)
 * still collapse to a single section per day. This guarantees section keys are
 * unique -- two sections can never share a `dayKey` -- which a naive run-length
 * grouping cannot promise once the stream isn't strictly day-monotonic.
 */
export function groupByDay(
  rows: RecordData<ActivityData>[],
  now = Date.now(),
): DaySection[] {
  const byDay = new Map<string, DaySection>()
  for (const r of rows) {
    const ms = Date.parse(r.createdAt) || 0
    const key = dayKey(ms)
    let section = byDay.get(key)
    if (!section) {
      section = { key, label: dayLabel(ms, now), rows: [] }
      byDay.set(key, section)
    }
    section.rows.push(r)
  }
  // Newest day first; rows within a day keep their input order (already newest-first).
  return [...byDay.values()].sort((a, b) => b.key.localeCompare(a.key))
}
