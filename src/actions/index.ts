import type { ActionHandler } from 'deepspace/worker'
import { enqueueJob } from 'deepspace/worker'
import type { Env } from '../../worker'
import { GROUP_SCOPED, LARGE_GROUP_ROW_THRESHOLD, queryAll } from './helpers'
import { restampMemberIds } from './claim'
import { groupActions } from './groups'
import { expenseActions } from './expenses'
import { commentActions } from './comments'
import { settlementActions } from './settlements'
import { memberActions } from './members'
import { receiptActions } from './receipts'
import { recurringActions } from './recurring'
import { profileActions } from './profile'
import { importActions } from './import'

/**
 * Server actions — privileged, validated writes (run "as the app").
 *
 * Membership / ledger mutations go HERE, never through client `put` (CONTRACT D5):
 * each action authorizes the caller, recomputes derived data via the engine, writes
 * atomically, and appends an `activity` audit row. `tools.*` bypass user RBAC, so
 * authorization is each action's own responsibility (D8: any active member for
 * ledger writes, admin/creator for group-structure changes).
 *
 * Module map:
 *   helpers.ts      auth / record I/O / audit / FX snapshot building blocks
 *   groups.ts       createGroup, updateGroup, archiveGroup
 *   expenses.ts     addExpense, editExpense, softDeleteExpense, restoreExpense
 *   comments.ts     addComment
 *   settlements.ts  recordSettlement, deleteSettlement
 *   members.ts      removeMember, claimGuest, addContact
 *   receipts.ts     scanReceipt (R2 image -> Anthropic vision -> reconcile)
 *   claim.ts        the guest -> userId rewrite (inline + Job-shared)
 */

type GroupData = Record<string, unknown> & {
  name?: string
  memberIds?: string[]
  adminIds?: string[]
}

type Envelope<T> = { recordId: string; data: T; createdBy: string }

const foundationActions: Record<string, ActionHandler<Env>> = {
  /**
   * Add a member identity (a real userId or `guest:<uuid>`) to a group.
   * ADMIN-gated (D8 / §3.14: only the group admin or creator may change membership
   * — adding an account leaks the whole group's rows to it over the WS, so it is a
   * privileged change, not a plain-member one). Appends to `memberIds`, re-stamps
   * every group-scoped row so the new member's `canRead()` filter matches them, and
   * creates the `groupMembers` row.
   */
  addGroupMember: async ({ userId, params, tools, env }) => {
    const groupId = params.groupId as string
    const memberId = params.memberId as string
    if (!groupId || !memberId) {
      return { success: false, error: 'groupId and memberId are required' }
    }

    const groupRes = await tools.get<GroupData>('groups', groupId)
    if (!groupRes.success) return groupRes
    const group = (groupRes.data as { record: Envelope<GroupData> }).record
    const current = group.data.memberIds ?? []
    const admins = group.data.adminIds ?? []

    // Authorization: only an admin/creator may add members (D8).
    if (!admins.includes(userId) && group.createdBy !== userId) {
      return { success: false, error: 'Forbidden: only a group admin may add members' }
    }

    const nextMemberIds = current.includes(memberId)
      ? current
      : [...current, memberId]

    // Re-stamp memberIds across every group-scoped row so the new member's
    // canRead() filter matches the existing ledger. Do a bounded number of writes
    // inline; if a large group has more rows than that, hand the remainder to a
    // chunked, idempotent `restamp-member` Job so the fan-out never blows the Worker
    // subrequest ceiling. Granting on the group row is additive, so the child rows
    // streaming in via the Job is safe (the new member just sees them progressively).
    if (!current.includes(memberId)) {
      const res = await restampMemberIds(
        tools,
        { groupId, memberId, nextMemberIds },
        { maxWrites: LARGE_GROUP_ROW_THRESHOLD },
      )
      await tools.update('groups', groupId, { memberIds: nextMemberIds })
      if (!res.done) {
        await enqueueJob(
          env.JOB_ROOMS,
          `app:${env.APP_NAME}`,
          'restamp-member',
          { groupId, memberId, nextMemberIds },
          { maxAttempts: 3, enqueuedBy: userId },
        )
      }
    }

    // Ensure a groupMembers row exists for this member (query-then-create, footgun #7).
    const existingRows = await queryAll<{ userId?: string; guestId?: string }>(tools, 'groupMembers', { groupId })
    const isGuest = memberId.startsWith('guest:')
    const alreadyHasRow = existingRows.some(
      (r) => r.data.userId === memberId || r.data.guestId === memberId,
    )
    if (!alreadyHasRow) {
      await tools.create('groupMembers', {
        groupId,
        memberIds: nextMemberIds,
        userId: isGuest ? null : memberId,
        guestId: isGuest ? memberId : null,
        role: (params.role as string) ?? 'member',
        status: 'active',
        displayName: (params.displayName as string) ?? 'Member',
        avatarUrl: (params.avatarUrl as string) ?? null,
        paymentHandles: (params.paymentHandles as unknown) ?? null,
        joinedAtMs: Date.now(),
      })
    }

    return { success: true, data: { memberIds: nextMemberIds } }
  },

  /**
   * Delete an entire group and all its rows (admin/creator power, D8).
   * Also the clean teardown path for tests. Authorizes the caller as a group
   * admin, then cascades a hard delete across all group-scoped collections.
   */
  deleteGroupCascade: async ({ userId, params, tools }) => {
    const groupId = params.groupId as string
    if (!groupId) return { success: false, error: 'groupId is required' }

    const groupRes = await tools.get<GroupData>('groups', groupId)
    if (!groupRes.success) return groupRes
    const group = (groupRes.data as { record: Envelope<GroupData> }).record
    const admins = group.data.adminIds ?? []

    if (!admins.includes(userId) && group.createdBy !== userId) {
      return { success: false, error: 'Forbidden: only a group admin may delete the group' }
    }

    let removed = 0
    for (const collection of GROUP_SCOPED) {
      const rows = await queryAll(tools, collection, { groupId })
      for (const r of rows) {
        await tools.remove(collection, r.recordId)
        removed++
      }
    }
    await tools.remove('groups', groupId)

    return { success: true, data: { removed: removed + 1 } }
  },
}

export const actions: Record<string, ActionHandler<Env>> = {
  ...foundationActions,
  ...groupActions,
  ...expenseActions,
  ...commentActions,
  ...settlementActions,
  ...memberActions,
  ...receiptActions,
  ...recurringActions,
  ...profileActions,
  ...importActions,
}
