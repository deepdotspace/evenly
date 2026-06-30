/**
 * Export reconciliation tests (CONTRACT §3.4 export, §2.8, §4, §7).
 *
 * The load-bearing guarantee: a CSV/PDF export must reproduce the SAME balances
 * the app screens show, derived from the same `groupNet` selector — never a
 * second, drifting computation. These tests pin that, plus mixed-currency
 * conversion (entry-time snapshots), CSV escaping, and totals.
 */

import { describe, expect, it } from 'vitest'
import type { RecordData } from 'deepspace'
import { groupNet } from '../../lib/data'
import type {
  ExpenseData,
  GroupData,
  GroupMemberData,
  SettlementData,
} from '../../lib/data/types'
import { buildStatement } from './statement'
import { statementToCsv } from './csv'

/* ------------------------------------------------------------- fixtures */

let seq = 0
function rec<T>(data: T, createdBy = 'uA'): RecordData<T> {
  const id = `r${++seq}`
  return {
    recordId: id,
    data,
    createdBy,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as RecordData<T>
}

const MEMBERS = ['uA', 'uB', 'uC']

function group(): RecordData<GroupData> {
  return rec<GroupData>({
    name: 'Italy 2026',
    kind: 'group',
    primaryCurrency: 'USD',
    memberIds: MEMBERS,
    adminIds: ['uA'],
    simplifyDefault: 0,
  })
}

function members(): RecordData<GroupMemberData>[] {
  const mk = (userId: string, displayName: string): RecordData<GroupMemberData> =>
    rec<GroupMemberData>({
      groupId: 'g1',
      memberIds: MEMBERS,
      userId,
      role: userId === 'uA' ? 'admin' : 'member',
      status: 'active',
      displayName,
    })
  return [mk('uA', 'Alice'), mk('uB', 'Bob'), mk('uC', 'Carol')]
}

/** USD 120 split equally; Alice paid 100, Bob 20 (multi-payer §2.8 vector). */
function usdExpense(): RecordData<ExpenseData> {
  return rec<ExpenseData>({
    groupId: 'g1',
    memberIds: MEMBERS,
    description: 'Dinner, "fancy"', // exercises CSV escaping
    category: 'dining',
    currency: 'USD',
    amountMinor: 12000,
    fxRate: 1,
    paidBy: { uA: 10000, uB: 2000 },
    splits: { uA: 4000, uB: 4000, uC: 4000 },
    splitConfig: { scope: 'simple', baseType: 'equal', participants: MEMBERS },
    expenseAtMs: Date.UTC(2026, 0, 5, 12),
  })
}

/** EUR 50 paid by Carol, converted at the snapshot 1 EUR = 1.10 USD (§2.8, §4). */
function eurExpense(): RecordData<ExpenseData> {
  return rec<ExpenseData>({
    groupId: 'g1',
    memberIds: MEMBERS,
    description: 'Museum',
    category: 'entertainment',
    currency: 'EUR',
    amountMinor: 5000,
    fxRate: 1.1,
    paidBy: { uC: 5000 },
    splits: { uA: 1667, uB: 1667, uC: 1666 },
    splitConfig: { scope: 'simple', baseType: 'equal', participants: MEMBERS },
    expenseAtMs: Date.UTC(2026, 0, 6, 12),
  })
}

/** Bob settles 20 USD with Alice. */
function settlement(): RecordData<SettlementData> {
  return rec<SettlementData>({
    groupId: 'g1',
    memberIds: MEMBERS,
    fromUserId: 'uB',
    toUserId: 'uA',
    currency: 'USD',
    amountMinor: 2000,
    fxRate: 1,
    method: 'cash',
    settledAtMs: Date.UTC(2026, 0, 8, 12),
  })
}

/* ----------------------------------------------------------------- tests */

describe('buildStatement', () => {
  it('balances equal the groupNet selector exactly (export never drifts from the app)', () => {
    const g = group()
    const exp = [usdExpense(), eurExpense()]
    const set = [settlement()]
    const s = buildStatement({ group: g, members: members(), expenses: exp, settlements: set })

    const net = groupNet(g, exp, set)
    for (const b of s.balances) {
      expect(b.netMinor).toBe(net[b.memberId] ?? 0)
    }
    // Σ net is ~0; the per-row FX rounding leaves at most a few minor units (§2.8).
    expect(Math.abs(s.residualMinor)).toBeLessThanOrEqual(2)
    expect(s.residualMinor).toBe(s.balances.reduce((a, b) => a + b.netMinor, 0))
  })

  it('totals are in primary currency: USD 120 + EUR 50@1.10 = 175.00', () => {
    const s = buildStatement({
      group: group(),
      members: members(),
      expenses: [usdExpense(), eurExpense()],
      settlements: [settlement()],
    })
    expect(s.totals.expensesPrimaryMinor).toBe(17500) // 12000 + 5500
    expect(s.totals.settlementsPrimaryMinor).toBe(2000)
    expect(s.hasForeign).toBe(true)
  })

  it('rows are chronological ascending and carry original + converted amounts', () => {
    const s = buildStatement({
      group: group(),
      members: members(),
      expenses: [eurExpense(), usdExpense()],
      settlements: [settlement()],
    })
    expect(s.rows.map((r) => r.kind)).toEqual(['expense', 'expense', 'settlement'])
    const eur = s.rows.find((r) => r.currency === 'EUR')!
    expect(eur.foreign).toBe(true)
    expect(eur.amountMinor).toBe(5000)
    expect(eur.primaryMinor).toBe(5500)
  })
})

describe('statementToCsv', () => {
  const s = buildStatement({
    group: group(),
    members: members(),
    expenses: [usdExpense(), eurExpense()],
    settlements: [settlement()],
  })
  const csv = statementToCsv(s)
  const lines = csv.split('\r\n')

  it('has the header block with the entry-time FX note', () => {
    expect(csv).toContain('Evenly — Italy 2026 statement')
    expect(csv).toContain('Primary currency,USD')
    expect(csv).toContain('exchange rate captured when each entry was added')
  })

  it('escapes a description containing a comma and quotes (RFC-4180)', () => {
    // "Dinner, \"fancy\"" -> "Dinner, ""fancy"""
    expect(csv).toContain('"Dinner, ""fancy"""')
  })

  it('writes one ledger row per expense + settlement with original + primary amounts', () => {
    const ledger = lines.filter((l) => /^2026-01-\d\d,/.test(l))
    expect(ledger).toHaveLength(3)
    // EUR row shows original 50.00 (EUR) and converted 55.00 (USD).
    const eurRow = ledger.find((l) => l.includes(',EUR,'))!
    expect(eurRow).toContain(',EUR,50.00,55.00,')
    // Settlement row.
    expect(ledger.some((l) => l.startsWith('2026-01-08,Settlement,'))).toBe(true)
  })

  it('writes a balances block whose nets match the statement', () => {
    expect(csv).toContain('BALANCES (net in USD)')
    for (const b of s.balances) {
      const major = (b.netMinor / 100).toFixed(2)
      expect(csv).toContain(`,${major},`)
    }
  })
})
