/**
 * Breadth coverage (CONTRACT §3.8-§3.14, §4, §7): friends 1:1, activity feed,
 * insights, profile re-stamp, group-settings settle-then-remove, CSV import +
 * dedupe, and recurring run-now idempotency. Each test seeds through real server
 * actions, asserts the ground-truth store + the engine, plus a real-content UI
 * check, and cleans up its own group.
 */
import { test, expect } from 'deepspace/testing'
import { actOk, act, groupRows, records, whoami, cleanupGroup, tag, sum } from './helpers/evenly'

/** Spend total = Σ non-deleted expense amounts (settlements are NOT expenses). */
function spendTotal(expenses: { amountMinor: number }[]): number {
  return expenses.reduce((a, e) => a + e.amountMinor, 0)
}

interface ExpenseData {
  description: string; category: string; amountMinor: number
  paidBy: Record<string, number>; splits: Record<string, number>
  currency: string; fxRate: number | null; deletedAt?: number | null; recurringId?: string | null
}

test('friends 1:1 — a pair ledger shows the friend and the balance', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  const friend = `guest:${crypto.randomUUID()}`
  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', {
      name: tag('Riya & me'),
      kind: 'pair',
      primaryCurrency: 'USD',
      guests: [{ guestId: friend, displayName: 'Riya' }],
    })
    groupId = grp.groupId
    await actOk(page, 'addExpense', {
      groupId,
      draft: {
        description: 'Coffee', currency: 'USD', amountMinor: 1000, category: 'food',
        paidBy: { [me]: 1000 },
        splitConfig: { scope: 'simple', baseType: 'equal', participants: [me, friend] },
      },
    })

    // store: it really is a pair group.
    const grpRow = (await records<{ kind: string }>(page, 'groups')).find((g) => g.recordId === groupId)
    expect(grpRow?.data.kind).toBe('pair')

    // UI: the friends surface lists Riya and that she owes you.
    await page.goto('/app/friends')
    await expect(page.getByText('Riya')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/owes you/i).first()).toBeVisible()
  } finally {
    await cleanupGroup(page, groupId)
  }
})

test('activity feed records create events', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', { name: tag('activity'), primaryCurrency: 'USD' })
    groupId = grp.groupId
    const desc = `${tag('Lunch')}`
    await actOk(page, 'addExpense', {
      groupId,
      draft: {
        description: desc, currency: 'USD', amountMinor: 2000, category: 'food',
        paidBy: { [me]: 2000 }, splitConfig: { scope: 'simple', baseType: 'equal', participants: [me] },
      },
    })

    // store: group.created + expense.created activity rows exist.
    const acts = await groupRows<{ type: string }>(page, 'activity', groupId)
    const types = acts.map((a) => a.data.type)
    expect(types).toContain('group.created')
    expect(types).toContain('expense.created')

    // UI: the all-groups activity feed renders an event.
    await page.goto('/app/activity')
    await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Activity').first()).toBeVisible()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 20_000 })
  } finally {
    await cleanupGroup(page, groupId)
  }
})

test('insights numbers match the ledger (settlements excluded)', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  const gA = `guest:${crypto.randomUUID()}`
  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', {
      name: tag('insights'), primaryCurrency: 'USD',
      guests: [{ guestId: gA, displayName: 'Pat' }],
    })
    groupId = grp.groupId
    for (const [desc, amt, cat] of [['Hotel', 5000, 'lodging'], ['Dinner', 7000, 'dining'], ['Cab', 3000, 'transport']] as const) {
      await actOk(page, 'addExpense', {
        groupId,
        draft: { description: desc, currency: 'USD', amountMinor: amt, category: cat, paidBy: { [me]: amt }, splitConfig: { scope: 'simple', baseType: 'equal', participants: [me, gA] } },
      })
    }
    // a settlement must NOT count toward spend.
    await actOk(page, 'recordSettlement', { groupId, fromUserId: gA, toUserId: me, amountMinor: 1000 })

    const expenses = (await groupRows<ExpenseData>(page, 'expenses', groupId)).filter((e) => !e.data.deletedAt)
    expect(spendTotal(expenses.map((e) => e.data))).toBe(15000)

    // UI: insights renders the $150.00 total.
    await page.goto(`/app/g/${groupId}/insights`)
    await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/150\.00/).first()).toBeVisible({ timeout: 20_000 })
  } finally {
    await cleanupGroup(page, groupId)
  }
})

test('profile update re-stamps the display name onto group member rows', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  let groupId: string | undefined
  let original = 'You'
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', { name: tag('restamp'), primaryCurrency: 'USD' })
    groupId = grp.groupId
    const mine0 = (await groupRows<{ userId?: string; displayName: string }>(page, 'groupMembers', groupId)).find((m) => m.data.userId === me)
    original = mine0?.data.displayName ?? 'You'

    const newName = `Stamp ${Date.now().toString().slice(-5)}`
    const res = await actOk<{ restamped: number }>(page, 'updateProfile', { displayName: newName })
    expect(res.restamped).toBeGreaterThanOrEqual(1)

    const mine = (await groupRows<{ userId?: string; displayName: string }>(page, 'groupMembers', groupId)).find((m) => m.data.userId === me)
    expect(mine?.data.displayName, 'member row re-stamped').toBe(newName)
  } finally {
    // restore the account's original display name.
    if (original) await act(page, 'updateProfile', { displayName: original })
    await cleanupGroup(page, groupId)
  }
})

