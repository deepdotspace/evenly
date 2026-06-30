/**
 * Expense ledger actions (CONTRACT §1.7, §2.6, §3.5, §3.9, D7, D8).
 *
 * Splits are ALWAYS recomputed server-side via the engine and the invariant
 * `Σ paidBy === Σ splits === amountMinor` is asserted before any write -- the
 * client never supplies `splits`. FX is snapshotted at entry (D4). The resolved
 * `splits` map is written atomically (one row), and a before/after `activity` row
 * is appended for history + undo (the SDK is per-row; the row write is the atom).
 *
 * Any active member may create/edit/soft-delete any expense (D8); deletes are soft
 * and revertible (D7).
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  computeExpenseShares,
  SplitError,
  type Claims,
  type Shares,
  type SplitConfig,
} from '../lib/split'
import type { ExpenseData, ReceiptData } from '../lib/data/types'
import {
  derivePayerId,
  fail,
  isMember,
  loadGroup,
  loadRecord,
  logActivity,
  nonMemberKey,
  ok,
  snapshotFor,
  sumShares,
} from './helpers'

interface ExpenseDraft {
  description: string
  category?: string
  currency?: string
  amountMinor: number
  paidBy: Shares
  splitConfig: SplitConfig
  expenseAtMs?: number
  isReimbursement?: boolean
  receiptId?: string | null
  recurringId?: string | null
  note?: string | null
  manualRate?: number | null
  /** Inline receipt allocation for an itemized split (else loaded by receiptId). */
  receipt?: { items: { id: string; lineTotalMinor: number }[]; claims: Claims }
}

/** Resolve the itemized-split inputs from the draft or the linked receipt row. */
async function resolveReceipt(
  tools: Parameters<ActionHandler<Env>>[0]['tools'],
  draft: ExpenseDraft,
): Promise<{ items: { id: string; lineTotalMinor: number }[]; claims: Claims } | { error: string }> {
  if (draft.receipt) return draft.receipt
  if (draft.receiptId) {
    const r = await loadRecord<ReceiptData>(tools, 'receipts', draft.receiptId)
    if (!r.ok) return { error: r.error }
    const parsed = r.record.data.parsed
    if (!parsed) return { error: 'receipt has no parsed items' }
    return {
      items: parsed.items.map((it) => ({ id: it.id, lineTotalMinor: it.lineTotalMinor })),
      claims: r.record.data.claims ?? {},
    }
  }
  return { error: 'itemized split requires a receipt' }
}

/** Compute the resolved owed `splits` and assert the conservation invariant. */
async function computeSplits(
  tools: Parameters<ActionHandler<Env>>[0]['tools'],
  draft: ExpenseDraft,
  memberIds: string[],
): Promise<{ splits: Shares } | { error: string }> {
  if (!Number.isInteger(draft.amountMinor) || draft.amountMinor <= 0) {
    return { error: 'amountMinor must be a positive integer' }
  }
  if (sumShares(draft.paidBy) !== draft.amountMinor) {
    return { error: `paidBy must sum to ${draft.amountMinor} (got ${sumShares(draft.paidBy)})` }
  }
  // Every payer must be a current member (else a phantom id skews the balance graph).
  const badPayer = nonMemberKey(Object.keys(draft.paidBy), memberIds)
  if (badPayer) return { error: `payer "${badPayer}" is not a group member` }

  let receipt: { items: { id: string; lineTotalMinor: number }[]; claims: Claims } | undefined
  if (draft.splitConfig.scope === 'itemized') {
    const r = await resolveReceipt(tools, draft)
    if ('error' in r) return r
    receipt = r
  }

  try {
    const splits = computeExpenseShares({
      amountMinor: draft.amountMinor,
      splitConfig: draft.splitConfig,
      payerId: derivePayerId(draft.paidBy),
      receipt,
    })
    // The engine resolves owed shares from participants/weights/claims; assert the
    // result only names members so no phantom participant lands in the ledger.
    const badSplit = nonMemberKey(Object.keys(splits), memberIds)
    if (badSplit) return { error: `split target "${badSplit}" is not a group member` }
    return { splits }
  } catch (e) {
    if (e instanceof SplitError) return { error: `${e.code}: ${e.message}` }
    return { error: (e as Error).message }
  }
}

