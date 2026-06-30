/**
 * Derived-balance selectors (CONTRACT §2.7-§2.10, §3.3, §3.4, §3.7, R1, R2).
 *
 * Pure functions over the record envelopes the hooks return. Balances are NEVER
 * stored (D2) -- they are a deterministic function of the ledger (expenses +
 * settlements) run through the split engine. Everything here unwraps the
 * envelopes and delegates the money math to `src/lib/split`; it never reimplements
 * apportionment or FX.
 *
 * Per-group / per-pair figures use each row's STORED snapshot (exact, never moves
 * when rates change). The cross-group dashboard rollup is the one exception (R1):
 * it converts each group's primary-currency net to the user's display currency at
 * CURRENT rates and is labelled approximate.
 */

import type { RecordData } from 'deepspace'
import {
  netBalances,
  pairwiseBalances,
  simplifyDebts,
  type Cents,
  type FxResolver,
  type MemberId,
  type Signed,
} from '../split'
import { convertMinorAt } from '../fx/resolver'
import type { SafeFxResolver } from '../fx/resolver'
import type {
  ExpenseData,
  GroupData,
  GroupMemberData,
  SettlementData,
} from './types'

type GroupRec = RecordData<GroupData>
type ExpenseRec = RecordData<ExpenseData>
type SettlementRec = RecordData<SettlementData>
type MemberRec = RecordData<GroupMemberData>

/** Default "treat as settled" tolerance (minor units) -- absorbs FX residue (T3). */
export const EVEN_TOLERANCE = 1

const data = <T>(r: RecordData<T>): T => r.data

/* ----------------------------------------------------------- member identity */

export interface MemberIdentity {
  memberId: MemberId
  displayName: string
  avatarUrl: string | null
  isGuest: boolean
  status: GroupMemberData['status']
}

/** A member's ledger identity string: real `userId` or `guest:<uuid>`. */
export function memberKey(m: GroupMemberData): MemberId {
  return (m.userId ?? m.guestId ?? '') as MemberId
}

/** Map every member row to its ledger identity for label lookups. */
export function memberIdentityMap(members: MemberRec[]): Map<MemberId, MemberIdentity> {
  const map = new Map<MemberId, MemberIdentity>()
  for (const rec of members) {
    const m = rec.data
    const id = memberKey(m)
    if (!id) continue
    map.set(id, {
      memberId: id,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl ?? null,
      isGuest: !m.userId,
      status: m.status,
    })
  }
  return map
}

/* --------------------------------------------------------------- net balances */

/** Signed net per member in the group's primary currency (CONTRACT §2.8). */
export function groupNet(
  group: GroupRec,
  expenses: ExpenseRec[],
  settlements: SettlementRec[],
  fxResolver?: FxResolver,
): Record<MemberId, Signed> {
  return netBalances(
    { primaryCurrency: group.data.primaryCurrency },
    expenses.map(data),
    settlements.map(data),
    fxResolver,
  )
}

/** The signed net for one member (>0 owed, <0 owes), 0 if absent. */
export function viewerNet(net: Record<MemberId, Signed>, viewerId: MemberId): Signed {
  return net[viewerId] ?? 0
}

/* ------------------------------------------------------------ balance ladder */

export type BalanceState = 'owes' | 'owed' | 'even'

export interface BalanceLadderRow {
  memberId: MemberId
  displayName: string
  avatarUrl: string | null
  isGuest: boolean
  /** Signed net in the group's primary currency. */
  value: Signed
  state: BalanceState
  /** 0..1, relative to the largest absolute balance in the set (for a bar). */
  barWidth: number
}

/**
 * Build the group balances panel rows from a net map + member identities
 * (CONTRACT §3.4). Sorted creditors-first (most owed at top), debtors last.
 */
export function buildBalanceLadder(
  net: Record<MemberId, Signed>,
  members: MemberRec[],
  opts: { evenTolerance?: number; excludeMemberId?: MemberId; includeRemoved?: boolean } = {},
): BalanceLadderRow[] {
  const tol = opts.evenTolerance ?? EVEN_TOLERANCE
  const identities = memberIdentityMap(members)

  // Every member with a row, plus any net-bearing id not in the member list.
  const ids = new Set<MemberId>(identities.keys())
  for (const id of Object.keys(net)) ids.add(id)

  let maxAbs = 0
  for (const id of ids) maxAbs = Math.max(maxAbs, Math.abs(net[id] ?? 0))

  const rows: BalanceLadderRow[] = []
  for (const id of ids) {
    if (id === opts.excludeMemberId) continue
    const ident = identities.get(id)
    if (ident && ident.status === 'removed' && !opts.includeRemoved) continue
    const value = net[id] ?? 0
    const state: BalanceState =
      Math.abs(value) <= tol ? 'even' : value > 0 ? 'owed' : 'owes'
    rows.push({
      memberId: id,
      displayName: ident?.displayName ?? id,
      avatarUrl: ident?.avatarUrl ?? null,
      isGuest: ident?.isGuest ?? id.startsWith('guest:'),
      value,
      state,
      barWidth: maxAbs > 0 ? Math.abs(value) / maxAbs : 0,
    })
  }

  rows.sort((a, b) => b.value - a.value || (a.displayName < b.displayName ? -1 : 1))
  return rows
}

