import { describe, expect, it } from 'vitest'
import { spendInsights } from './insights'
import type { ExpenseData, GroupData, GroupMemberData } from './types'

function rec<T>(data: T, recordId = `r${Math.random().toString(36).slice(2)}`) {
  return { recordId, data, createdBy: 'sys', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
}

const grp = rec<GroupData>(
  { name: 'Trip', kind: 'group', primaryCurrency: 'USD', memberIds: ['A', 'B', 'C'], adminIds: ['A'], simplifyDefault: false },
  'g1',
)

const members = [
  rec<GroupMemberData>({ groupId: 'g1', memberIds: ['A', 'B', 'C'], userId: 'A', role: 'admin', status: 'active', displayName: 'Alice' }),
  rec<GroupMemberData>({ groupId: 'g1', memberIds: ['A', 'B', 'C'], userId: 'B', role: 'member', status: 'active', displayName: 'Bob' }),
  rec<GroupMemberData>({ groupId: 'g1', memberIds: ['A', 'B', 'C'], userId: 'C', role: 'member', status: 'active', displayName: 'Carol' }),
]

function expense(over: Partial<ExpenseData>) {
  return rec<ExpenseData>({
    groupId: 'g1',
    memberIds: ['A', 'B', 'C'],
    description: 'x',
    category: 'other',
    currency: 'USD',
    amountMinor: 0,
    fxRate: 1,
    paidBy: {},
    splits: {},
    splitConfig: { scope: 'simple', baseType: 'equal', participants: ['A', 'B', 'C'] },
    expenseAtMs: Date.UTC(2026, 0, 7), // a Wednesday
    ...over,
  })
}

describe('spendInsights (CONTRACT §7 A1)', () => {
  const expenses = [
    expense({ description: 'Dinner', category: 'food', amountMinor: 12000, paidBy: { A: 12000 }, splits: { A: 4000, B: 4000, C: 4000 } }),
    expense({ description: 'Taxi', category: 'transport', amountMinor: 3000, paidBy: { B: 3000 }, splits: { B: 1500, C: 1500 } }),
    // a soft-deleted expense must be excluded entirely
    expense({ description: 'Void', category: 'food', amountMinor: 99999, paidBy: { A: 99999 }, splits: { A: 99999 }, deletedAt: Date.now() }),
  ]

  it('totals spend, excludes deleted, and breaks down by category/payer', () => {
    const ins = spendInsights(grp, expenses, members, 'A')
    expect(ins.totalMinor).toBe(15000)
    expect(ins.expenseCount).toBe(2)
    expect(ins.avgPerExpenseMinor).toBe(7500)
    expect(ins.avgPerPersonMinor).toBe(5000)
    expect(ins.byCategory).toEqual({ food: 12000, transport: 3000 })
    expect(ins.byPayer).toEqual({ A: 12000, B: 3000 })
    expect(ins.largest?.description).toBe('Dinner')
    expect(ins.largest?.amountMinor).toBe(12000)
  })

  it('computes the viewer paid + net (spend only, no settlements)', () => {
    const ins = spendInsights(grp, expenses, members, 'A')
    expect(ins.viewerPaidMinor).toBe(12000)
    expect(ins.viewerNetMinor).toBe(12000 - 4000) // paid 12000, owed 4000
  })

  it('converts a foreign expense to primary via its snapshot', () => {
    const eur = expense({ description: 'Gelato', category: 'food', currency: 'EUR', amountMinor: 1000, fxRate: 1.1, paidBy: { A: 1000 }, splits: { A: 1000 } })
    const ins = spendInsights(grp, [eur], members, 'A')
    expect(ins.totalMinor).toBe(1100) // 10.00 EUR * 1.1 -> 11.00 USD
  })

  it('buckets spend by ISO week', () => {
    const ins = spendInsights(grp, expenses, members)
    expect(ins.byWeek).toHaveLength(1)
    expect(ins.byWeek[0].amountMinor).toBe(15000)
    expect(ins.byWeek[0].weekStartMs).toBe(Date.UTC(2026, 0, 5)) // Monday of that week
  })
})
