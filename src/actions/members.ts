/**
 * Membership + contact actions (CONTRACT §1.4, §1.6, §4, §7 A5, D5, D8).
 *
 *  - removeMember: admin-gated. Hard-remove is BLOCKED while the member's net != 0
 *    (settle first, A5); they may instead be marked `inactive` (kept in the ledger,
 *    can't be added to new expenses).
 *  - addContact: query-then-upsert the caller's address-book row (footgun #7).
 *
 * Self-service guest claiming lives in `invite.ts` (acceptInvite), authorized by the
 * group's shareable invite token — it reuses the same `runClaimGuest` rewrite engine.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { netBalances } from '../lib/split'
import type { ContactData, ExpenseData, GroupMemberData, SettlementData } from '../lib/data/types'
import { fail, isAdmin, loadGroup, logActivity, ok, queryAll } from './helpers'

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
  addContact,
}
