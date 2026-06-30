/**
 * Membership + contact actions (CONTRACT §1.4, §1.6, §4, §7 A5, D5, D8).
 *
 *  - removeMember: admin-gated. Hard-remove is BLOCKED while the member's net != 0
 *    (settle first, A5); they may instead be marked `inactive` (kept in the ledger,
 *    can't be added to new expenses).
 *  - claimGuest: rewrite a `guest:<uuid>` to the caller's real userId across the
 *    group (idempotent). Inline for small groups; a `claim-guest` Job for large.
 *  - addContact: query-then-upsert the caller's address-book row (footgun #7).
 */

import type { ActionHandler } from 'deepspace/worker'
import { enqueueJob } from 'deepspace/worker'
import type { Env } from '../../worker'
import { netBalances } from '../lib/split'
import type { ContactData, ExpenseData, GroupMemberData, SettlementData, UserProfileData } from '../lib/data/types'
import {
  fail,
  isAdmin,
  LARGE_GROUP_ROW_THRESHOLD,
  loadGroup,
  loadRecord,
  logActivity,
  ok,
  queryAll,
} from './helpers'
import { estimateGroupRowCount, runClaimGuest, type ClaimIdentity } from './claim'

/** Net within this many minor units counts as settled (absorbs FX residue, T3). */
const SETTLED_TOLERANCE = 1

export const removeMember: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const groupId = params.groupId as string
  const memberId = params.memberId as string
  const mode = ((params.mode as string) ?? 'remove') as 'remove' | 'inactive'
  if (!groupId || !memberId) return fail('groupId and memberId are required')

  const g = await loadGroup(tools, groupId)
  if (!g.ok) return fail(g.error)
  if (!isAdmin(g.record, userId)) return fail('Forbidden: admin only')

  const members = await queryAll<GroupMemberData>(tools, 'groupMembers', { groupId })
  const row = members.find((m) => m.data.userId === memberId || m.data.guestId === memberId)
  if (!row) return fail('member not found in this group')

  if (mode === 'inactive') {
    await tools.update('groupMembers', row.recordId, { status: 'inactive', leftAtMs: Date.now() })
    await logActivity(tools, {
      groupId,
      memberIds: g.record.data.memberIds,
      type: 'member.left',
      actorId: userId,
      targetId: row.recordId,
      payload: { summary: `${row.data.displayName} marked inactive` },
    })
    return ok({ memberId, status: 'inactive' })
  }

  // Hard remove: only allowed when the member is square (A5). queryAll so the
  // balance gate sees the WHOLE ledger, not a slice.
  const expenses = await queryAll<ExpenseData>(tools, 'expenses', { groupId })
  const settlements = await queryAll<SettlementData>(tools, 'settlements', { groupId })
  const net = netBalances(
    { primaryCurrency: g.record.data.primaryCurrency },
    expenses.map((e) => e.data),
    settlements.map((s) => s.data),
  )
  const memberNet = net[memberId] ?? 0
  if (Math.abs(memberNet) > SETTLED_TOLERANCE) {
    return fail(`Cannot remove a member with a nonzero balance (${memberNet}); settle first or mark inactive`)
  }

  await tools.update('groupMembers', row.recordId, { status: 'removed', leftAtMs: Date.now() })
  await logActivity(tools, {
    groupId,
    memberIds: g.record.data.memberIds,
    type: 'member.removed',
    actorId: userId,
    targetId: row.recordId,
    payload: { summary: `${row.data.displayName} removed` },
  })
  return ok({ memberId, status: 'removed' })
}

