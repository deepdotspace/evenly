/**
 * Two-user realtime race (CONTRACT §4 "concurrent edits", D1, D2).
 *
 * Two distinct signed-in identities in the SAME group fire near-simultaneous
 * expense adds. We assert — against the STORE, not a screenshot — that:
 *   1. every row lands in the ground-truth store (no lost write),
 *   2. BOTH users' RBAC socket view returns ALL rows (live membership boundary),
 *   3. BOTH users' CLIENT stores render every row live (the rendered feed),
 *   4. derived balances converge and conserve (Σ net == 0) to the exact figures.
 */
import { test, expect } from 'deepspace/testing'
import { actOk, act, groupRows, queryAs, whoami, cleanupGroup, tag, sum } from './helpers/evenly'
import { netBalances } from '../src/lib/split'

interface ExpenseData {
  description: string
  paidBy: Record<string, number>
  splits: Record<string, number>
  currency: string
  fxRate: number | null
  deletedAt?: number | null
}

test('two users adding expenses concurrently: all rows sync live, balances converge', async ({ users }) => {
  const [A, B] = await users(2)
  await Promise.all([A.page.goto('/app'), B.page.goto('/app')])
  const aId = await whoami(A.page)
  const bId = await whoami(B.page)
  expect(aId).not.toBe(bId)

  const run = tag('race')
  let groupId: string | undefined
  try {
    // A creates the group and adds B as a member (before any expenses).
    const grp = await actOk<{ groupId: string }>(A.page, 'createGroup', { name: run, primaryCurrency: 'USD' })
    groupId = grp.groupId
    await actOk(A.page, 'addGroupMember', { groupId, memberId: bId, displayName: B.name ?? 'User B' })

    // Both open the group detail so their live record stores subscribe.
    await Promise.all([A.page.goto(`/app/g/${groupId}`), B.page.goto(`/app/g/${groupId}`)])
    await expect(A.page.getByText('Where everyone stands')).toBeVisible({ timeout: 20_000 })
    await expect(B.page.getByText('Where everyone stands')).toBeVisible({ timeout: 20_000 })

    const mkDraft = (payer: string, amount: number, n: number) => ({
      groupId,
      draft: {
        description: `${run} ${payer === aId ? 'A' : 'B'}${n}`,
        currency: 'USD',
        amountMinor: amount,
        category: 'food',
        paidBy: { [payer]: amount },
        splitConfig: { scope: 'simple' as const, baseType: 'equal' as const, participants: [aId, bId] },
      },
    })

    // THE RACE: A adds 3 (×1000), B adds 3 (×600), all fired together.
    const adds = [
      act(A.page, 'addExpense', mkDraft(aId, 1000, 1)),
      act(A.page, 'addExpense', mkDraft(aId, 1000, 2)),
      act(A.page, 'addExpense', mkDraft(aId, 1000, 3)),
      act(B.page, 'addExpense', mkDraft(bId, 600, 1)),
      act(B.page, 'addExpense', mkDraft(bId, 600, 2)),
      act(B.page, 'addExpense', mkDraft(bId, 600, 3)),
    ]
    const results = await Promise.all(adds)
    for (const r of results) expect(r.success, `add failed: ${r.error}`).toBeTruthy()

    // 1. ground truth: all six rows landed, each conserving.
    const stored = (await groupRows<ExpenseData>(A.page, 'expenses', groupId)).filter(
      (e) => e.data.description.startsWith(run) && !e.data.deletedAt,
    )
    expect(stored.length, 'all six writes landed').toBe(6)
    for (const e of stored) expect(sum(e.data.splits)).toBe(sum(e.data.paidBy))

    // 2. RBAC socket view: each user sees ALL six (membership boundary holds live).
    const seenByA = (await queryAs<ExpenseData>(A.page, 'expenses', aId)).filter((e) =>
      e.data.description?.startsWith(run),
    )
    const seenByB = (await queryAs<ExpenseData>(B.page, 'expenses', bId)).filter((e) =>
      e.data.description?.startsWith(run),
    )
    expect(seenByA.length, 'A sees all six over the socket').toBe(6)
    expect(seenByB.length, 'B sees all six over the socket').toBe(6)

    // 3. CLIENT stores render every row live, on BOTH pages.
    for (const n of [1, 2, 3]) {
      await expect(A.page.getByText(`${run} A${n}`)).toBeVisible({ timeout: 20_000 })
      await expect(A.page.getByText(`${run} B${n}`)).toBeVisible({ timeout: 20_000 })
      await expect(B.page.getByText(`${run} A${n}`)).toBeVisible({ timeout: 20_000 })
      await expect(B.page.getByText(`${run} B${n}`)).toBeVisible({ timeout: 20_000 })
    }

    // 4. balances converge + conserve, to the exact figures.
    const net = netBalances({ primaryCurrency: 'USD' }, stored.map((e) => e.data), [])
    expect(sum(net), 'Σ net == 0 (conservation under concurrency)').toBe(0)
    // A paid 3000, owes 3*500 + 3*300 = 2400 -> +600 ; B is the mirror.
    expect(net[aId]).toBe(600)
    expect(net[bId]).toBe(-600)
  } finally {
    await cleanupGroup(A.page, groupId)
  }
})
