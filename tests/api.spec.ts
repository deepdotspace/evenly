/**
 * Worker API contract: auth proxy, the WS endpoint, and the server-action gate
 * (CONTRACT D5, D8 — actions authorize their own callers; the route gates auth).
 */
import { test, expect } from 'deepspace/testing'
import { actOk, act, getToken, whoami, cleanupGroup, tag } from './helpers/evenly'

test.describe('API tests', () => {
  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  test('WebSocket endpoint exists', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
  })

  test('unauthenticated server action is rejected (401)', async ({ request }) => {
    const res = await request.post('/api/actions/createGroup', {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'nope' },
    })
    expect(res.status()).toBe(401)
  })

  test('unknown server action returns 404 for an authed caller', async ({ users }) => {
    const [u] = await users(1)
    await u.page.goto('/app')
    const token = await getToken(u.page)
    const res = await u.page.request.post('/api/actions/__does_not_exist__', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {},
    })
    expect(res.status()).toBe(404)
  })

  test('a non-member is forbidden from writing to a group (action self-authorization)', async ({ users }) => {
    const [owner, intruder] = await users(2)
    await Promise.all([owner.page.goto('/app'), intruder.page.goto('/app')])
    const intruderId = await whoami(intruder.page)
    let groupId: string | undefined
    try {
      const grp = await actOk<{ groupId: string }>(owner.page, 'createGroup', {
        name: tag('private'),
        primaryCurrency: 'USD',
      })
      groupId = grp.groupId

      // The intruder is authenticated but NOT a member -> the action must refuse.
      const res = await act(intruder.page, 'addExpense', {
        groupId,
        draft: {
          description: 'sneaky', currency: 'USD', amountMinor: 1000, category: 'other',
          paidBy: { [intruderId]: 1000 },
          splitConfig: { scope: 'simple', baseType: 'equal', participants: [intruderId] },
        },
      })
      expect(res.success).toBeFalsy()
      expect(res.error).toMatch(/forbidden|not a group member/i)

      // And admin-only actions reject a non-admin too.
      const del = await act(intruder.page, 'deleteGroupCascade', { groupId })
      expect(del.success).toBeFalsy()
    } finally {
      await cleanupGroup(owner.page, groupId)
    }
  })
})
