import { describe, it, expect } from 'vitest'
import { groupByDay } from './grouping'

// groupByDay only reads `createdAt`; build minimal rows. Local (no-Z) timestamps
// so the day key is deterministic regardless of the runner's timezone.
const row = (createdAt: string, id: string) => ({ recordId: id, createdAt, data: {} }) as never
const now = Date.parse('2026-06-30T12:00:00')

describe('groupByDay', () => {
  it('one section per day, newest day first, rows in input order', () => {
    const sections = groupByDay(
      [
        row('2026-06-30T10:00:00', 'a'),
        row('2026-06-30T09:00:00', 'b'),
        row('2026-06-29T20:00:00', 'c'),
      ],
      now,
    )
    expect(sections.map((s) => s.key)).toEqual(['2026-06-30', '2026-06-29'])
    expect(sections[0].rows.map((r) => r.recordId)).toEqual(['a', 'b'])
  })

  it('collapses interleaved same-day rows into one section with unique keys (regression)', () => {
    // A non-day-monotonic stream (e.g. activity merged from several groups): today,
    // yesterday, then today again. A naive run-length grouping would emit two
    // "2026-06-30" sections -> duplicate React keys. Bucketing must collapse them.
    const sections = groupByDay(
      [
        row('2026-06-30T10:00:00', 'a'),
        row('2026-06-29T20:00:00', 'b'),
        row('2026-06-30T08:00:00', 'c'),
      ],
      now,
    )
    const keys = sections.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length) // every section key is unique
    expect(keys).toEqual(['2026-06-30', '2026-06-29'])
    expect(sections.find((s) => s.key === '2026-06-30')!.rows.map((r) => r.recordId)).toEqual(['a', 'c'])
  })
})
