/**
 * Shared "add an identity to a group" fan-out (CONTRACT §1.6, D5).
 *
 * The one place that appends a member to `groups.memberIds`, re-stamps every
 * group-scoped row so the new member's `canRead()` filter matches the existing
 * ledger (bounded inline, remainder handed to a chunked, idempotent
 * `restamp-member` Job past the fan-out threshold — the Worker subrequest ceiling),
 * and ensures a `groupMembers` row exists (query-then-create, footgun #7).
 *
 * This helper does NO authorization — its callers own that:
 *   - addGroupMember (src/actions/index.ts): admin/creator gate (D8).
 *   - acceptInvite  (src/actions/invite.ts): a valid, unexpired group-invite token.
 * Keeping it in one function means the two entry points can never drift on the
 * load-bearing membership invariant (memberIds stamp == canRead boundary).
 */

import type { ActionTools } from 'deepspace/worker'
import { enqueueJob } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { GroupMemberData, MemberId, PaymentHandles } from '../lib/data/types'
import { restampMemberIds } from './claim'
import { LARGE_GROUP_ROW_THRESHOLD, loadGroup, queryAll } from './helpers'

export interface AddMemberCoreArgs {
  groupId: string
  /** A real `userId` or a `guest:<uuid>` ledger identity. */
  memberId: string
  role?: 'member' | 'admin'
  displayName?: string
  avatarUrl?: string | null
  paymentHandles?: PaymentHandles | null
  /** Caller userId, for Job attribution when a large fan-out is deferred. */
  enqueuedBy: string
}

export type AddMemberCoreResult =
  | { ok: true; memberIds: MemberId[]; added: boolean }
  | { ok: false; error: string }

export async function addMemberCore(
  tools: ActionTools,
  env: Env,
  args: AddMemberCoreArgs,
): Promise<AddMemberCoreResult> {
  const g = await loadGroup(tools, args.groupId)
  if (!g.ok) return { ok: false, error: g.error }

  const current = g.record.data.memberIds ?? []
  const isNew = !current.includes(args.memberId)
  const nextMemberIds = isNew ? [...current, args.memberId] : current

  // Re-stamp memberIds across every group-scoped row so the new member's canRead()
  // filter matches the existing ledger. Bounded inline; the remainder of a large
  // group goes to a chunked, idempotent `restamp-member` Job. Granting on the group
  // row is additive, so child rows streaming in via the Job is safe.
  if (isNew) {
    const res = await restampMemberIds(
      tools,
      { groupId: args.groupId, memberId: args.memberId, nextMemberIds },
      { maxWrites: LARGE_GROUP_ROW_THRESHOLD },
    )
    await tools.update('groups', args.groupId, { memberIds: nextMemberIds })
    if (!res.done) {
      await enqueueJob(
        env.JOB_ROOMS,
        `app:${env.APP_NAME}`,
        'restamp-member',
        { groupId: args.groupId, memberId: args.memberId, nextMemberIds },
        { maxAttempts: 3, enqueuedBy: args.enqueuedBy },
      )
    }
  }

  // Ensure a groupMembers row exists for this member (query-then-create, footgun #7).
  const existingRows = await queryAll<GroupMemberData>(tools, 'groupMembers', { groupId: args.groupId })
  const isGuest = args.memberId.startsWith('guest:')
  const alreadyHasRow = existingRows.some(
    (r) => r.data.userId === args.memberId || r.data.guestId === args.memberId,
  )
  if (!alreadyHasRow) {
    await tools.create('groupMembers', {
      groupId: args.groupId,
      memberIds: nextMemberIds,
      userId: isGuest ? null : args.memberId,
      guestId: isGuest ? args.memberId : null,
      role: args.role ?? 'member',
      status: 'active',
      displayName: args.displayName ?? 'Member',
      avatarUrl: args.avatarUrl ?? null,
      paymentHandles: args.paymentHandles ?? null,
      joinedAtMs: Date.now(),
    })
  }

  return { ok: true, memberIds: nextMemberIds, added: isNew }
}
