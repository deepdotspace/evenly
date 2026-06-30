import { describe, expect, it } from 'vitest'
import {
  buildBalanceLadder,
  groupNet,
  overallNet,
  settlePlan,
  viewerPairRows,
} from './balances'
import type {
  ExpenseData,
  GroupData,
  GroupMemberData,
  SettlementData,
} from './types'

/** Minimal record-envelope factory matching the SDK `RecordData<T>` shape. */
function rec<T>(data: T, recordId = `r${Math.random().toString(36).slice(2)}`) {
  return { recordId, data, createdBy: 'sys', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
}

function group(primaryCurrency = 'USD', over: Partial<GroupData> = {}) {
  return rec<GroupData>(
    {
      name: 'Trip',
      kind: 'group',
      primaryCurrency,
      memberIds: ['A', 'B', 'C'],
      adminIds: ['A'],
      simplifyDefault: false,
      ...over,
    },
    'g1',
  )
}

function member(id: string, displayName: string, over: Partial<GroupMemberData> = {}) {
  return rec<GroupMemberData>({
    groupId: 'g1',
    memberIds: ['A', 'B', 'C'],
    userId: id,
    role: 'member',
    status: 'active',
    displayName,
    ...over,
  })
}

function expense(over: Partial<ExpenseData>): ReturnType<typeof rec<ExpenseData>> {
  return rec<ExpenseData>({
    groupId: 'g1',
    memberIds: ['A', 'B', 'C'],
    description: 'Dinner',
    category: 'food',
    currency: 'USD',
    amountMinor: 0,
    fxRate: 1,
    paidBy: {},
    splits: {},
    splitConfig: { scope: 'simple', baseType: 'equal', participants: ['A', 'B', 'C'] },
    ...over,
  })
}

// CONTRACT §2.8 multi-payer vector: $120 equal/3, Alice paid 100, Bob 20.
const multiPayer = expense({
  amountMinor: 12000,
  paidBy: { A: 10000, B: 2000 },
  splits: { A: 4000, B: 4000, C: 4000 },
})

const members = [member('A', 'Alice'), member('B', 'Bob'), member('C', 'Carol')]

describe('groupNet (CONTRACT §2.8)', () => {
  it('matches the multi-payer vector and sums to zero', () => {
    const net = groupNet(group(), [multiPayer], [])
    expect(net).toEqual({ A: 6000, B: -2000, C: -4000 })
    expect(net.A + net.B + net.C).toBe(0)
  })

  it('excludes soft-deleted expenses', () => {
    const deleted = expense({ amountMinor: 9000, paidBy: { A: 9000 }, splits: { A: 3000, B: 3000, C: 3000 }, deletedAt: Date.now() })
    const net = groupNet(group(), [multiPayer, deleted], [])
    expect(net).toEqual({ A: 6000, B: -2000, C: -4000 })
  })

  it('applies a settlement (debtor pays the creditor down)', () => {
    const s = rec<SettlementData>({
      groupId: 'g1',
      memberIds: ['A', 'B', 'C'],
      fromUserId: 'C',
      toUserId: 'A',
      currency: 'USD',
      amountMinor: 4000,
      fxRate: 1,
      method: 'manual',
    })
    const net = groupNet(group(), [multiPayer], [s])
    expect(net).toEqual({ A: 2000, B: -2000, C: 0 })
  })
})

describe('buildBalanceLadder (CONTRACT §3.4)', () => {
  it('labels owed/owes/even and normalizes bar width', () => {
    const net = groupNet(group(), [multiPayer], [])
    const ladder = buildBalanceLadder(net, members)
    const byId = Object.fromEntries(ladder.map((r) => [r.memberId, r]))
    expect(byId.A.state).toBe('owed')
    expect(byId.B.state).toBe('owes')
    expect(byId.A.barWidth).toBe(1) // largest absolute balance
    expect(byId.C.barWidth).toBeCloseTo(4000 / 6000)
    expect(ladder[0].memberId).toBe('A') // creditors first
  })

  it('marks a near-zero balance even (FX residue tolerance)', () => {
    const ladder = buildBalanceLadder({ A: 1, B: -1, C: 0 }, members)
    expect(ladder.every((r) => r.state === 'even')).toBe(true)
  })
})

describe('settlePlan (CONTRACT §2.9/§2.10, §3.7)', () => {
  it('simplify ON produces n-1 labelled payments', () => {
    const plan = settlePlan(group(), [multiPayer], [], true)
    expect(plan).toHaveLength(2)
    expect(plan.every((e) => e.simplified)).toBe(true)
    const toA = plan.filter((e) => e.to === 'A').reduce((s, e) => s + e.amount, 0)
    expect(toA).toBe(6000)
  })

  it('simplify OFF conserves each member net within the FX/pairwise rounding tolerance', () => {
    const net = groupNet(group(), [multiPayer], [])
    const plan = settlePlan(group(), [multiPayer], [], false)
    expect(plan.every((e) => !e.simplified)).toBe(true)
    // A pure debtor with no self-payment settles exactly.
    const fromC = plan.filter((e) => e.from === 'C').reduce((s, e) => s + e.amount, 0)
    expect(fromC).toBe(4000)
    // Each member's (paid out - received) reconciles to their net (±1 = per-pair
    // rounding, which §2.9 surfaces as rounding, never a phantom debt).
    for (const id of ['A', 'B', 'C'] as const) {
      const out = plan.filter((e) => e.from === id).reduce((s, e) => s + e.amount, 0)
      const inc = plan.filter((e) => e.to === id).reduce((s, e) => s + e.amount, 0)
      expect(Math.abs(out - inc + net[id])).toBeLessThanOrEqual(1)
    }
  })
})

describe('viewerPairRows (CONTRACT §3.4, R2)', () => {
  it('shows each other member signed from the viewer perspective', () => {
    const rows = viewerPairRows(group(), [multiPayer], [], 'A', members)
    // Alice is owed by both Bob and Carol -> both positive from her view.
    expect(rows.every((r) => r.memberId !== 'A')).toBe(true)
    expect(rows.every((r) => r.value > 0)).toBe(true)
    // Sum reconciles to Alice's net within the per-pair rounding tolerance (§2.9).
    const total = rows.reduce((s, r) => s + r.value, 0)
    expect(Math.abs(total - 6000)).toBeLessThanOrEqual(1)
  })
})

describe('overallNet cross-group rollup (CONTRACT R1)', () => {
  const resolver = (from: string, to: string): number | null => {
    if (from === to) return 1
    if (from === 'EUR' && to === 'USD') return 1.1
    return null // unknown pairs unavailable
  }

  it('converts each group net to display currency at current rates', () => {
    const result = overallNet(
      [
        { primaryCurrency: 'USD', viewerNet: 6000 },
        { primaryCurrency: 'EUR', viewerNet: -3000 }, // -30.00 EUR -> -33.00 USD
      ],
      'USD',
      resolver,
    )
    expect(result.net).toBe(6000 - 3300)
    expect(result.owed).toBe(2700)
    expect(result.owe).toBe(0)
    expect(result.approximate).toBe(true)
    expect(result.unconvertedGroups).toBe(0)
  })

  it('excludes groups whose currency cannot be converted', () => {
    const result = overallNet(
      [
        { primaryCurrency: 'USD', viewerNet: 5000 },
        { primaryCurrency: 'XYZ', viewerNet: 9999 },
      ],
      'USD',
      resolver,
    )
    expect(result.net).toBe(5000)
    expect(result.unconvertedGroups).toBe(1)
  })
})
