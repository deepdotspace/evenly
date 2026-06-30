/**
 * Membership-boundary spike (CONTRACT D1 / R4 — the #1 correctness bet).
 *
 * Proves, over the LIVE WebSocket against two distinct signed-in identities, that:
 *   1. A non-member receives ZERO of a group's rows (groups + expenses).
 *   2. Adding them as a member (via the addGroupMember server action) flips it —
 *      the rows are pushed to them in real time.
 *
 * Seeding goes through the validated SERVER ACTIONS (createGroup / addExpense /
 * addGroupMember / deleteGroupCascade), not client writes — the group-scoped
 * collections are now write-locked at the schema layer (see write-boundary.spec.ts),
 * so the only way to write them is the action path. We still drive the dev-only
 * /dev-spike harness purely to OBSERVE the live useQuery lists, so the DO's
 * server-side canRead() filter is exercised exactly as in production.
 *
 * Run:  npx deepspace test tests/membership-boundary.spec.ts --port 5188
 */
import { test, expect } from 'deepspace/testing'
import { actOk, whoami, cleanupGroup } from './helpers/evenly'

test('non-member gets zero group rows over the socket; adding them flips it live', async ({ users }) => {
  const [a, b] = await users(2)
  const tag = `__test-${Date.now()}__`
  const expenseDesc = `${tag} expense`
  let groupId: string | undefined

  await Promise.all([a.page.goto('/dev-spike'), b.page.goto('/dev-spike')])

  // Both stores connect.
  await expect(a.page.getByTestId('spike-groups-status')).toHaveText('ready', { timeout: 20_000 })
  await expect(b.page.getByTestId('spike-groups-status')).toHaveText('ready', { timeout: 20_000 })

  const aId = await whoami(a.page)
  const bId = await whoami(b.page)
  expect(aId).toBeTruthy()
  expect(bId).toBeTruthy()
  expect(aId).not.toBe(bId)

  try {
    // A creates a group (members = [A]) + an expense in it, via the server actions
    // (A is the creator → admin, so D8-gated actions accept A).
    const created = await actOk<{ groupId: string }>(a.page, 'createGroup', {
      name: tag,
      primaryCurrency: 'USD',
    })
    groupId = created.groupId
    await actOk(a.page, 'addExpense', {
      groupId,
      draft: {
        description: expenseDesc,
        currency: 'USD',
        amountMinor: 1000,
        category: 'other',
        paidBy: { [aId]: 1000 },
        splitConfig: { scope: 'simple', baseType: 'equal', participants: [aId] },
      },
    })

    // A sees its own rows arrive live over the WebSocket.
    await expect(a.page.locator(`[data-testid="spike-group"][data-name="${tag}"]`)).toHaveCount(1, { timeout: 20_000 })
    await expect(a.page.locator(`[data-testid="spike-expense"][data-desc="${expenseDesc}"]`)).toHaveCount(1, { timeout: 20_000 })

    // BOUNDARY: B (non-member) must receive ZERO of these rows. Give realtime a
    // generous window to (not) deliver, then assert absence still holds.
    await b.page.waitForTimeout(4_000)
    await expect(b.page.locator(`[data-testid="spike-group"][data-name="${tag}"]`)).toHaveCount(0)
    await expect(b.page.locator(`[data-testid="spike-expense"][data-desc="${expenseDesc}"]`)).toHaveCount(0)

    // FLIP: A adds B as a member via the validated server action (D5, D8).
    await actOk(a.page, 'addGroupMember', { groupId, memberId: bId, displayName: 'Member B' })

    // B now receives the group + expense live over the WebSocket.
    await expect(b.page.locator(`[data-testid="spike-group"][data-name="${tag}"]`)).toHaveCount(1, { timeout: 20_000 })
    await expect(b.page.locator(`[data-testid="spike-expense"][data-desc="${expenseDesc}"]`)).toHaveCount(1, { timeout: 20_000 })
  } finally {
    // TEARDOWN: A cascade-deletes the group (no test data left in the dev DB).
    await cleanupGroup(a.page, groupId)
  }
})
