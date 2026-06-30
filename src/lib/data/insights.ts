/**
 * Per-group spend insights inputs (CONTRACT §7 A1). Derived read-only from the
 * ledger; SETTLEMENTS ARE EXCLUDED from spend totals (a settlement moves money,
 * it is not spend). Every amount is converted to the group's primary currency via
 * each expense's STORED snapshot, so figures are exact and stable.
 *
 * Pure selector -- returns the numbers the insights surface charts (stat cards,
 * category donut, per-person contribution, weekly spend-over-time). Rendering /
 * palette / formatting live in the UI.
 */

import type { RecordData } from 'deepspace'
import type { Cents, MemberId, Signed } from '../split'
import { convertMinorAt } from '../fx/resolver'
import type { ExpenseData, GroupData, GroupMemberData } from './types'

type GroupRec = RecordData<GroupData>
type ExpenseRec = RecordData<ExpenseData>
type MemberRec = RecordData<GroupMemberData>

export interface WeeklySpend {
  /** UTC midnight (ms) of the Monday that starts the week. */
  weekStartMs: number
  amountMinor: Cents
}

export interface LargestExpense {
  expenseId: string
  description: string
  amountMinor: Cents
}

export interface SpendInsights {
  primaryCurrency: string
  /** Total spend (Σ expense amounts in primary, settlements excluded). */
  totalMinor: Cents
  expenseCount: number
  /** total / expenseCount (0 when none). */
  avgPerExpenseMinor: Cents
  /** total / active member count (0 when none). */
  avgPerPersonMinor: Cents
  largest: LargestExpense | null
  /** category id -> spend in primary. */
  byCategory: Record<string, Cents>
  /** member id -> amount that member PAID, in primary. */
  byPayer: Record<MemberId, Cents>
  /** Ascending by week start. */
  byWeek: WeeklySpend[]
  /** What the viewer paid across the group, in primary. */
  viewerPaidMinor: Cents
  /** The viewer's net (paid - owed) over spend only (no settlements), in primary. */
  viewerNetMinor: Signed
}

/** UTC Monday-week bucket key for a timestamp (ms). */
function weekStartMs(ms: number): number {
  const d = new Date(ms)
  const day = d.getUTCDay() // 0 = Sun .. 6 = Sat
  const diff = (day + 6) % 7 // days since Monday
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff)
}

function expensePrimary(e: ExpenseData, primary: string): number {
  return convertMinorAt(e.amountMinor, e.currency, primary, e.fxRate ?? 1)
}

export function spendInsights(
  group: GroupRec,
  expenses: ExpenseRec[],
  members: MemberRec[],
  viewerId?: MemberId,
): SpendInsights {
  const primary = group.data.primaryCurrency
  const activeCount = members.filter((m) => m.data.status === 'active').length

  let totalMinor = 0
  let expenseCount = 0
  let viewerPaidMinor = 0
  let viewerOwedMinor = 0
  let largest: LargestExpense | null = null
  const byCategory: Record<string, Cents> = {}
  const byPayer: Record<MemberId, Cents> = {}
  const weekTotals = new Map<number, number>()

  for (const rec of expenses) {
    const e = rec.data
    if (e.deletedAt) continue
    expenseCount++
    const amt = expensePrimary(e, primary)
    totalMinor += amt

    const cat = e.category || 'other'
    byCategory[cat] = (byCategory[cat] ?? 0) + amt

    for (const [payer, paid] of Object.entries(e.paidBy)) {
      byPayer[payer] = (byPayer[payer] ?? 0) + convertMinorAt(paid, e.currency, primary, e.fxRate ?? 1)
    }

    if (viewerId) {
      if (e.paidBy[viewerId]) {
        viewerPaidMinor += convertMinorAt(e.paidBy[viewerId], e.currency, primary, e.fxRate ?? 1)
      }
      if (e.splits[viewerId]) {
        viewerOwedMinor += convertMinorAt(e.splits[viewerId], e.currency, primary, e.fxRate ?? 1)
      }
    }

    if (!largest || amt > largest.amountMinor) {
      largest = { expenseId: rec.recordId, description: e.description, amountMinor: amt }
    }

    const wk = weekStartMs(e.expenseAtMs ?? (Date.parse(rec.createdAt) || Date.now()))
    weekTotals.set(wk, (weekTotals.get(wk) ?? 0) + amt)
  }

  const byWeek: WeeklySpend[] = [...weekTotals.entries()]
    .map(([weekStartMs, amountMinor]) => ({ weekStartMs, amountMinor }))
    .sort((a, b) => a.weekStartMs - b.weekStartMs)

  return {
    primaryCurrency: primary,
    totalMinor,
    expenseCount,
    avgPerExpenseMinor: expenseCount > 0 ? Math.round(totalMinor / expenseCount) : 0,
    avgPerPersonMinor: activeCount > 0 ? Math.round(totalMinor / activeCount) : 0,
    largest,
    byCategory,
    byPayer,
    byWeek,
    viewerPaidMinor,
    viewerNetMinor: viewerPaidMinor - viewerOwedMinor,
  }
}
