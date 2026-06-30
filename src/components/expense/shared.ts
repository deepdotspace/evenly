/**
 * Shared building blocks for the add / edit / detail expense surfaces
 * (CONTRACT §3.5, §3.9). Catalog constants, the action-call helper, identity
 * helpers, and the small money/date parsers the form math rests on.
 *
 * Money is ALWAYS integer minor units of the expense's own currency (CONTRACT
 * §1.1) — the parsers here convert the user's typed major-unit strings to minor
 * and back, never floats in the ledger.
 */

import { getAuthToken } from 'deepspace'
import { scale } from '../../lib/split'
import type { MemberId, Shares } from '../../lib/split'
import type { GroupMemberData } from '../../lib/data/types'
import type { RecordData } from 'deepspace'

/* ----------------------------------------------------------------- catalog */

/** The fixed category catalog (CONTRACT §1.2). Icons resolve via `categoryIcon`. */
export const CATEGORIES: { id: string; label: string }[] = [
  { id: 'food', label: 'Food' },
  { id: 'dining', label: 'Dining' },
  { id: 'groceries', label: 'Groceries' },
  { id: 'lodging', label: 'Lodging' },
  { id: 'transport', label: 'Transport' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'entertainment', label: 'Fun' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'health', label: 'Health' },
  { id: 'fees', label: 'Fees' },
  { id: 'other', label: 'Other' },
]

/** Currencies offered in the picker (mirrors CreateGroupModal). */
export const CURRENCIES: readonly (readonly [string, string])[] = [
  ['USD', 'US Dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'British Pound'],
  ['JPY', 'Japanese Yen'],
  ['CAD', 'Canadian Dollar'],
  ['AUD', 'Australian Dollar'],
  ['INR', 'Indian Rupee'],
  ['MXN', 'Mexican Peso'],
  ['BRL', 'Brazilian Real'],
  ['CHF', 'Swiss Franc'],
  ['CNY', 'Chinese Yuan'],
  ['KRW', 'Korean Won'],
] as const

/** The six split types the picker offers, mapped to the engine in the form hook. */
export type SplitType = 'equal' | 'exact' | 'percent' | 'shares' | 'byitem' | 'treat'

/** One selectable participant / payer — a real userId or a `guest:<uuid>`. */
export interface RosterMember {
  id: MemberId
  name: string
  isYou: boolean
  isGuest: boolean
}

/* -------------------------------------------------------------- identities */

/** Build the selectable roster from the group's membership rows (active only). */
export function rosterFrom(
  members: RecordData<GroupMemberData>[],
  youId: string | undefined,
): RosterMember[] {
  return members
    .filter((m) => m.data.status !== 'removed')
    .map((m) => {
      const id = m.data.userId ?? m.data.guestId ?? m.recordId
      return {
        id,
        name: m.data.displayName || (id.startsWith('guest:') ? 'Guest' : 'Member'),
        isYou: !!youId && id === youId,
        isGuest: !m.data.userId,
      }
    })
}

/** A quick id -> display-name lookup over the roster. */
export function nameMap(roster: RosterMember[]): Map<MemberId, string> {
  return new Map(roster.map((r) => [r.id, r.name]))
}

/** The single dominant payer (largest `paidBy` entry) — for treat / unclaimed-payer. */
export function derivePayerId(paidBy: Shares): MemberId | undefined {
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

export function sumShares(s: Shares): number {
  let t = 0
  for (const v of Object.values(s)) t += v
  return t
}

/* --------------------------------------------------------------- money I/O */

/** Parse a typed major-unit string to integer minor units (>= 0; bad -> 0). */
export function toMinorSafe(str: string, currency: string): number {
  const n = Number.parseFloat(str)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * scale(currency))
}

/** Parse a typed SIGNED major-unit string to integer minor units (bad -> 0). */
export function toSignedMinor(str: string, currency: string): number {
  const n = Number.parseFloat(str)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * scale(currency))
}

/** Integer minor units -> an editable major-unit string (no symbol, no padding). */
export function minorToStr(minor: number, currency: string): string {
  if (!minor) return ''
  const digits = Math.log10(scale(currency))
  return (minor / scale(currency)).toFixed(digits).replace(/\.?0+$/, '')
}

/** Parse a plain non-negative number string (percents / weights); bad -> 0. */
export function numOr(str: string, fallback = 0): number {
  const n = Number.parseFloat(str)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/* ---------------------------------------------------------------- date I/O */

export function msToDateInput(ms: number | undefined): string {
  const d = ms ? new Date(ms) : new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** A yyyy-mm-dd value -> ms at local noon (avoids TZ day-shift). */
export function dateInputToMs(str: string): number {
  const [y, m, d] = str.split('-').map(Number)
  if (!y || !m || !d) return Date.now()
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
}

let lineSeq = 0
/** A stable-enough id for a manually-entered line item. */
export function newLineId(): string {
  lineSeq += 1
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `li_${lineSeq}_${rnd}`
}

/* --------------------------------------------------------------- actions IO */

export interface ActionResponse<T = unknown> {
  success?: boolean
  error?: string
  data?: T
}

/** POST a server action via the established bearer pattern (see dev-spike). */
export async function callAction<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<ActionResponse<T>> {
  try {
    const token = await getAuthToken()
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return (await res.json()) as ActionResponse<T>
  } catch {
    return { success: false, error: 'Could not reach the server. Check your connection and try again.' }
  }
}