/* ------------------------------------------------ viewer-centric pairwise view */

export interface ViewerPairRow {
  /** The other member. */
  memberId: MemberId
  displayName: string
  avatarUrl: string | null
  isGuest: boolean
  /** Signed from the viewer's perspective: >0 they owe you, <0 you owe them. */
  value: Signed
  state: BalanceState
}

/**
 * "Bob owes you $12.40 / you owe Carol $5.00" rows for the group detail panel
 * (CONTRACT §3.4, R2). Built from the raw pairwise graph (the simplify-off truth)
 * so it always converts each entry to primary via its snapshot before netting.
 */
export function viewerPairRows(
  group: GroupRec,
  expenses: ExpenseRec[],
  settlements: SettlementRec[],
  viewerId: MemberId,
  members: MemberRec[],
  opts: { evenTolerance?: number; fxResolver?: FxResolver } = {},
): ViewerPairRow[] {
  const tol = opts.evenTolerance ?? EVEN_TOLERANCE
  const pw = pairwiseBalances(
    { primaryCurrency: group.data.primaryCurrency },
    expenses.map(data),
    settlements.map(data),
    opts.fxResolver,
  )
  const identities = memberIdentityMap(members)
  const rows: ViewerPairRow[] = []

  for (const [other, ident] of identities) {
    if (other === viewerId) continue
    const theyOweYou = pw[other]?.[viewerId] ?? 0 // other owes viewer
    const youOweThem = pw[viewerId]?.[other] ?? 0 // viewer owes other
    const value = theyOweYou - youOweThem
    if (ident.status === 'removed' && value === 0) continue
    const state: BalanceState =
      Math.abs(value) <= tol ? 'even' : value > 0 ? 'owed' : 'owes'
    rows.push({
      memberId: other,
      displayName: ident.displayName,
      avatarUrl: ident.avatarUrl,
      isGuest: ident.isGuest,
      value,
      state,
    })
  }

  rows.sort((a, b) => b.value - a.value || (a.displayName < b.displayName ? -1 : 1))
  return rows
}

/* ------------------------------------------------------------- settle plan */

export interface SettleEdge {
  from: MemberId
  to: MemberId
  amount: Cents
  /** True when produced by debt simplification (label it in the UI). */
  simplified: boolean
}

/**
 * The settle-up payment list (CONTRACT §2.9/§2.10, §3.7). `simplify` on ->
 * greedy `simplifyDebts` over the primary-currency net; off -> the raw pairwise
 * debts. Both return uniform `{ from, to, amount }` edges in primary currency.
 */
export function settlePlan(
  group: GroupRec,
  expenses: ExpenseRec[],
  settlements: SettlementRec[],
  simplify: boolean,
  fxResolver?: FxResolver,
): SettleEdge[] {
  if (simplify) {
    const net = groupNet(group, expenses, settlements, fxResolver)
    return simplifyDebts(net).map((p) => ({ ...p, simplified: true }))
  }

  const pw = pairwiseBalances(
    { primaryCurrency: group.data.primaryCurrency },
    expenses.map(data),
    settlements.map(data),
    fxResolver,
  )
  const edges: SettleEdge[] = []
  for (const [from, tos] of Object.entries(pw)) {
    for (const [to, amount] of Object.entries(tos)) {
      if (amount > 0) edges.push({ from, to, amount, simplified: false })
    }
  }
  edges.sort((a, b) => b.amount - a.amount)
  return edges
}

/* ---------------------------------------------- cross-group dashboard rollup */

/** One group's contribution to the dashboard net (the viewer's net + its currency). */
export interface GroupNetContribution {
  primaryCurrency: string
  viewerNet: Signed
}

export interface OverallNet {
  displayCurrency: string
  /** Signed net in the display currency: >0 you're owed overall, <0 you owe. */
  net: Signed
  /** Positive amount you are owed (the `>0` part). */
  owed: Cents
  /** Positive amount you owe (the `<0` part, as a magnitude). */
  owe: Cents
  /** Always true -- this rollup uses today's rates, not snapshots (R1). */
  approximate: true
  /** Count of groups whose currency could not be converted (excluded). */
  unconvertedGroups: number
}

/**
 * The single dashboard "you are owed / you owe" figure across all groups
 * (CONTRACT §3.3, R1). Converts each group's viewer-net from that group's primary
 * currency into the user's `displayCurrency` at CURRENT rates -- a live cross-
 * ledger rollup, explicitly approximate. Per-group figures stay exact (snapshots).
 */
export function overallNet(
  contributions: GroupNetContribution[],
  displayCurrency: string,
  fxResolver: SafeFxResolver,
): OverallNet {
  let net = 0
  let unconvertedGroups = 0

  for (const c of contributions) {
    if (c.viewerNet === 0) continue
    if (c.primaryCurrency === displayCurrency) {
      net += c.viewerNet
      continue
    }
    const rate = fxResolver(c.primaryCurrency, displayCurrency)
    if (rate == null) {
      unconvertedGroups++
      continue
    }
    net += convertMinorAt(c.viewerNet, c.primaryCurrency, displayCurrency, rate)
  }

  return {
    displayCurrency,
    net,
    owed: net > 0 ? net : 0,
    owe: net < 0 ? -net : 0,
    approximate: true,
    unconvertedGroups,
  }
}
