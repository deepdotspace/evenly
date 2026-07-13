/**
 * Invite-by-link e2e (shareable link -> claim / join). Real auth, real server
 * actions, ground-truth + RBAC assertions via the debug routes.
 *
 * Proves the load-bearing claims of the feature end to end:
 *   - createInvite mints a token any member can share.
 *   - resolveInvite returns the roster to a NON-member (token-gated) with NO money.
 *   - acceptInvite(claim) rewrites the guest -> the caller across membership + ledger,
 *     and the DO's canRead() flips so the new member now reads the group live.
 *   - Guards: already-a-member is idempotent; a taken slot / garbage selection fail
 *     honestly; join-as-new adds a fresh member.
 *
 * Run:  npx deepspace test tests/invite.spec.ts --port 5193
 */
import { test, expect } from 'deepspace/testing'
import { act, actOk, whoami, records, groupRows, queryAs, cleanupGroup } from './helpers/evenly'

interface RosterSlot {
  guestId: string | null
  displayName: string
  claimable: boolean
  claimed: boolean
}

test('invite link: claim a placeholder inherits its ledger + flips RBAC; guards hold', async ({ users }) => {
  const [a, b] = await users(2)
  // Navigate each page to the app first so the signed-in session cookie is applied
  // before we mint JWTs / call actions (same setup the other 2-user specs use).
  await Promise.all([a.page.goto('/app'), b.page.goto('/app')])
  const aId = await whoami(a.page)
  const bId = await whoami(b.page)
  expect(aId).not.toBe(bId)

  const tag = `__test-${Date.now()}__`
  const guestId = `guest:${Date.now()}-placeholder`
  let groupId: string | undefined
  let group2Id: string | undefined

  try {
    // A creates a group, seeds a guest placeholder, and an expense split A / guest
    // (so the claim rewrite has real ledger to carry).
    groupId = (await actOk<{ groupId: string }>(a.page, 'createGroup', { name: tag, primaryCurrency: 'USD' })).groupId
    await actOk(a.page, 'addGroupMember', { groupId, memberId: guestId, displayName: 'Priya' })
    await actOk(a.page, 'addExpense', {
      groupId,
      draft: {
        description: `${tag} dinner`,
        currency: 'USD',
        amountMinor: 2000,
        category: 'other',
        paidBy: { [aId]: 2000 },
        splitConfig: { scope: 'simple', baseType: 'equal', participants: [aId, guestId] },
      },
    })

    // A mints the invite link.
    const mint = await actOk<{ token: string }>(a.page, 'createInvite', { groupId })
    expect(mint.token).toBeTruthy()
    const token = mint.token

    // Any member re-fetching gets the SAME token (no churn).
    const refetch = await actOk<{ token: string; created: boolean }>(a.page, 'createInvite', { groupId })
    expect(refetch.token).toBe(token)
    expect(refetch.created).toBe(false)

    // resolveInvite as B (a NON-member): roster present, guest claimable, NO money.
    const res = await actOk<{ groupName: string; alreadyMember: boolean; roster: RosterSlot[] }>(b.page, 'resolveInvite', { token })
    expect(res.groupName).toBe(tag)
    expect(res.alreadyMember).toBe(false)
    expect(res.roster.find((s) => s.guestId === guestId)?.claimable).toBe(true)
    expect(res.roster.find((s) => s.displayName === 'Priya')).toBeTruthy()
    expect(JSON.stringify(res)).not.toContain('amountMinor') // no balance/ledger leak

    // BEFORE claim: B is a non-member -> RBAC gives zero of the group's rows.
    expect((await queryAs(b.page, 'groups', bId)).some((r) => r.recordId === groupId)).toBe(false)

    // Guard: a garbage selection is rejected (not a silent join-as-new) while B is
    // still a non-member, and B does not sneak into the group.
    expect((await act(b.page, 'acceptInvite', { token, claim: 'not-a-guest' })).success).toBe(false)
    expect((await queryAs(b.page, 'groups', bId)).some((r) => r.recordId === groupId)).toBe(false)

    // B claims the placeholder.
    await actOk(b.page, 'acceptInvite', { token, claim: guestId })

    // Ground truth: guest rewritten to B across membership + ledger.
    const members = (await groupRows<{ userId?: string; guestId?: string }>(b.page, 'groupMembers', groupId)).map((r) => r.data)
    expect(members.some((m) => m.userId === bId && !m.guestId)).toBe(true)
    expect(members.some((m) => m.guestId === guestId)).toBe(false)

    const grp = (await records<{ memberIds: string[] }>(a.page, 'groups')).find((r) => r.recordId === groupId)
    expect(grp?.data.memberIds).toContain(bId)
    expect(grp?.data.memberIds).not.toContain(guestId)

    const exp = (await groupRows<{ splits: Record<string, number> }>(a.page, 'expenses', groupId))[0].data
    expect(Object.keys(exp.splits)).toContain(bId)
    expect(Object.keys(exp.splits)).not.toContain(guestId)

    expect((await groupRows<{ type: string }>(a.page, 'activity', groupId)).some((r) => r.data.type === 'member.added')).toBe(true)

    // RBAC flipped: B now reads the group + the expense.
    expect((await queryAs(b.page, 'groups', bId)).some((r) => r.recordId === groupId)).toBe(true)
    expect((await queryAs(b.page, 'expenses', bId)).length).toBeGreaterThan(0)

    // Idempotent: B claiming again -> alreadyMember (no dup, no error).
    const again = await actOk<{ alreadyMember?: boolean }>(b.page, 'acceptInvite', { token, claim: guestId })
    expect(again.alreadyMember).toBe(true)

    // Join-as-new: in a SECOND group B has no placeholder, so B joins fresh and lands
    // in memberIds with its own groupMembers row.
    group2Id = (await actOk<{ groupId: string }>(a.page, 'createGroup', { name: `${tag} two`, primaryCurrency: 'USD' })).groupId
    const mint2 = await actOk<{ token: string }>(a.page, 'createInvite', { groupId: group2Id })
    await actOk(b.page, 'acceptInvite', { token: mint2.token, claim: 'new' })
    const grp2 = (await records<{ memberIds: string[] }>(a.page, 'groups')).find((r) => r.recordId === group2Id)
    expect(grp2?.data.memberIds).toContain(bId)
    expect((await groupRows<{ userId?: string }>(a.page, 'groupMembers', group2Id)).some((r) => r.data.userId === bId)).toBe(true)
  } finally {
    await cleanupGroup(a.page, groupId)
    await cleanupGroup(a.page, group2Id)
  }
})

test('createInvite/resolveInvite/acceptInvite reject unauthenticated callers', async ({ request }) => {
  for (const name of ['createInvite', 'resolveInvite', 'acceptInvite']) {
    const res = await request.post(`/api/actions/${name}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { token: 'x', groupId: 'x' },
    })
    expect(res.status(), `${name} must require auth`).toBe(401)
  }
})