export const claimGuest: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const groupId = params.groupId as string
  const guestId = params.guestId as string
  if (!groupId || !guestId) return fail('groupId and guestId are required')
  if (!guestId.startsWith('guest:')) return fail('guestId must be a guest identity')

  const g = await loadGroup(tools, groupId)
  if (!g.ok) return fail(g.error)

  // Idempotent: already claimed.
  if (!(g.record.data.memberIds ?? []).includes(guestId)) {
    return ok({ groupId, guestId, userId, alreadyClaimed: true })
  }

  // Authorize: a valid, unexpired invite token issued for THIS guest. The claim
  // binds the guest to the CALLER's own userId (from the verified JWT, below), and
  // the token proves the caller is the invited person — so a co-member can no longer
  // claim an arbitrary guest (and absorb that guest's balance) as themselves.
  // NOTE: the server-issued, single-use tokenized invite (generated on invite, shown
  // in the invite link, consumed here) is the full fix; this gate enforces its
  // presence. There is no UI claim path today, so requiring the token breaks nothing.
  const members = await queryAll<GroupMemberData>(tools, 'groupMembers', { groupId })
  const guestRow = members.find((m) => m.data.guestId === guestId)
  const token = params.inviteToken as string | undefined
  const tokenValid =
    !!guestRow?.data.inviteToken &&
    !!token &&
    guestRow.data.inviteToken === token &&
    (!guestRow.data.inviteExpiresMs || guestRow.data.inviteExpiresMs > Date.now())
  if (!tokenValid) {
    return fail('Forbidden: a valid, unexpired invite token is required to claim this guest')
  }

  // Identity for the claimed member row -- params override the caller's profile.
  const profileRes = await loadRecord<UserProfileData>(tools, 'users', userId)
  const profile = profileRes.ok ? profileRes.record.data : null
  const identity: ClaimIdentity = {
    displayName: (params.displayName as string) ?? profile?.displayName ?? undefined,
    avatarUrl: (params.avatarUrl as string | null | undefined) ?? profile?.avatarUrl ?? null,
    paymentHandles: (params.paymentHandles as unknown) ?? profile?.paymentHandles ?? null,
  }

  // Large fan-out -> background Job (D5, subrequest ceiling).
  const rowCount = await estimateGroupRowCount(tools, groupId)
  if (rowCount > LARGE_GROUP_ROW_THRESHOLD) {
    const jobId = await enqueueJob(
      env.JOB_ROOMS,
      `app:${env.APP_NAME}`,
      'claim-guest',
      { groupId, guestId, userId, identity },
      { maxAttempts: 3, enqueuedBy: userId },
    )
    return ok({ groupId, guestId, userId, pending: true, jobId })
  }

  const result = await runClaimGuest(tools, { groupId, guestId, userId, identity })
  if (result.error) return fail(result.error)

  await logActivity(tools, {
    groupId,
    memberIds: result.noop ? g.record.data.memberIds : g.record.data.memberIds.map((id) => (id === guestId ? userId : id)),
    type: 'member.added',
    actorId: userId,
    targetId: groupId,
    payload: { summary: `${identity.displayName ?? 'A member'} joined and claimed their share` },
  })

  return ok({ groupId, guestId, userId, rewritten: result.rewritten })
}

export const addContact: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const cachedName = (params.cachedName as string)?.trim()
  if (!cachedName) return fail('cachedName is required')
  const contactUserId = (params.contactUserId as string) ?? null
  const contactGuestId = (params.contactGuestId as string) ?? null

  // Upsert by (ownerUserId, contactUserId|contactGuestId|email) -- never a
  // deterministic recordId (footgun #7). tools.query bypasses RBAC so filter to own.
  const mine = await queryAll<ContactData>(tools, 'contacts', { ownerUserId: userId })
  const existing = mine.find(
    (c) =>
      (contactUserId && c.data.contactUserId === contactUserId) ||
      (contactGuestId && c.data.contactGuestId === contactGuestId) ||
      (params.email && c.data.email === params.email),
  )

  const fields = {
    cachedName,
    cachedAvatarUrl: (params.cachedAvatarUrl as string) ?? null,
    email: (params.email as string) ?? null,
    lastSplitAtMs: (params.lastSplitAtMs as number) ?? Date.now(),
  }

  if (existing) {
    const updated = await tools.update('contacts', existing.recordId, fields)
    if (!updated.success) return updated
    return ok({ contactId: existing.recordId, updated: true })
  }

  const created = await tools.create('contacts', {
    ownerUserId: userId,
    contactUserId,
    contactGuestId,
    ...fields,
  })
  if (!created.success) return created
  return ok({ contactId: created.data.recordId, created: true })
}

export const memberActions: Record<string, ActionHandler<Env>> = {
  removeMember,
  claimGuest,
  addContact,
}
