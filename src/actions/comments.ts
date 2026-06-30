/**
 * Comment actions (CONTRACT §1.10) — posting a comment on an expense.
 *
 * The `comments` collection is write-locked off the client (parity with the rest
 * of the group-scoped surface), so creation goes through this validated server
 * action. It authorizes the caller as a current group member BEFORE any write
 * (the same D8 gate the ledger actions use). The author identity is the row's
 * `createdBy`, which the SDK stamps with the calling userId, so there is no
 * explicit author column to set — the read UI renders `c.createdBy`.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { ExpenseData } from '../lib/data/types'
import { fail, isMember, loadGroup, loadRecord, logActivity, ok } from './helpers'

/** Cap a single comment so one row stays sane (CONTRACT §1.10). */
const MAX_COMMENT_LEN = 2000

export const addComment: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const expenseId = params.expenseId as string
  if (!expenseId) return fail('expenseId is required')

  // Validate the body first (cheap, and leaks nothing about the expense on bad input).
  const body = ((params.body as string) ?? '').trim()
  if (!body) return fail('Comment cannot be empty')
  if (body.length > MAX_COMMENT_LEN) {
    return fail(`Comment is too long (max ${MAX_COMMENT_LEN} characters)`)
  }

  const ex = await loadRecord<ExpenseData>(tools, 'expenses', expenseId)
  if (!ex.ok) return fail(ex.error)

  const g = await loadGroup(tools, ex.record.data.groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  const groupId = ex.record.data.groupId
  const memberIds = g.record.data.memberIds

  const created = await tools.create('comments', {
    expenseId,
    groupId,
    memberIds,
    body,
    deletedAt: null,
  })
  if (!created.success) return created

  await logActivity(tools, {
    groupId,
    memberIds,
    type: 'comment.added',
    actorId: userId,
    targetId: expenseId,
    payload: { summary: `Commented on "${ex.record.data.description}"` },
  })

  return ok({ commentId: created.data.recordId })
}

export const commentActions: Record<string, ActionHandler<Env>> = {
  addComment,
}
