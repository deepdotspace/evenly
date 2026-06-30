/**
 * Settle-up to even (CONTRACT §2.9, §2.10, §3.7, T2).
 *
 * From the SAME starting ledger, BOTH settle modes must drive every balance to
 * zero (the settle-to-even state):
 *   - DIRECT  : record each raw pairwise debt (§2.9) -> net == 0.
 *   - SIMPLIFY: record the minimized plan (§2.10, <= n-1 payments) -> net == 0,
 *               with fewer payments than direct.
 * Asserted against the ground-truth store + the derived engine, plus the UI's
 * "all square" state for the direct group.
 */
import { test, expect } from 'deepspace/testing'
import { actOk, groupRows, whoami, cleanupGroup, tag, sum } from './helpers/evenly'
import { netBalances, pairwiseBalances, simplifyDebts } from '../src/lib/split'

interface ExpenseData {
  paidBy: Record<string, number>
  splits: Record<string, number>
  currency: string
  fxRate: number | null
  deletedAt?: number | null
}
interface SettlementData {
  fromUserId: string
  toUserId: string
  amountMinor: number
  currency: string
  fxRate: number | null
  deletedAt?: number | null
}

/** Seed a 4-member group with a two-creditor / two-debtor net. */
async function seedGroup(page: import('@playwright/test').Page, me: string) {
  const gA = `guest:${crypto.randomUUID()}`
  const gB = `guest:${crypto.randomUUID()}`
  const gC = `guest:${crypto.randomUUID()}`
  const grp = await actOk<{ groupId: string }>(page, 'createGroup', {
    name: tag('settle'),
    primaryCurrency: 'USD',
    guests: [
      { guestId: gA, displayName: 'A' },
      { guestId: gB, displayName: 'B' },
      { guestId: gC, displayName: 'C' },
    ],
  })
  const all = [me, gA, gB, gC]
  // me pays 8000 equally; gA pays 4000 equally -> net {me:+5000,gA:+1000,gB:-3000,gC:-3000}
  await actOk(page, 'addExpense', {
    groupId: grp.groupId,
    draft: {
      description: 'Hotel', currency: 'USD', amountMinor: 8000, category: 'lodging',
      paidBy: { [me]: 8000 },
      splitConfig: { scope: 'simple', baseType: 'equal', participants: all },
    },
  })
  await actOk(page, 'addExpense', {
    groupId: grp.groupId,
    draft: {
      description: 'Van', currency: 'USD', amountMinor: 4000, category: 'transport',
      paidBy: { [gA]: 4000 },
      splitConfig: { scope: 'simple', baseType: 'equal', participants: all },
    },
  })
  return grp.groupId
}

async function liveNet(page: import('@playwright/test').Page, groupId: string) {
  const expenses = (await groupRows<ExpenseData>(page, 'expenses', groupId)).filter((e) => !e.data.deletedAt)
  const settlements = (await groupRows<SettlementData>(page, 'settlements', groupId)).filter((s) => !s.data.deletedAt)
  return netBalances({ primaryCurrency: 'USD' }, expenses.map((e) => e.data), settlements.map((s) => s.data))
}

test('DIRECT pairwise settlements zero the group', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  let groupId: string | undefined
  try {
    groupId = await seedGroup(page, me)
    const net0 = await liveNet(page, groupId)
    expect(sum(net0)).toBe(0)
    expect(Object.values(net0).some((v) => v > 1)).toBeTruthy()

    // Record every raw pairwise debt (debtor -> creditor).
    const expenses = (await groupRows<ExpenseData>(page, 'expenses', groupId)).filter((e) => !e.data.deletedAt)
    const pw = pairwiseBalances({ primaryCurrency: 'USD' }, expenses.map((e) => e.data), [])
    let directPayments = 0
    for (const [from, tos] of Object.entries(pw)) {
      for (const [to, amount] of Object.entries(tos)) {
        if (amount > 0) {
          directPayments++
          await actOk(page, 'recordSettlement', { groupId, fromUserId: from, toUserId: to, amountMinor: amount })
        }
      }
    }

    const netAfter = await liveNet(page, groupId)
    for (const [mid, v] of Object.entries(netAfter)) {
      expect(Math.abs(v), `member ${mid} settled to ~0 (got ${v})`).toBeLessThanOrEqual(1)
    }

    // UI: the group's settle surface shows the all-square state.
    await page.goto(`/app/g/${groupId}/settle`)
    await expect(page.getByText(/all square/i)).toBeVisible({ timeout: 20_000 })

    test.info().annotations.push({ type: 'direct-payments', description: String(directPayments) })
  } finally {
    await cleanupGroup(page, groupId)
  }
})

test('SIMPLIFIED plan zeros the group with fewer payments', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  let groupId: string | undefined
  try {
    groupId = await seedGroup(page, me)
    const net0 = await liveNet(page, groupId)
    expect(sum(net0)).toBe(0)

    const plan = simplifyDebts(net0)
    expect(plan.length).toBeLessThanOrEqual(Object.keys(net0).length - 1)
    for (const p of plan) {
      await actOk(page, 'recordSettlement', { groupId, fromUserId: p.from, toUserId: p.to, amountMinor: p.amount })
    }

    const netAfter = await liveNet(page, groupId)
    for (const [mid, v] of Object.entries(netAfter)) {
      expect(Math.abs(v), `member ${mid} settled to ~0 (got ${v})`).toBeLessThanOrEqual(1)
    }
    // Sanity: this graph simplifies to 3 payments (< 4 direct).
    expect(plan.length).toBe(3)
  } finally {
    await cleanupGroup(page, groupId)
  }
})
