/**
 * Core ledger correctness (CONTRACT §2, §3.4, §3.5, D2, D3).
 *
 * For EACH split type (equal / exact / percent / shares / by-item / treat) we add a
 * real expense through the `addExpense` server action and assert:
 *   1. the server-resolved `splits` EXACTLY equal the pure engine's output,
 *   2. Σ splits === amountMinor (the conservation invariant, asserted server-side too),
 *   3. the row lands in the ground-truth record store with those splits,
 *   4. derived `netBalances` over the whole group conserves (Σ ≈ 0) and the payer's
 *      net equals paid − owed,
 *   5. the group-detail UI renders the balances (not a screenshot — real DOM text).
 *
 * Seeded with three stable member identities (the signed-in creator + two guests),
 * so the split vectors are deterministic and reproducible.
 */
import { test, expect } from 'deepspace/testing'
import {
  actOk,
  groupRows,
  whoami,
  cleanupGroup,
  tag,
  sum,
  type Envelope,
} from './helpers/evenly'
import { computeExpenseShares, netBalances, type SplitConfig } from '../src/lib/split'

interface ExpenseData {
  groupId: string
  description: string
  amountMinor: number
  currency: string
  fxRate: number | null
  paidBy: Record<string, number>
  splits: Record<string, number>
  deletedAt?: number | null
}

test('every split type resolves exactly, lands in the store, and balances conserve', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  const gA = `guest:${crypto.randomUUID()}`
  const gB = `guest:${crypto.randomUUID()}`

  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string; memberIds: string[] }>(page, 'createGroup', {
      name: tag('ledger'),
      kind: 'group',
      primaryCurrency: 'USD',
      guests: [
        { guestId: gA, displayName: 'Guest A' },
        { guestId: gB, displayName: 'Guest B' },
      ],
    })
    groupId = grp.groupId
    expect(grp.memberIds).toContain(me)
    expect(grp.memberIds).toEqual([me, gA, gB])

    // One case per split type: {label, amountMinor, paidBy, splitConfig, receipt?}.
    const cases: Array<{
      label: string
      amountMinor: number
      paidBy: Record<string, number>
      splitConfig: SplitConfig
      receipt?: { items: { id: string; lineTotalMinor: number }[]; claims: Record<string, string[]> }
    }> = [
      {
        label: 'equal',
        amountMinor: 1000,
        paidBy: { [me]: 1000 },
        splitConfig: { scope: 'simple', baseType: 'equal', participants: [me, gA, gB] },
      },
      {
        label: 'exact',
        amountMinor: 4000,
        paidBy: { [me]: 4000 },
        splitConfig: {
          scope: 'simple',
          baseType: 'exact',
          participants: [me, gA, gB],
          exactAmounts: { [me]: 2000, [gA]: 1500, [gB]: 500 },
        },
      },
      {
        label: 'percent',
        amountMinor: 10000,
        paidBy: { [me]: 10000 },
        splitConfig: {
          scope: 'simple',
          baseType: 'percent',
          participants: [me, gA, gB],
          percents: { [me]: 50, [gA]: 30, [gB]: 20 },
        },
      },
      {
        label: 'shares',
        amountMinor: 10000,
        paidBy: { [me]: 10000 },
        splitConfig: {
          scope: 'simple',
          baseType: 'shares',
          participants: [me, gA, gB],
          weights: { [me]: 1, [gA]: 2, [gB]: 4 },
        },
      },
      {
        label: 'treat',
        amountMinor: 3000,
        paidBy: { [me]: 3000 },
        splitConfig: {
          scope: 'simple',
          baseType: 'treat',
          participants: [gA, gB],
          payerIsParticipant: false,
        },
      },
      {
        // by-item — the §2.6 itemized vector (fries unclaimed -> even; tax + tip).
        label: 'by-item',
        amountMinor: 5504,
        paidBy: { [me]: 5504 },
        splitConfig: {
          scope: 'itemized',
          baseType: 'equal',
          participants: [me, gA, gB],
          unclaimedPolicy: 'even',
          overheads: [
            { kind: 'tax', amountMinor: 430 },
            { kind: 'tip', amountMinor: 774 },
          ],
        },
        receipt: {
          items: [
            { id: 'nachos', lineTotalMinor: 1200 },
            { id: 'burger', lineTotalMinor: 1500 },
            { id: 'salad', lineTotalMinor: 1000 },
            { id: 'fries', lineTotalMinor: 600 },
          ],
          claims: { nachos: [me, gA, gB], burger: [me], salad: [gA] },
        },
      },
    ]

    const expectedNet: Record<string, number> = { [me]: 0, [gA]: 0, [gB]: 0 }

    for (const c of cases) {
      // Independent engine truth.
      const engineSplits = computeExpenseShares({
        amountMinor: c.amountMinor,
        splitConfig: c.splitConfig,
        payerId: me,
        receipt: c.receipt,
      })
      expect(sum(engineSplits), `${c.label}: engine Σ`).toBe(c.amountMinor)

      const res = await actOk<{ expenseId: string; splits: Record<string, number> }>(page, 'addExpense', {
        groupId,
        draft: {
          description: `${c.label} case`,
          category: 'food',
          currency: 'USD',
          amountMinor: c.amountMinor,
          paidBy: c.paidBy,
          splitConfig: c.splitConfig,
          ...(c.receipt ? { receipt: c.receipt } : {}),
        },
      })

      // 1. server-resolved splits === engine output, exactly.
      expect(res.splits, `${c.label}: server splits == engine`).toEqual(engineSplits)

      // tally expected net (paid - owed per member)
      for (const [mid, owed] of Object.entries(engineSplits)) expectedNet[mid] -= owed
      for (const [mid, paid] of Object.entries(c.paidBy)) expectedNet[mid] += paid
    }

    // 3. all six rows in the ground-truth store with conserving splits.
    const stored = (await groupRows<ExpenseData>(page, 'expenses', groupId)).filter(
      (e) => !e.data.deletedAt,
    )
    expect(stored.length, 'six expenses stored').toBe(cases.length)
    for (const e of stored) {
      expect(sum(e.data.splits), `stored Σ splits == amount (${e.data.description})`).toBe(
        e.data.amountMinor,
      )
      expect(sum(e.data.paidBy)).toBe(e.data.amountMinor)
    }

    // 4. derived balances conserve and match the per-member tally.
    const net = netBalances(
      { primaryCurrency: 'USD' },
      stored.map((e) => e.data),
      [],
    )
    expect(sum(net), 'Σ net == 0 (conservation)').toBe(0)
    expect(net).toEqual(expectedNet)
    expect(net[me], 'payer is owed').toBeGreaterThan(0)

    // 5. the UI renders real balance content for this group.
    await page.goto(`/app/g/${groupId}`)
    await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Where everyone stands')).toBeVisible({ timeout: 20_000 })
    // payer is owed -> a "you are owed" affordance is present somewhere on the page
    await expect(page.getByText(/owed/i).first()).toBeVisible({ timeout: 20_000 })
  } finally {
    await cleanupGroup(page, groupId)
  }
})