test('group settings: settle-then-remove a member with a balance', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  const gA = `guest:${crypto.randomUUID()}`
  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', {
      name: tag('remove'), primaryCurrency: 'USD', guests: [{ guestId: gA, displayName: 'Leaver' }],
    })
    groupId = grp.groupId
    await actOk(page, 'addExpense', {
      groupId,
      draft: { description: 'Tab', currency: 'USD', amountMinor: 1000, category: 'food', paidBy: { [me]: 1000 }, splitConfig: { scope: 'simple', baseType: 'equal', participants: [me, gA] } },
    })

    // remove is BLOCKED while the member has a nonzero balance.
    const blocked = await act(page, 'removeMember', { groupId, memberId: gA, mode: 'remove' })
    expect(blocked.success).toBeFalsy()
    expect(blocked.error).toMatch(/nonzero balance|settle/i)

    // settle, then remove succeeds.
    await actOk(page, 'recordSettlement', { groupId, fromUserId: gA, toUserId: me, amountMinor: 500 })
    const removed = await actOk<{ status: string }>(page, 'removeMember', { groupId, memberId: gA, mode: 'remove' })
    expect(removed.status).toBe('removed')

    const row = (await groupRows<{ guestId?: string; status: string }>(page, 'groupMembers', groupId)).find((m) => m.data.guestId === gA)
    expect(row?.data.status).toBe('removed')
  } finally {
    await cleanupGroup(page, groupId)
  }
})

test('CSV import creates rows and dedupes on re-import', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  const gA = `guest:${crypto.randomUUID()}`
  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', {
      name: tag('import'), primaryCurrency: 'USD', guests: [{ guestId: gA, displayName: 'Imp' }],
    })
    groupId = grp.groupId
    const dateMs = new Date(2026, 0, 15, 12, 0, 0).getTime()
    const rows = [
      { description: 'Groceries', category: 'groceries', currency: 'USD', amountMinor: 5000, dateMs, nets: { [me]: 2500, [gA]: -2500 } },
      { description: 'Movie', category: 'entertainment', currency: 'USD', amountMinor: 3000, dateMs, nets: { [me]: 1500, [gA]: -1500 } },
    ]

    const first = await actOk<{ imported: number; skippedDuplicates: number }>(page, 'importExpenses', { groupId, rows })
    expect(first.imported).toBe(2)
    expect(first.skippedDuplicates).toBe(0)

    // re-import the SAME rows -> all skipped as duplicates (idempotent).
    const second = await actOk<{ imported: number; skippedDuplicates: number }>(page, 'importExpenses', { groupId, rows })
    expect(second.imported).toBe(0)
    expect(second.skippedDuplicates).toBe(2)

    // store: exactly two expenses (no double-import).
    const expenses = (await groupRows<ExpenseData>(page, 'expenses', groupId)).filter((e) => !e.data.deletedAt)
    expect(expenses.length).toBe(2)
    for (const e of expenses) expect(sum(e.data.splits)).toBe(e.data.amountMinor)
  } finally {
    await cleanupGroup(page, groupId)
  }
})

test('recurring run-now materializes once and is idempotent same-day', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  const gA = `guest:${crypto.randomUUID()}`
  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', {
      name: tag('recurring'), primaryCurrency: 'USD', guests: [{ guestId: gA, displayName: 'Flat' }],
    })
    groupId = grp.groupId
    const rec = await actOk<{ recurringId: string }>(page, 'createRecurring', {
      groupId,
      template: {
        description: 'Rent', category: 'lodging', currency: 'USD', amountMinor: 2000,
        paidBy: { [me]: 2000 },
        splitConfig: { scope: 'simple', baseType: 'equal', participants: [me, gA] },
      },
      cadence: { unit: 'month', interval: 1 },
      nextRunAtMs: Date.now(),
    })

    const run1 = await actOk<{ created: boolean }>(page, 'runRecurringNow', { recurringId: rec.recurringId })
    expect(run1.created).toBe(true)

    const run2 = await actOk<{ created: boolean }>(page, 'runRecurringNow', { recurringId: rec.recurringId })
    expect(run2.created, 'same-day re-run is idempotent').toBe(false)

    // store: exactly one materialized expense carries the recurringId.
    const materialized = (await groupRows<ExpenseData>(page, 'expenses', groupId)).filter(
      (e) => e.data.recurringId === rec.recurringId && !e.data.deletedAt,
    )
    expect(materialized.length).toBe(1)
    expect(sum(materialized[0].data.splits)).toBe(2000)
  } finally {
    await cleanupGroup(page, groupId)
  }
})
