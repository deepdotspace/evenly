/**
 * Write-boundary spec (CONTRACT D5 / D8 — the write model).
 *
 * The existing membership-boundary spec proves READ isolation. This one proves the
 * WRITE lock: every group-scoped collection is `create:false / update:false /
 * delete:false` for the connecting client role, so a signed-in member CANNOT write
 * those rows directly over the WebSocket — the careful, validated, audited server
 * actions (which set `X-App-Action` and so `skipUserRbac` in the DO) are the ONLY
 * write path. This is what makes the D8 admin gate, the Σ-conservation invariant,
 * and the append-only audit trail enforceable rather than advisory.
 *
 * Two halves:
 *   1. A direct client `createConfirmed('groups', …)` (the dev harness's raw
 *      useMutations — exactly the path a crafted WS client / the AI assistant would
 *      take) is REJECTED by the DO and lands no row.
 *   2. The same write through the `createGroup` server action SUCCEEDS.
 *
 * Run:  npx deepspace test tests/write-boundary.spec.ts --port 5189
 */
import { test, expect } from 'deepspace/testing'
import { actOk, records, cleanupGroup, tag } from './helpers/evenly'

test('client cannot write a locked collection directly; the server action can', async ({ users }) => {
  const [u] = await users(1)
  const label = tag('write-lock')
  let groupId: string | undefined

  try {
    await u.page.goto('/dev-spike')
    await expect(u.page.getByTestId('spike-groups-status')).toHaveText('ready', { timeout: 20_000 })

    // 1) DIRECT CLIENT WRITE — rejected. The dev harness mounts the real
    //    useMutations<'groups'>; create:false makes the DO deny it, so the
    //    createConfirmed promise rejects and spike-my-group-id never populates.
    const clientName = `${label} client-direct`
    await u.page.getByTestId('spike-name-input').fill(clientName)
    await u.page.getByTestId('spike-create-group').click()
    await u.page.waitForTimeout(3_000)
    await expect(u.page.getByTestId('spike-my-group-id')).toHaveText('')

    // Ground truth: no group row with that name was ever written.
    const afterClient = await records<{ name?: string }>(u.page, 'groups')
    expect(afterClient.some((g) => g.data.name === clientName)).toBeFalsy()

    // 2) SERVER ACTION — succeeds. Same logical write, through the validated path.
    const actionName = `${label} via-action`
    const created = await actOk<{ groupId: string }>(u.page, 'createGroup', {
      name: actionName,
      primaryCurrency: 'USD',
    })
    groupId = created.groupId
    expect(groupId).toBeTruthy()

    const afterAction = await records<{ name?: string }>(u.page, 'groups')
    expect(afterAction.some((g) => g.recordId === groupId && g.data.name === actionName)).toBeTruthy()
  } finally {
    await cleanupGroup(u.page, groupId)
  }
})
