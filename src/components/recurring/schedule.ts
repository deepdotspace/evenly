/**
 * Recurring-schedule math + occurrence planning (CONTRACT §1.12, §4).
 *
 * Pure, dependency-free helpers shared by the UI (cadence pickers + "in words"
 * labels), the server action (`runRecurringNow`, validation), and the cron
 * materializer. No React / DOM / SDK imports so the worker can pull just this
 * file without dragging in client code.
 *
 * All occurrence instants are anchored to **noon UTC** of their calendar day so
 * the day-key idempotency is stable and immune to DST / midnight flips. The
 * `timezone` stored on a recurring row is kept for display + future precision;
 * day-level scheduling here is timezone-stable by construction.
 */

import {
  computeExpenseShares,
  SplitError,
  type MemberId,
  type Shares,
  type SplitConfig,
} from '../../lib/split'
import type { Cadence, RecurringTemplate } from '../../lib/data/types'

/* ----------------------------------------------------------------- calendar */

const HOURS_NOON = 12

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/** A noon-UTC instant for a Y / M(0-based) / D, normalizing overflow. */
export function noonUtc(year: number, monthIndex: number, day: number): number {
  return Date.UTC(year, monthIndex, day, HOURS_NOON, 0, 0, 0)
}

/** Re-anchor any instant to noon UTC of its own calendar day. */
export function toNoonDay(ms: number): number {
  const d = new Date(ms)
  return noonUtc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** A `yyyy-mm-dd` date-input string → that day at noon UTC. */
export function startDateToMs(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return toNoonDay(Date.now())
  return noonUtc(y, m - 1, d)
}

/** An instant → its `yyyy-mm-dd` (UTC) — the occurrence idempotency key. */
export function occurrenceDayKey(ms: number): string {
  const d = new Date(ms)
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${m}-${day}`
}

/** The day-of-month (1-31) of an instant (UTC) — used to seed a monthly anchor. */
export function dayOfMonthUtc(ms: number): number {
  return new Date(ms).getUTCDate()
}

/* --------------------------------------------------------------- next run */

/** The next occurrence strictly after `fromMs`, by cadence (noon-UTC anchored). */
export function computeNextRun(fromMs: number, c: Cadence): number {
  const interval = Math.max(1, Math.floor(c.interval || 1))
  const base = new Date(toNoonDay(fromMs))
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth()
  const d = base.getUTCDate()

  if (c.unit === 'day') return noonUtc(y, m, d + interval)
  if (c.unit === 'week') return noonUtc(y, m, d + interval * 7)

  // month: advance whole months, clamping the anchor day to the target month length.
  const targetIndex = m + interval
  const ty = y + Math.floor(targetIndex / 12)
  const tm = ((targetIndex % 12) + 12) % 12
  const anchor = c.anchorDay ?? d
  return noonUtc(ty, tm, Math.min(anchor, daysInMonth(ty, tm)))
}

/* --------------------------------------------------------------- in words */

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** Cadence rendered as a human sentence, e.g. "Every month on the 1st". */
export function describeCadence(c: Cadence): string {
  const n = Math.max(1, Math.floor(c.interval || 1))
  if (c.unit === 'day') return n === 1 ? 'Every day' : `Every ${n} days`
  if (c.unit === 'week') return n === 1 ? 'Every week' : `Every ${n} weeks`
  const head = n === 1 ? 'Every month' : `Every ${n} months`
  return c.anchorDay ? `${head} on the ${ordinal(c.anchorDay)}` : head
}

/* ------------------------------------------------------- occurrence planning */

export interface MemberLite {
  id: MemberId
  status: 'active' | 'inactive' | 'removed'
}

export interface OccurrencePlan {
  ok: boolean
  /** Set when `ok === false` and the template should be PAUSED (not retried). */
  pauseReason?: string
  splits?: Shares
  paidBy?: Shares
  splitConfig?: SplitConfig
  participants?: MemberId[]
}

/** The single dominant payer (largest `paidBy` entry); for treat / unclaimed-payer. */
function derivePayerId(paidBy: Shares): MemberId | undefined {
  let best: MemberId | undefined
  let max = -Infinity
  for (const [id, v] of Object.entries(paidBy)) {
    if (v > max) {
      max = v
      best = id
    }
  }
  return best
}

function pick(map: Record<MemberId, number> | undefined, keep: Set<MemberId>): Record<MemberId, number> {
  const out: Record<MemberId, number> = {}
  if (!map) return out
  for (const [id, v] of Object.entries(map)) if (keep.has(id)) out[id] = v
  return out
}

/**
 * Drop departed members from a template's split config and yield one that still
 * sums to the amount. `equal`/`shares` re-split naturally among the survivors;
 * `exact`/`percent` can't preserve their constraints once someone leaves, so they
 * fall back to an equal split among the remaining active members (CONTRACT §4).
 */
function resplitConfig(cfg: SplitConfig, active: MemberId[]): SplitConfig {
  const keep = new Set(active)
  const scope = cfg.scope === 'itemized' ? 'simple' : cfg.scope
  const out: SplitConfig = {
    scope,
    baseType: cfg.baseType === 'treat' ? 'treat' : cfg.baseType === 'shares' ? 'shares' : 'equal',
    participants: active,
    payerIsParticipant: cfg.payerIsParticipant ?? true,
  }
  if (out.baseType === 'shares') out.weights = pick(cfg.weights, keep)
  if (scope === 'withOverhead') {
    out.subtotalMinor = cfg.subtotalMinor
    out.overheads = cfg.overheads
  }
  return out
}

/**
 * Decide how this occurrence splits, accounting for members who have left
 * (CONTRACT §4). Returns `ok:false` + `pauseReason` when no active participant
 * remains, the payer is gone, or the resulting split can't be computed.
 */
export function planOccurrence(template: RecurringTemplate, members: MemberLite[]): OccurrencePlan {
  const active = new Set(members.filter((m) => m.status === 'active').map((m) => m.id))

  const cfgParts = template.splitConfig.participants ?? []
  const activeParts = cfgParts.filter((id) => active.has(id))
  if (activeParts.length === 0) {
    return { ok: false, pauseReason: 'No active members remain to split this with.' }
  }

  // Payers must still be active and still cover the full amount.
  const activePaidBy: Shares = {}
  let paidSum = 0
  for (const [id, v] of Object.entries(template.paidBy)) {
    if (active.has(id)) {
      activePaidBy[id] = v
      paidSum += v
    }
  }
  if (paidSum !== template.amountMinor) {
    return {
      ok: false,
      pauseReason: 'The person who pays this is no longer active. Reassign a payer and resume.',
    }
  }

  const dropped = activeParts.length !== cfgParts.length
  const cfg = dropped ? resplitConfig(template.splitConfig, activeParts) : template.splitConfig

  try {
    const splits = computeExpenseShares({
      amountMinor: template.amountMinor,
      splitConfig: cfg,
      payerId: derivePayerId(activePaidBy),
    })
    return { ok: true, splits, paidBy: activePaidBy, splitConfig: cfg, participants: activeParts }
  } catch (e) {
    const msg = e instanceof SplitError ? e.message : (e as Error).message
    return { ok: false, pauseReason: `This split no longer works after a change (${msg}). Edit and resume.` }
  }
}

/** Validate a template is materializable (amount, payer coverage, computable). */
export function validateTemplate(template: RecurringTemplate): string | null {
  if (!template || typeof template !== 'object') return 'A template is required'
  if (!template.description?.trim()) return 'Add a description'
  if (!Number.isInteger(template.amountMinor) || template.amountMinor <= 0) {
    return 'Amount must be a positive number'
  }
  let paidSum = 0
  for (const v of Object.values(template.paidBy ?? {})) paidSum += v
  if (paidSum !== template.amountMinor) return 'Who paid must add up to the amount'
  if (!template.splitConfig) return 'A split is required'
  try {
    const splits = computeExpenseShares({
      amountMinor: template.amountMinor,
      splitConfig: template.splitConfig,
      payerId: derivePayerId(template.paidBy ?? {}),
    })
    let s = 0
    for (const v of Object.values(splits)) s += v
    if (s !== template.amountMinor) return 'The split does not add up to the amount'
  } catch (e) {
    return e instanceof SplitError ? e.message : (e as Error).message
  }
  return null
}
