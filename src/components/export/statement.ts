/**
 * Export statement model (CONTRACT §3.4 export, §4 "Export with mixed currencies", §7).
 *
 * The SINGLE source of truth both the CSV (`csv.ts`) and the printable PDF view
 * (`PrintStatement.tsx`) derive from, so the two exports always reconcile to the
 * same numbers — and to the ledger the rest of the app shows. This module is
 * intentionally free of React / DOM and of any string formatting: it carries
 * money as integer minor units (§1.1) and lets each edge format for its medium.
 *
 * Mixed currencies (§4): every ledger row keeps its ORIGINAL `currency` +
 * `amountMinor` AND its value converted to the group's `primaryCurrency` using
 * that row's stored entry-time FX snapshot (never today's rate). Per-member
 * balances and totals are all expressed in the primary currency. The conversion
 * mirrors the engine's `convertMinorAt` exactly, so balances here equal the
 * `groupNet` selector the group / settle screens render.
 */

import type { RecordData } from 'deepspace'
import {
  EVEN_TOLERANCE,
  buildBalanceLadder,
  groupNet,
  memberIdentityMap,
  type BalanceState,
  type MemberId,
} from '../../lib/data'
import type {
  ExpenseData,
  GroupData,
  GroupKind,
  GroupMemberData,
  SettlementData,
} from '../../lib/data/types'
import { convertMinorAt } from '../../lib/fx/resolver'
import { categoryLabel } from '../insights/meta'

type GroupRec = RecordData<GroupData>
type MemberRec = RecordData<GroupMemberData>
type ExpenseRec = RecordData<ExpenseData>
type SettlementRec = RecordData<SettlementData>

/** A member that owns a share column / a balance row in the statement. */
export interface StatementMember {
  memberId: MemberId
  name: string
  isGuest: boolean
}

/** One contributor to a row's payment (multi-payer expenses list more than one). */
export interface StatementPayer {
  name: string
  /** In the row's ORIGINAL currency. */
  amountMinor: number
}

/** A single ledger line — an expense or a settlement. */
export interface StatementRow {
  kind: 'expense' | 'settlement'
  dateMs: number
  /** `YYYY-MM-DD` in the viewer's local calendar (faithful to the entry date, §7). */
  dateISO: string
  description: string
  /** Human category label (expenses); "Payment" for settlements. */
  category: string
  categoryId: string
  currency: string
  /** Grand total in the row's ORIGINAL currency. */
  amountMinor: number
  /** The same amount converted to the group primary via the row's snapshot. */
  primaryMinor: number
  foreign: boolean
  payers: StatementPayer[]
  /** Compact "Alice" / "Alice +1" payer label for the print view. */
  payerLabel: string
  /** Per-member owed share in the row's ORIGINAL currency (expense only; `{}` for a settlement). */
  shares: Record<MemberId, number>
}

/** One member's net balance in the group primary currency. */
export interface StatementBalance {
  memberId: MemberId
  name: string
  isGuest: boolean
  /** Signed: >0 owed to them, <0 they owe. In the primary currency. */
  netMinor: number
  state: BalanceState
}

export interface Statement {
  groupName: string
  kind: GroupKind
  primaryCurrency: string
  generatedAtMs: number
  /** Column order for share columns + balance rows (creditors first). */
  members: StatementMember[]
  /** Chronological ascending — a statement reads top-to-bottom oldest-first. */
  rows: StatementRow[]
  balances: StatementBalance[]
  totals: {
    expensesPrimaryMinor: number
    settlementsPrimaryMinor: number
    expenseCount: number
    settlementCount: number
  }
  /** Any row in a currency other than the primary -> show the FX note. */
  hasForeign: boolean
  /** Σ of all member nets; should be ~0. Any remainder is FX rounding (T3), not a debt. */
  residualMinor: number
}

/* ------------------------------------------------------------------- helpers */