/**
 * Assert a caller-supplied `receiptId` (if any) belongs to the same group as the
 * expense. A receipt is loaded by id with the RBAC-bypassing tool, so without this
 * an attacker who learns a foreign receiptId could leak its line totals into the
 * split AND get the re-link write flip another group's receipt. Fail-fast before
 * any write. Returns an error string, or null when there is nothing to check.
 */
async function guardReceiptGroup(
  tools: Parameters<ActionHandler<Env>>[0]['tools'],
  receiptId: string | null | undefined,
  groupId: string,
): Promise<string | null> {
  if (!receiptId) return null
  const rc = await loadRecord<ReceiptData>(tools, 'receipts', receiptId)
  if (!rc.ok) return rc.error
  if (rc.record.data.groupId !== groupId) return 'Forbidden: receipt belongs to another group'
  return null
}

export const addExpense: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const groupId = params.groupId as string
  const draft = params.draft as ExpenseDraft
  if (!groupId || !draft) return fail('groupId and draft are required')

  const g = await loadGroup(tools, groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  const memberIds = g.record.data.memberIds
  const receiptGuard = await guardReceiptGroup(tools, draft.receiptId, groupId)
  if (receiptGuard) return fail(receiptGuard)

  const currency = draft.currency || g.record.data.primaryCurrency
  const computed = await computeSplits(tools, draft, memberIds)
  if ('error' in computed) return fail(computed.error)

  const snap = await snapshotFor(tools, currency, g.record.data.primaryCurrency, draft.manualRate)
  if (!snap) {
    return fail(`No FX rate for ${currency} -> ${g.record.data.primaryCurrency}; supply manualRate`)
  }

  const created = await tools.create('expenses', {
    groupId,
    memberIds,
    description: draft.description,
    category: draft.category || 'other',
    currency,
    amountMinor: draft.amountMinor,
    fxRate: snap.fxRate,
    fxAsOf: snap.fxAsOf,
    paidBy: draft.paidBy,
    splits: computed.splits,
    splitConfig: draft.splitConfig,
    expenseAtMs: draft.expenseAtMs ?? Date.now(),
    receiptId: draft.receiptId ?? null,
    isReimbursement: Boolean(draft.isReimbursement),
    recurringId: draft.recurringId ?? null,
    note: draft.note ?? null,
    deletedAt: null,
  })
  if (!created.success) return created
  const expenseId = created.data.recordId

  // Link the receipt to the new expense (itemized flow).
  if (draft.receiptId) {
    await tools.update('receipts', draft.receiptId, {
      expenseId,
      status: 'confirmed',
      ...(draft.receipt?.claims ? { claims: draft.receipt.claims } : {}),
    })
  }

  await logActivity(tools, {
    groupId,
    memberIds,
    type: 'expense.created',
    actorId: userId,
    targetId: expenseId,
    payload: {
      after: { description: draft.description, amountMinor: draft.amountMinor, currency },
      summary: `Added "${draft.description}"`,
    },
  })

  return ok({ expenseId, splits: computed.splits, fxRate: snap.fxRate })
}

