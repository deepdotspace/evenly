/**
 * Console gate: 0 app-origin console/page errors on each route, with REAL data
 * present (a seeded group + expense), so detail/edit/insights/settle routes render
 * content rather than an empty state. Catches the "builds, but throws on load"
 * class of regression across every surface.
 */
import { test, expect } from 'deepspace/testing'
import { actOk, whoami, cleanupGroup, tag, captureAppErrors } from './helpers/evenly'

test('every route renders with zero app-origin console errors', async ({ users }) => {
  test.setTimeout(120_000)
  const [u] = await users(1)
  const page = u.page
  const errors = captureAppErrors(page)

  await page.goto('/app')
  const me = await whoami(page)
  const gA = `guest:${crypto.randomUUID()}`
  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', {
      name: tag('routes'), primaryCurrency: 'USD', guests: [{ guestId: gA, displayName: 'Co' }],
    })
    groupId = grp.groupId
    const exp = await actOk<{ expenseId: string }>(page, 'addExpense', {
      groupId,
      draft: {
        description: 'Routed dinner', currency: 'USD', amountMinor: 4200, category: 'dining',
        paidBy: { [me]: 4200 },
        splitConfig: { scope: 'simple', baseType: 'equal', participants: [me, gA] },
      },
    })

    const g = `/app/g/${groupId}`
    const routes: string[] = [
      '/',
      '/app',
      '/app/friends',
      '/app/activity',
      '/app/import',
      '/app/settings',
      g,
      `${g}/expense/new`,
      `${g}/expense/${exp.expenseId}`,
      `${g}/expense/${exp.expenseId}/edit`,
      `${g}/settle`,
      `${g}/insights`,
      `${g}/recurring`,
      `${g}/settings`,
      `${g}/scan`,
    ]

    const failures: string[] = []
    for (const route of routes) {
      const before = errors.length
      await page.goto(route)
      await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 20_000 })
      await page.waitForTimeout(700) // let async data + effects settle
      const fresh = errors.slice(before)
      if (fresh.length) failures.push(`${route} -> ${fresh.join(' ; ')}`)
    }

    expect(failures, `routes with app-origin console errors:\n${failures.join('\n')}`).toEqual([])
  } finally {
    await cleanupGroup(page, groupId)
  }
})
