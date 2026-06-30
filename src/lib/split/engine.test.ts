import { describe, it, expect } from 'vitest'
import {
  largestRemainder,
  computeBaseSplit,
  applyAdjustments,
  distributeOverhead,
  allocateItemized,
  computeExpenseShares,
  netBalances,
  pairwiseBalances,
  simplifyDebts,
  reconcileScan,
  SplitError,
  // currency helpers
  MINOR_DIGITS,
  minorDigits,
  scale,
  toMinor,
  fromMinor,
  formatMoney,
} from './index'
import type { Shares, SplitConfig } from './index'

/** Sum the values of a shares/balance map. */
function sum(m: Record<string, number>): number {
  return Object.values(m).reduce((a, b) => a + b, 0)
}

/** Deterministic PRNG (mulberry32) so randomized property tests are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ============================================================ §2.2 largestRemainder */

describe('largestRemainder (§2.2)', () => {
  it('weighted vector 10000 by {1,2,4}', () => {
    const r = largestRemainder(10000, { A: 1, B: 2, C: 4 })
    expect(r).toEqual({ A: 1429, B: 2857, C: 5714 })
    expect(sum(r)).toBe(10000)
  })

  it('equal /3 of 1000 never loses the penny (334/333/333)', () => {
    const r = largestRemainder(1000, { A: 1, B: 1, C: 1 })
    expect(r).toEqual({ A: 334, B: 333, C: 333 })
    expect(sum(r)).toBe(1000)
  })

  it('ties broken by ascending MemberId (leftover goes to A then B)', () => {
    // 1001 / 3 -> floors 333 each, leftover 2 -> A and B (lexicographic), not C.
    expect(largestRemainder(1001, { A: 1, B: 1, C: 1 })).toEqual({ A: 334, B: 334, C: 333 })
  })

  it('total 0 -> all zero', () => {
    expect(largestRemainder(0, { A: 1, B: 2 })).toEqual({ A: 0, B: 0 })
  })

  it('all-zero weights -> all zero (caller validates non-empty)', () => {
    expect(largestRemainder(0, { A: 0, B: 0 })).toEqual({ A: 0, B: 0 })
  })

  it('rejects negative total and non-integer / negative weights', () => {
    expect(() => largestRemainder(-1, { A: 1 })).toThrow(SplitError)
    expect(() => largestRemainder(100, { A: 1.5 })).toThrow(SplitError)
    expect(() => largestRemainder(100, { A: -1 })).toThrow(SplitError)
    expect(() => largestRemainder(10.5, { A: 1 })).toThrow(SplitError)
  })

  it('handles large totals exactly (BigInt path, no float drift)', () => {
    const total = 1_000_000_000
    const r = largestRemainder(total, { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1, G: 1 })
    expect(sum(r)).toBe(total)
  })

  it('property: always sums to total, all shares non-negative (randomized)', () => {
    const rnd = rng(0xc0ffee)
    for (let iter = 0; iter < 3000; iter++) {
      const n = 1 + Math.floor(rnd() * 8)
      const total = Math.floor(rnd() * 5_000_000)
      const weights: Record<string, number> = {}
      let nonZero = false
      for (let i = 0; i < n; i++) {
        const w = Math.floor(rnd() * 12)
        weights['m' + i] = w
        if (w > 0) nonZero = true
      }
      if (!nonZero) weights.m0 = 1
      const shares = largestRemainder(total, weights)
      expect(sum(shares)).toBe(total)
      for (const v of Object.values(shares)) expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})

/* ============================================================ §2.3 computeBaseSplit */

describe('computeBaseSplit (§2.3)', () => {
  const ps = ['A', 'B', 'C']

  it('equal', () => {
    expect(computeBaseSplit(1000, { scope: 'simple', baseType: 'equal', participants: ps })).toEqual({
      A: 334,
      B: 333,
      C: 333,
    })
  })

  it('shares', () => {
    expect(
      computeBaseSplit(10000, { scope: 'simple', baseType: 'shares', participants: ps, weights: { A: 1, B: 2, C: 4 } }),
    ).toEqual({ A: 1429, B: 2857, C: 5714 })
  })

  it('percent (sums to 100)', () => {
    expect(
      computeBaseSplit(10000, {
        scope: 'simple',
        baseType: 'percent',
        participants: ps,
        percents: { A: 50, B: 30, C: 20 },
      }),
    ).toEqual({ A: 5000, B: 3000, C: 2000 })
  })

  it('percent != 100 is rejected', () => {
    expect(() =>
      computeBaseSplit(10000, { scope: 'simple', baseType: 'percent', participants: ps, percents: { A: 50, B: 30 } }),
    ).toThrow(SplitError)
  })

  it('exact verbatim when it sums to total', () => {
    expect(
      computeBaseSplit(4000, {
        scope: 'simple',
        baseType: 'exact',
        participants: ['A', 'B'],
        exactAmounts: { A: 2000, B: 2000 },
      }),
    ).toEqual({ A: 2000, B: 2000 })
  })

  it('exact that does not sum to total is rejected, with remaining in details', () => {
    try {
      computeBaseSplit(5000, {
        scope: 'simple',
        baseType: 'exact',
        participants: ['A', 'B'],
        exactAmounts: { A: 2000, B: 2000 },
      })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(SplitError)
      expect((e as SplitError).code).toBe('EXACT_SUM')
      expect((e as SplitError).details?.remaining).toBe(1000)
    }
  })

  it('treat splits equally among participants (payer pre-excluded)', () => {
    // Payer "A" is not in participants; the rest share the whole total.
    expect(
      computeBaseSplit(3000, { scope: 'simple', baseType: 'treat', participants: ['B', 'C'], payerIsParticipant: false }),
    ).toEqual({ B: 1500, C: 1500 })
  })

  it('single participant gets the whole total', () => {
    expect(computeBaseSplit(777, { scope: 'simple', baseType: 'equal', participants: ['solo'] })).toEqual({ solo: 777 })
  })

  it('rejects an empty participant set', () => {
    expect(() => computeBaseSplit(100, { scope: 'simple', baseType: 'equal', participants: [] })).toThrow(SplitError)
  })
})

/* ============================================================ §2.4 applyAdjustments */

describe('applyAdjustments (§2.4)', () => {
  it('pizza: T=3000 equal/3, Carol +600 -> {800,800,1400}', () => {
    const config: SplitConfig = {
      scope: 'simple',
      baseType: 'equal',
      participants: ['A', 'B', 'C'],
      adjustments: { C: 600 },
    }
    const r = applyAdjustments(3000, config)
    expect(r).toEqual({ A: 800, B: 800, C: 1400 })
    expect(sum(r)).toBe(3000)
  })

  it('no adjustments behaves like the base split', () => {
    expect(applyAdjustments(1000, { scope: 'simple', baseType: 'equal', participants: ['A', 'B', 'C'] })).toEqual({
      A: 334,
      B: 333,
      C: 333,
    })
  })

  it('adjustments exceeding the total are rejected', () => {
    expect(() =>
      applyAdjustments(1000, {
        scope: 'simple',
        baseType: 'equal',
        participants: ['A', 'B'],
        adjustments: { A: 2000 },
      }),
    ).toThrow(SplitError)
  })

  it('negative adjustment (a credit) still conserves the total', () => {
    const r = applyAdjustments(3000, {
      scope: 'simple',
      baseType: 'equal',
      participants: ['A', 'B', 'C'],
      adjustments: { C: -300 },
    })
    expect(sum(r)).toBe(3000)
    expect(r.C).toBe(1100 - 300) // remainder 3300/3 = 1100, minus 300
  })
})

/* ============================================================ §2.5 distributeOverhead */

describe('distributeOverhead (§2.5)', () => {
  it('proportional over subtotals', () => {
    const r = distributeOverhead(600, { A: 1800, B: 3200, C: 2500 }, 'proportional')
    expect(r).toEqual({ A: 144, B: 256, C: 200 })
    expect(sum(r)).toBe(600)
  })

  it('even split', () => {
    const r = distributeOverhead(1000, { A: 0, B: 0, C: 0 }, 'even')
    expect(r).toEqual({ A: 334, B: 333, C: 333 })
  })

  it('discount (negative amount) yields negative contributions that sum to -amount', () => {
    const r = distributeOverhead(-500, { A: 1000, B: 1000 }, 'proportional')
    expect(r).toEqual({ A: -250, B: -250 })
    expect(sum(r)).toBe(-500)
  })

  it('proportional with all-zero weights falls back to even (amount not dropped)', () => {
    const r = distributeOverhead(300, { A: 0, B: 0, C: 0 }, 'proportional')
    expect(sum(r)).toBe(300)
  })

  it('proportional clamps a negative weight to 0 instead of throwing (R2-1)', () => {
    // A per-person credit can push a member's base share below 0; that member then
    // carries no positive weight for the overhead. Must not throw INVALID_WEIGHT.
    const r = distributeOverhead(300, { A: 1534, B: 1533, C: -67 }, 'proportional')
    expect(r).toEqual({ A: 150, B: 150, C: 0 })
    expect(sum(r)).toBe(300)
  })

  it('proportional with all-negative weights falls back to even (amount not dropped)', () => {
    const r = distributeOverhead(300, { A: -10, B: -20 }, 'proportional')
    expect(sum(r)).toBe(300)
    expect(r).toEqual({ A: 150, B: 150 })
  })
})

/* ============================================================ §2.6 computeExpenseShares */

describe('computeExpenseShares (§2.6)', () => {
  it('A. simple scope = applyAdjustments on the amount (pizza vector)', () => {
    const r = computeExpenseShares({
      amountMinor: 3000,
      splitConfig: { scope: 'simple', baseType: 'equal', participants: ['A', 'B', 'C'], adjustments: { C: 600 } },
    })
    expect(r).toEqual({ A: 800, B: 800, C: 1400 })
  })

  it('B. withOverhead proportional: subtotals {1800,3200,2500} + tax 600 + tip 1500 -> {2304,4096,3200}', () => {
    const r = computeExpenseShares({
      amountMinor: 9600,
      splitConfig: {
        scope: 'withOverhead',
        baseType: 'exact',
        participants: ['A', 'B', 'C'],
        subtotalMinor: 7500,
        exactAmounts: { A: 1800, B: 3200, C: 2500 },
        overheads: [
          { kind: 'tax', amountMinor: 600, mode: 'proportional' },
          { kind: 'tip', amountMinor: 1500, mode: 'proportional' },
        ],
      },
    })
    expect(r).toEqual({ A: 2304, B: 4096, C: 3200 })
    expect(sum(r)).toBe(9600)
  })

  it('B. withOverhead asserts amountMinor === subtotal + overheads', () => {
    expect(() =>
      computeExpenseShares({
        amountMinor: 9999, // wrong: real total is 9600
        splitConfig: {
          scope: 'withOverhead',
          baseType: 'exact',
          participants: ['A', 'B', 'C'],
          subtotalMinor: 7500,
          exactAmounts: { A: 1800, B: 3200, C: 2500 },
          overheads: [
            { kind: 'tax', amountMinor: 600, mode: 'proportional' },
            { kind: 'tip', amountMinor: 1500, mode: 'proportional' },
          ],
        },
      }),
    ).toThrow(SplitError)
  })

  it('B. withOverhead + adjustments: carve adj out of subtotal, split remainder, add back, then overhead (R2-2)', () => {
    // subtotal 2000, A gets a +400 adjustment: base splits 1600 evenly ({800,800}),
    // then +400 to A ({1200,800}); an even 200 tip distributes over the adjusted base.
    const r = computeExpenseShares({
      amountMinor: 2200,
      splitConfig: {
        scope: 'withOverhead',
        baseType: 'equal',
        participants: ['A', 'B'],
        subtotalMinor: 2000,
        adjustments: { A: 400 },
        overheads: [{ kind: 'tip', amountMinor: 200, mode: 'even' }],
      },
    })
    expect(r).toEqual({ A: 1300, B: 900 })
    expect(sum(r)).toBe(2200)
  })

  it('B. withOverhead + a negative adjustment below zero with a proportional overhead does not throw (R2-1/R2-2)', () => {
    // C's -1600 credit pushes C's base to -67; a proportional tax must clamp C's
    // weight to 0 (not throw) and still conserve to amountMinor.
    const r = computeExpenseShares({
      amountMinor: 3300,
      splitConfig: {
        scope: 'withOverhead',
        baseType: 'equal',
        participants: ['A', 'B', 'C'],
        subtotalMinor: 3000,
        adjustments: { C: -1600 },
        overheads: [{ kind: 'tax', amountMinor: 300, mode: 'proportional' }],
      },
    })
    expect(r).toEqual({ A: 1684, B: 1683, C: -67 })
    expect(sum(r)).toBe(3300)
  })

  it('C. itemized vector -> totals {2688,2048,768} (sum 5504)', () => {
    const r = computeExpenseShares({
      amountMinor: 5504,
      splitConfig: {
        scope: 'itemized',
        baseType: 'equal',
        participants: ['A', 'B', 'C'],
        unclaimedPolicy: 'even',
        overheads: [
          { kind: 'tax', amountMinor: 430, mode: 'proportional' },
          { kind: 'tip', amountMinor: 774, mode: 'proportional' },
        ],
      },
      receipt: {
        items: [
          { id: 'nachos', lineTotalMinor: 1200 },
          { id: 'burger', lineTotalMinor: 1500 },
          { id: 'salad', lineTotalMinor: 1000 },
          { id: 'fries', lineTotalMinor: 600 },
        ],
        claims: { nachos: ['A', 'B', 'C'], burger: ['A'], salad: ['B'] }, // fries unclaimed
      },
    })
    expect(r).toEqual({ A: 2688, B: 2048, C: 768 })
    expect(sum(r)).toBe(5504)
  })

  it('zero-total expense -> all zero', () => {
    const r = computeExpenseShares({
      amountMinor: 0,
      splitConfig: { scope: 'simple', baseType: 'equal', participants: ['A', 'B'] },
    })
    expect(r).toEqual({ A: 0, B: 0 })
  })

  it('rejects a negative amount', () => {
    expect(() =>
      computeExpenseShares({ amountMinor: -1, splitConfig: { scope: 'simple', baseType: 'equal', participants: ['A'] } }),
    ).toThrow(SplitError)
  })

  it('property: simple equal always sums to amountMinor (randomized)', () => {
    const rnd = rng(0x5151)
    for (let i = 0; i < 800; i++) {
      const n = 1 + Math.floor(rnd() * 7)
      const participants = Array.from({ length: n }, (_, k) => 'u' + k)
      const amountMinor = Math.floor(rnd() * 1_000_000)
      const r = computeExpenseShares({ amountMinor, splitConfig: { scope: 'simple', baseType: 'equal', participants } })
      expect(sum(r)).toBe(amountMinor)
    }
  })

  it('property: withOverhead always sums to amountMinor (randomized)', () => {
    const rnd = rng(0x9001)
    for (let i = 0; i < 600; i++) {
      const n = 2 + Math.floor(rnd() * 5)
      const participants = Array.from({ length: n }, (_, k) => 'u' + k)
      const subtotalMinor = 100 + Math.floor(rnd() * 500_000)
      const tax = Math.floor(rnd() * 5000)
      const tip = Math.floor(rnd() * 5000)
      const fee = Math.floor(rnd() * 2000)
      const discount = Math.floor(rnd() * Math.min(1000, subtotalMinor))
      const amountMinor = subtotalMinor + tax + tip + fee - discount
      const r = computeExpenseShares({
        amountMinor,
        splitConfig: {
          scope: 'withOverhead',
          baseType: 'equal',
          participants,
          subtotalMinor,
          overheads: [
            { kind: 'tax', amountMinor: tax, mode: 'proportional' },
            { kind: 'tip', amountMinor: tip, mode: rnd() < 0.5 ? 'proportional' : 'even', base: 'postTax' },
            { kind: 'fee', amountMinor: fee, mode: 'even' },
            { kind: 'discount', amountMinor: discount, mode: 'proportional' },
          ],
        },
      })
      expect(sum(r)).toBe(amountMinor)
    }
  })
})

/* ============================================================ §2.7 allocateItemized */

describe('allocateItemized (§2.7)', () => {
  const items = [
    { id: 'nachos', lineTotalMinor: 1200 },
    { id: 'burger', lineTotalMinor: 1500 },
    { id: 'salad', lineTotalMinor: 1000 },
    { id: 'fries', lineTotalMinor: 600 },
  ]
  const claims = { nachos: ['A', 'B', 'C'], burger: ['A'], salad: ['B'] }

  it("even policy -> subtotals {2100,1600,600}, unclaimed 600", () => {
    const r = allocateItemized(items, claims, 'even', { participants: ['A', 'B', 'C'] })
    expect(r.subtotals).toEqual({ A: 2100, B: 1600, C: 600 })
    expect(r.unclaimed).toBe(600)
    expect(r.unclaimedItemIds).toEqual(['fries'])
  })

  it('payer policy assigns the whole pool to the payer', () => {
    const r = allocateItemized(items, claims, 'payer', { participants: ['A', 'B', 'C'], payerId: 'C' })
    expect(r.subtotals.C).toBe(400 + 600) // C's nachos third + the fries pool
    expect(r.unclaimed).toBe(600)
  })

  it('manual policy leaves the pool unassigned', () => {
    const r = allocateItemized(items, claims, 'manual', { participants: ['A', 'B', 'C'] })
    expect(r.subtotals).toEqual({ A: 1900, B: 1400, C: 400 })
    expect(r.unclaimed).toBe(600)
  })

  it('itemized + manual with unclaimed > 0 cannot compute shares', () => {
    expect(() =>
      computeExpenseShares({
        amountMinor: 4300,
        splitConfig: { scope: 'itemized', baseType: 'equal', participants: ['A', 'B', 'C'], unclaimedPolicy: 'manual' },
        receipt: { items, claims },
      }),
    ).toThrow(SplitError)
  })

  it('per-item equal split reconciles (odd line split among claimers)', () => {
    const r = allocateItemized([{ id: 'x', lineTotalMinor: 1000 }], { x: ['A', 'B', 'C'] }, 'even', {
      participants: ['A', 'B', 'C'],
    })
    expect(r.subtotals).toEqual({ A: 334, B: 333, C: 333 })
    expect(r.unclaimed).toBe(0)
  })
})

/* ============================================================ §2.8 netBalances */

describe('netBalances (§2.8)', () => {
  it('multi-payer vector: $120 equal/3, Alice 100 / Bob 20 / Carol 0', () => {
    const splits = computeExpenseShares({
      amountMinor: 12000,
      splitConfig: { scope: 'simple', baseType: 'equal', participants: ['Alice', 'Bob', 'Carol'] },
    })
    const net = netBalances(
      { primaryCurrency: 'USD' },
      [{ currency: 'USD', fxRate: 1, paidBy: { Alice: 10000, Bob: 2000, Carol: 0 }, splits }],
      [],
    )
    expect(net).toEqual({ Alice: 6000, Bob: -2000, Carol: -4000 })
    expect(sum(net)).toBe(0)
  })

  it('settlement moves the debtor toward zero', () => {
    const net = netBalances(
      { primaryCurrency: 'USD' },
      [{ currency: 'USD', fxRate: 1, paidBy: { A: 3000 }, splits: { A: 1000, B: 1000, C: 1000 } }],
      [{ fromUserId: 'B', toUserId: 'A', currency: 'USD', fxRate: 1, amountMinor: 1000 }],
    )
    // A was owed 2000, B paid back 1000 -> A owed 1000, B square, C owes 1000.
    expect(net).toEqual({ A: 1000, B: 0, C: -1000 })
    expect(sum(net)).toBe(0)
  })

  it('excludes soft-deleted rows', () => {
    const net = netBalances(
      { primaryCurrency: 'USD' },
      [
        { currency: 'USD', fxRate: 1, paidBy: { A: 1000 }, splits: { A: 500, B: 500 } },
        { currency: 'USD', fxRate: 1, paidBy: { A: 9999 }, splits: { A: 9999 }, deletedAt: 123 },
      ],
      [],
    )
    expect(net).toEqual({ A: 500, B: -500 })
  })

  it('converts a foreign expense via its stored snapshot (USD expense in a JPY group)', () => {
    // 1 USD = 150 JPY. $10 paid by A, split A/B.
    const net = netBalances(
      { primaryCurrency: 'JPY' },
      [{ currency: 'USD', fxRate: 150, paidBy: { A: 1000 }, splits: { A: 500, B: 500 } }],
      [],
    )
    expect(net).toEqual({ A: 750, B: -750 }) // ¥1500 paid, owed ¥750 each
    expect(sum(net)).toBe(0)
  })

  it('per-row FX rounding can leave a tiny residual (surface as rounding, never 0 forced)', () => {
    // 10.00 EUR split 3 ways at rate 1.1 -> per-row rounding residual.
    const splits = computeExpenseShares({
      amountMinor: 1000,
      splitConfig: { scope: 'simple', baseType: 'equal', participants: ['A', 'B', 'C'] },
    })
    const net = netBalances(
      { primaryCurrency: 'USD' },
      [{ currency: 'EUR', fxRate: 1.1, paidBy: { A: 1000 }, splits }],
      [],
    )
    expect(Math.abs(sum(net))).toBeLessThanOrEqual(2)
  })

  it('falls back to the fxResolver when a row lacks a stored rate', () => {
    const net = netBalances(
      { primaryCurrency: 'USD' },
      [{ currency: 'EUR', fxRate: null, paidBy: { A: 1000 }, splits: { A: 500, B: 500 } }],
      [],
      (from, to) => (from === 'EUR' && to === 'USD' ? 1.1 : 1),
    )
    expect(net.A).toBe(550)
    expect(net.B).toBe(-550)
  })

  it('throws when no rate is available for a foreign row', () => {
    expect(() =>
      netBalances({ primaryCurrency: 'USD' }, [{ currency: 'EUR', fxRate: null, paidBy: { A: 100 }, splits: { A: 100 } }], []),
    ).toThrow(SplitError)
  })
})

/* ============================================================ §2.9 pairwiseBalances */

describe('pairwiseBalances (§2.9)', () => {
  it('single payer: B and C each owe A their share', () => {
    const r = pairwiseBalances(
      { primaryCurrency: 'USD' },
      [{ currency: 'USD', fxRate: 1, paidBy: { A: 3000 }, splits: { A: 1000, B: 1000, C: 1000 } }],
      [],
    )
    expect(r).toEqual({ B: { A: 1000 }, C: { A: 1000 } })
  })

  it('a settlement nets the pair directly', () => {
    const r = pairwiseBalances(
      { primaryCurrency: 'USD' },
      [{ currency: 'USD', fxRate: 1, paidBy: { A: 3000 }, splits: { A: 1000, B: 1000, C: 1000 } }],
      [{ fromUserId: 'B', toUserId: 'A', currency: 'USD', fxRate: 1, amountMinor: 1000 }],
    )
    expect(r).toEqual({ C: { A: 1000 } }) // B fully settled
  })

  /* --- regression: a negative per-member share used to throw INVALID_TOTAL --- */

  /** Per-member net implied by a pairwise graph (debtor -= amt, creditor += amt). */
  function netFromPairwise(pw: Record<string, Record<string, number>>): Record<string, number> {
    const net: Record<string, number> = {}
    for (const [debtor, creditors] of Object.entries(pw)) {
      for (const [creditor, amt] of Object.entries(creditors)) {
        net[debtor] = (net[debtor] ?? 0) - amt
        net[creditor] = (net[creditor] ?? 0) + amt
      }
    }
    return net
  }

  it('negative per-member share no longer throws and returns correct edges (P1 crash repro)', () => {
    // Reachable input: a per-person credit (the +/- field) carves a member below
    // zero -> splits {A:-50, B:1050}. largestRemainder(neg) used to crash here.
    const group = { primaryCurrency: 'USD' as const }
    const expenses = [{ currency: 'USD', fxRate: 1, paidBy: { A: 1000 }, splits: { A: -50, B: 1050 } }]
    let r!: ReturnType<typeof pairwiseBalances>
    expect(() => {
      r = pairwiseBalances(group, expenses, [])
    }).not.toThrow()
    // B owes A the full 1050 (A overpaid by their own -50 credit).
    expect(r).toEqual({ B: { A: 1050 } })
    // Every edge is a finite number.
    for (const creditors of Object.values(r)) {
      for (const amt of Object.values(creditors)) expect(Number.isFinite(amt)).toBe(true)
    }
    // ...and it reconciles to the (already-correct) netBalances.
    expect(netFromPairwise(r)).toEqual(netBalances(group, expenses, []))
  })

  it('negative share from an even-mode discount over an unequal base reconciles to netBalances', () => {
    // subtotal split {A:10,B:190} + a 120 discount split EVEN -> {A:-50, B:130}.
    const splits = computeExpenseShares({
      amountMinor: 80,
      splitConfig: {
        scope: 'withOverhead',
        baseType: 'exact',
        participants: ['A', 'B'],
        subtotalMinor: 200,
        exactAmounts: { A: 10, B: 190 },
        overheads: [{ kind: 'discount', amountMinor: 120, mode: 'even' }],
      },
    })
    expect(splits).toEqual({ A: -50, B: 130 }) // a genuinely negative share
    const group = { primaryCurrency: 'USD' as const }
    const expenses = [{ currency: 'USD', fxRate: 1, paidBy: { A: 80 }, splits }]
    const r = pairwiseBalances(group, expenses, [])
    expect(r).toEqual({ B: { A: 130 } })
    expect(netFromPairwise(r)).toEqual(netBalances(group, expenses, []))
  })

  it('multi-payer with a negative adjustment share reconciles exactly to netBalances', () => {
    // A big per-person credit on A pushes A's share negative; two payers fund it.
    const splits = computeExpenseShares({
      amountMinor: 1500,
      splitConfig: { scope: 'simple', baseType: 'equal', participants: ['A', 'B', 'C'], adjustments: { A: -1100 } },
    })
    expect(splits).toEqual({ A: -233, B: 867, C: 866 }) // A is owed back
    const group = { primaryCurrency: 'USD' as const }
    const expenses = [{ currency: 'USD', fxRate: 1, paidBy: { A: 1000, B: 500 }, splits }]
    const r = pairwiseBalances(group, expenses, [])
    expect(r).toEqual({ B: { A: 656 }, C: { A: 577, B: 289 } })
    const net = netBalances(group, expenses, [])
    expect(net).toEqual({ A: 1233, B: -367, C: -866 })
    expect(netFromPairwise(r)).toEqual(net) // exact reconciliation, no residue
  })

  it('property: signed splits never throw and reconcile to netBalances within rounding (randomized)', () => {
    const rnd = rng(0xbada55)
    for (let iter = 0; iter < 600; iter++) {
      const n = 2 + Math.floor(rnd() * 6)
      const ids = Array.from({ length: n }, (_, k) => 'm' + k)
      const amountMinor = 100 + Math.floor(rnd() * 500_000)

      // A large negative credit on m0 guarantees at least one negative share,
      // produced through the real engine (a genuinely reachable ledger row).
      const splits = computeExpenseShares({
        amountMinor,
        splitConfig: { scope: 'simple', baseType: 'equal', participants: ids, adjustments: { m0: -2 * amountMinor } },
      })
      expect(splits.m0).toBeLessThan(0)

      // Random multi-payer paidBy that still sums to amountMinor exactly.
      const payerWeights: Record<string, number> = {}
      for (const id of ids) payerWeights[id] = Math.floor(rnd() * 5)
      if (sum(payerWeights) === 0) payerWeights[ids[0]] = 1
      const paidBy = largestRemainder(amountMinor, payerWeights)

      const group = { primaryCurrency: 'USD' as const }
      const expenses = [{ currency: 'USD', fxRate: 1, paidBy, splits }]

      let r!: ReturnType<typeof pairwiseBalances>
      expect(() => {
        r = pairwiseBalances(group, expenses, [])
      }).not.toThrow()

      // Pairwise reconciles to netBalances up to the documented per-pair
      // largest-remainder rounding (<= 1 unit per pair, so <= n-1 per member).
      const net = netBalances(group, expenses, [])
      const pwNet = netFromPairwise(r)
      for (const id of ids) {
        expect(Math.abs((pwNet[id] ?? 0) - (net[id] ?? 0))).toBeLessThanOrEqual(n - 1)
      }
    }
  })
})

/* ============================================================ §2.10 simplifyDebts */

describe('simplifyDebts (§2.10)', () => {
  it('net {A:+30,B:+10,C:-25,D:-15} -> C->A 25, D->B 10, D->A 5 (n-1 = 3)', () => {
    const payments = simplifyDebts({ A: 3000, B: 1000, C: -2500, D: -1500 })
    expect(payments).toEqual([
      { from: 'C', to: 'A', amount: 2500 },
      { from: 'D', to: 'B', amount: 1000 },
      { from: 'D', to: 'A', amount: 500 },
    ])
    expect(payments.length).toBe(3) // n - 1 for n = 4 members
  })

  it('all-square nets produce no payments', () => {
    expect(simplifyDebts({ A: 0, B: 0 })).toEqual([])
  })

  it('property: payments reconcile each debtor/creditor and are at most n-1', () => {
    const rnd = rng(0xabc123)
    for (let i = 0; i < 500; i++) {
      const n = 2 + Math.floor(rnd() * 8)
      const ids = Array.from({ length: n }, (_, k) => 'm' + k)
      const net: Record<string, number> = {}
      let running = 0
      for (let k = 0; k < n - 1; k++) {
        const v = Math.floor(rnd() * 20000) - 10000
        net[ids[k]] = v
        running += v
      }
      net[ids[n - 1]] = -running // force Σ net = 0
      const payments = simplifyDebts(net)
      expect(payments.length).toBeLessThanOrEqual(n - 1)
      // Apply payments and confirm everyone lands at zero.
      const settled: Record<string, number> = { ...net }
      for (const p of payments) {
        settled[p.from] += p.amount
        settled[p.to] -= p.amount
      }
      for (const id of ids) expect(settled[id]).toBe(0)
    }
  })
})

/* ============================================================ §2.11 reconcileScan */

describe('reconcileScan (§2.11)', () => {
  it('exact match -> ok', () => {
    const r = reconcileScan({
      items: [{ lineTotalMinor: 9600 }],
      taxMinor: 792,
      tipMinor: 1920,
      feesMinor: 384,
      discountMinor: 0,
      printedTotalMinor: 12696,
    })
    expect(r.ok).toBe(true)
    expect(r.computedTotal).toBe(12696)
    expect(r.diffMinor).toBe(0)
    expect(r.requiresReview).toBe(false)
  })

  it('|diff| <= 2 is absorbed as rounding (still not ok), no review', () => {
    const r = reconcileScan({ items: [{ lineTotalMinor: 1000 }], printedTotalMinor: 1002 })
    expect(r.ok).toBe(false)
    expect(r.diffMinor).toBe(2)
    expect(r.absorbAsRounding).toBe(true)
    expect(r.requiresReview).toBe(false)
  })

  it('|diff| > 2 forces review', () => {
    const r = reconcileScan({ items: [{ lineTotalMinor: 1000 }], printedTotalMinor: 1005 })
    expect(r.requiresReview).toBe(true)
    expect(r.absorbAsRounding).toBe(false)
  })

  it('low confidence forces review even when totals match', () => {
    const r = reconcileScan({ items: [{ lineTotalMinor: 1000 }], printedTotalMinor: 1000, confidence: 'low' })
    expect(r.ok).toBe(true)
    expect(r.requiresReview).toBe(true)
  })
})

/* ============================================================ §1.1 currency helpers */

describe('currency helpers (§1.1)', () => {
  it('MINOR_DIGITS / minorDigits / scale cover 2-, 0- and 3-digit currencies', () => {
    expect(MINOR_DIGITS.JPY).toBe(0)
    expect(MINOR_DIGITS.KWD).toBe(3)
    expect(minorDigits('USD')).toBe(2)
    expect(minorDigits('JPY')).toBe(0)
    expect(minorDigits('KWD')).toBe(3)
    expect(minorDigits('ZZZ')).toBe(2) // unknown -> default 2
    expect(scale('USD')).toBe(100)
    expect(scale('JPY')).toBe(1)
    expect(scale('KWD')).toBe(1000)
    expect(scale('ZZZ')).toBe(100)
  })

  it('toMinor / fromMinor round-trip per currency scale', () => {
    expect(toMinor(19.99, 'USD')).toBe(1999)
    expect(fromMinor(1999, 'USD')).toBeCloseTo(19.99)
    expect(toMinor(1500, 'JPY')).toBe(1500) // JPY has no minor unit
    expect(fromMinor(1500, 'JPY')).toBe(1500)
    expect(toMinor(2.5, 'KWD')).toBe(2500) // 3-digit minor unit
    expect(fromMinor(2500, 'KWD')).toBe(2.5)
  })

  it('formatMoney uses each currency precision via Intl (not hardcoded 2)', () => {
    expect(formatMoney(1234, 'USD', 'en-US')).toBe('$12.34')
    const jpy = formatMoney(1500, 'JPY', 'en-US')
    expect(jpy).toContain('1,500')
    expect(jpy).not.toContain('.') // JPY shows no decimals
    expect(formatMoney(2500, 'KWD', 'en-US')).toMatch(/2\.500/) // KWD shows three
  })

  it('formatMoney falls back gracefully for an unknown / non-ISO code', () => {
    const out = formatMoney(1000, 'XBT', 'en-US')
    expect(out).toContain('XBT')
    expect(out).toContain('10.00')
  })
})