/** `YYYY-MM-DD` in local time (not UTC) so the date matches what the user entered. */
function localISODate(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Convert a minor amount in `cur` to the group primary using a stored snapshot (§2.8). */
function toPrimaryMinor(amountMinor: number, cur: string, fxRate: number, primary: string): number {
  return convertMinorAt(amountMinor, cur, primary, fxRate)
}

/* ----------------------------------------------------------------- the builder */

/**
 * Build the export statement from a group's live ledger records. Pure: given the
 * same records it always yields the same statement. Balances come from the same
 * `groupNet` / `buildBalanceLadder` selectors the app screens use, so an export
 * can never disagree with what the user saw on screen.
 */
export function buildStatement(input: {
  group: GroupRec
  members: MemberRec[]
  expenses: ExpenseRec[]
  settlements: SettlementRec[]
}): Statement {
  const { group, members, expenses, settlements } = input
  const primary = group.data.primaryCurrency || 'USD'

  const identities = memberIdentityMap(members)
  const nameFor = (id: string | undefined): string => {
    if (!id) return 'Someone'
    return identities.get(id)?.displayName ?? (id.startsWith('guest:') ? 'Guest' : 'Someone')
  }

  // Net per member in the primary currency (the authoritative balances, D2).
  const net = groupNet(group, expenses, settlements)
  const ladder = buildBalanceLadder(net, members)

  const statementMembers: StatementMember[] = ladder.map((r) => ({
    memberId: r.memberId,
    name: r.displayName,
    isGuest: r.isGuest,
  }))

  const balances: StatementBalance[] = ladder.map((r) => ({
    memberId: r.memberId,
    name: r.displayName,
    isGuest: r.isGuest,
    netMinor: r.value,
    state: r.state,
  }))

  /* ----- ledger rows (expenses + settlements, chronological ascending) ----- */

  const expenseRows: StatementRow[] = expenses.map((rec) => {
    const e = rec.data
    const dateMs = e.expenseAtMs ?? (Date.parse(rec.createdAt) || 0)
    const foreign = e.currency !== primary
    const payerIds = Object.keys(e.paidBy)
    const payers: StatementPayer[] = payerIds.map((id) => ({
      name: nameFor(id),
      amountMinor: e.paidBy[id] ?? 0,
    }))
    const payerLabel =
      payers.length === 0
        ? 'Someone'
        : payers.length === 1
          ? payers[0].name
          : `${payers[0].name} +${payers.length - 1}`

    return {
      kind: 'expense',
      dateMs,
      dateISO: localISODate(dateMs),
      description: e.description,
      category: categoryLabel(e.category),
      categoryId: e.category,
      currency: e.currency,
      amountMinor: e.amountMinor,
      primaryMinor: foreign ? toPrimaryMinor(e.amountMinor, e.currency, e.fxRate, primary) : e.amountMinor,
      foreign,
      payers,
      payerLabel,
      shares: { ...e.splits },
    }
  })

  const settlementRows: StatementRow[] = settlements.map((rec) => {
    const s = rec.data
    const dateMs = s.settledAtMs ?? (Date.parse(rec.createdAt) || 0)
    const foreign = s.currency !== primary
    const from = nameFor(s.fromUserId)
    const to = nameFor(s.toUserId)

    return {
      kind: 'settlement',
      dateMs,
      dateISO: localISODate(dateMs),
      description: `${from} paid ${to}`,
      category: 'Payment',
      categoryId: 'payment',
      currency: s.currency,
      amountMinor: s.amountMinor,
      primaryMinor: foreign ? toPrimaryMinor(s.amountMinor, s.currency, s.fxRate, primary) : s.amountMinor,
      foreign,
      payers: [{ name: from, amountMinor: s.amountMinor }],
      payerLabel: from,
      shares: {},
    }
  })

  const rows = [...expenseRows, ...settlementRows].sort((a, b) => a.dateMs - b.dateMs)

  /* --------------------------------------------------------------- totals */

  const expensesPrimaryMinor = expenseRows.reduce((sum, r) => sum + r.primaryMinor, 0)
  const settlementsPrimaryMinor = settlementRows.reduce((sum, r) => sum + r.primaryMinor, 0)
  const hasForeign = rows.some((r) => r.foreign)
  const residualMinor = balances.reduce((sum, b) => sum + b.netMinor, 0)

  return {
    groupName: group.data.name || 'Group',
    kind: group.data.kind,
    primaryCurrency: primary,
    generatedAtMs: Date.now(),
    members: statementMembers,
    rows,
    balances,
    totals: {
      expensesPrimaryMinor,
      settlementsPrimaryMinor,
      expenseCount: expenseRows.length,
      settlementCount: settlementRows.length,
    },
    hasForeign,
    residualMinor,
  }
}

/** Is this balance materially nonzero (beyond the FX-rounding tolerance)? */
export function balanceIsSettled(netMinor: number): boolean {
  return Math.abs(netMinor) <= EVEN_TOLERANCE
}