export const editExpense: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const expenseId = params.expenseId as string
  const patch = (params.patch as Partial<ExpenseDraft>) ?? {}
  if (!expenseId) return fail('expenseId is required')

  const ex = await loadRecord<ExpenseData>(tools, 'expenses', expenseId)
  if (!ex.ok) return fail(ex.error)
  const existing = ex.record.data

  const g = await loadGroup(tools, existing.groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  // Merge the patch over the existing expense to form the new draft.
  const merged: ExpenseDraft = {
    description: patch.description ?? existing.description,
    category: patch.category ?? existing.category,
    currency: patch.currency ?? existing.currency,
    amountMinor: patch.amountMinor ?? existing.amountMinor,
    paidBy: patch.paidBy ?? existing.paidBy,
    splitConfig: patch.splitConfig ?? existing.splitConfig,
    expenseAtMs: patch.expenseAtMs ?? existing.expenseAtMs,
    isReimbursement: patch.isReimbursement ?? Boolean(existing.isReimbursement),
    receiptId: patch.receiptId ?? existing.receiptId,
    recurringId: patch.recurringId ?? existing.recurringId,
    note: patch.note ?? existing.note,
    manualRate: patch.manualRate,
    receipt: patch.receipt,
  }

  const receiptGuard = await guardReceiptGroup(tools, merged.receiptId, existing.groupId)
  if (receiptGuard) return fail(receiptGuard)

  const computed = await computeSplits(tools, merged, g.record.data.memberIds)
  if ('error' in computed) return fail(computed.error)

  const update: Record<string, unknown> = {
    description: merged.description,
    category: merged.category || 'other',
    amountMinor: merged.amountMinor,
    paidBy: merged.paidBy,
    splits: computed.splits,
    splitConfig: merged.splitConfig,
    expenseAtMs: merged.expenseAtMs ?? Date.now(),
    isReimbursement: Boolean(merged.isReimbursement),
    receiptId: merged.receiptId ?? null,
    note: merged.note ?? null,
  }

  // Re-snapshot FX only when the currency actually changed (D4: past rates frozen).
  if (merged.currency !== existing.currency) {
    const snap = await snapshotFor(tools, merged.currency!, g.record.data.primaryCurrency, merged.manualRate)
    if (!snap) return fail(`No FX rate for ${merged.currency} -> ${g.record.data.primaryCurrency}; supply manualRate`)
    update.currency = merged.currency
    update.fxRate = snap.fxRate
    update.fxAsOf = snap.fxAsOf
  }

  const updated = await tools.update('expenses', expenseId, update)
  if (!updated.success) return updated

  await logActivity(tools, {
    groupId: existing.groupId,
    memberIds: g.record.data.memberIds,
    type: 'expense.edited',
    actorId: userId,
    targetId: expenseId,
    payload: {
      before: { description: existing.description, amountMinor: existing.amountMinor, currency: existing.currency },
      after: { description: merged.description, amountMinor: merged.amountMinor, currency: merged.currency },
      summary: `Edited "${merged.description}"`,
    },
  })

  return ok({ expenseId, splits: computed.splits })
}

async function toggleDelete(
  tools: Parameters<ActionHandler<Env>>[0]['tools'],
  userId: string,
  expenseId: string,
  deleted: boolean,
) {
  const ex = await loadRecord<ExpenseData>(tools, 'expenses', expenseId)
  if (!ex.ok) return fail(ex.error)
  const g = await loadGroup(tools, ex.record.data.groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  const updated = await tools.update('expenses', expenseId, { deletedAt: deleted ? Date.now() : null })
  if (!updated.success) return updated

  await logActivity(tools, {
    groupId: ex.record.data.groupId,
    memberIds: g.record.data.memberIds,
    type: deleted ? 'expense.deleted' : 'expense.restored',
    actorId: userId,
    targetId: expenseId,
    payload: {
      before: { description: ex.record.data.description, amountMinor: ex.record.data.amountMinor },
      summary: `${deleted ? 'Deleted' : 'Restored'} "${ex.record.data.description}"`,
    },
  })
  return ok({ expenseId, deleted })
}

export const softDeleteExpense: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const expenseId = params.expenseId as string
  if (!expenseId) return fail('expenseId is required')
  return toggleDelete(tools, userId, expenseId, true)
}

export const restoreExpense: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const expenseId = params.expenseId as string
  if (!expenseId) return fail('expenseId is required')
  return toggleDelete(tools, userId, expenseId, false)
}

export const expenseActions: Record<string, ActionHandler<Env>> = {
  addExpense,
  editExpense,
  softDeleteExpense,
  restoreExpense,
}
