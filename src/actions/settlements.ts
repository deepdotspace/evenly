/**
 * Settlement actions (CONTRACT §1.8, §3.7, D7, D8). A settlement is a ledger entry
 * that moves `amountMinor` (snapshot to primary) from the debtor toward zero and
 * reduces the creditor. Partial payments are just smaller settlements; the
 * remainder carries. Soft delete only (revertible).
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { SettlementData, SettlementMethod } from '../lib/data/types'
import { fail, isMember, loadGroup, loadRecord, logActivity, ok, snapshotFor } from './helpers'

export const recordSettlement: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const groupId = params.groupId as string
  const fromUserId = params.fromUserId as string
  const toUserId = params.toUserId as string
  const amountMinor = params.amountMinor as number
  if (!groupId || !fromUserId || !toUserId) {
    return fail('groupId, fromUserId and toUserId are required')
  }
  if (fromUserId === toUserId) return fail('a settlement needs two distinct members')
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return fail('amountMinor must be a positive integer')
  }

  const g = await loadGroup(tools, groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  const memberIds = g.record.data.memberIds
  for (const id of [fromUserId, toUserId]) {
    if (!memberIds.includes(id)) return fail(`${id} is not a member of this group`)
  }

  const currency = (params.currency as string) || g.record.data.primaryCurrency
  const snap = await snapshotFor(tools, currency, g.record.data.primaryCurrency, params.manualRate as number | null)
  if (!snap) return fail(`No FX rate for ${currency} -> ${g.record.data.primaryCurrency}; supply manualRate`)

  const created = await tools.create('settlements', {
    groupId,
    memberIds,
    fromUserId,
    toUserId,
    currency,
    amountMinor,
    fxRate: snap.fxRate,
    fxAsOf: snap.fxAsOf,
    method: ((params.method as SettlementMethod) ?? 'manual') as SettlementMethod,
    note: (params.note as string) ?? null,
    settledAtMs: (params.settledAtMs as number) ?? Date.now(),
    deletedAt: null,
  })
  if (!created.success) return created
  const settlementId = created.data.recordId

  await logActivity(tools, {
    groupId,
    memberIds,
    type: 'settlement.recorded',
    actorId: userId,
    targetId: settlementId,
    payload: { after: { fromUserId, toUserId, amountMinor, currency }, summary: 'Recorded a payment' },
  })

  return ok({ settlementId })
}

export const deleteSettlement: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const settlementId = params.settlementId as string
  if (!settlementId) return fail('settlementId is required')

  const s = await loadRecord<SettlementData>(tools, 'settlements', settlementId)
  if (!s.ok) return fail(s.error)
  const g = await loadGroup(tools, s.record.data.groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  const updated = await tools.update('settlements', settlementId, { deletedAt: Date.now() })
  if (!updated.success) return updated

  await logActivity(tools, {
    groupId: s.record.data.groupId,
    memberIds: g.record.data.memberIds,
    type: 'settlement.deleted',
    actorId: userId,
    targetId: settlementId,
    payload: {
      before: {
        fromUserId: s.record.data.fromUserId,
        toUserId: s.record.data.toUserId,
        amountMinor: s.record.data.amountMinor,
      },
      summary: 'Deleted a payment',
    },
  })

  return ok({ settlementId, deleted: true })
}

export const settlementActions: Record<string, ActionHandler<Env>> = {
  recordSettlement,
  deleteSettlement,
}
