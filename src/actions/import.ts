/**
 * Splitwise CSV import (CONTRACT §3.13 / §4 dedupe / §7 date-as-local).
 *
 * `importExpenses` takes already-parsed rows whose per-person nets are keyed by
 * GROUP MEMBER ID (the wizard maps CSV names -> members before calling), plus the
 * target group, and creates one expense per row mirroring the `addExpense` path:
 * recompute owed `splits` via the engine from a reconstructed `splitConfig`,
 * snapshot FX at entry, write the row atomically, and append an `activity` audit
 * row. Splits are reconstructed so per-member balances match Splitwise exactly.
 *
 * DEDUPE (§4): a fingerprint of (date, amountMinor, normalized description, payer)
 * is matched against the group's existing expenses (and within the same call), so
 * exact duplicates are skipped by default — the import is idempotent and safe to
 * re-run or resume.
 *
 * SCALE: each call imports the rows it is handed. The wizard feeds rows in bounded
 * chunks and drives the progress UI, so a large import never exceeds the Worker
 * subrequest ceiling (D5) and every chunk is idempotent on the fingerprint. (The
 * group is already loaded once; per-row work is one create + one activity row.)
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { computeExpenseShares, SplitError } from '../lib/split'
import type { ExpenseData } from '../lib/data/types'
import {
  fail,
  isMember,
  loadGroup,
  logActivity,
  nonMemberKey,
  ok,
  queryAll,
  snapshotFor,
  sumShares,
} from './helpers'
import { derivePayer, fingerprint, reconstruct } from '../components/import/csv'
import type { ImportChunkResult, ImportRowPayload } from '../components/import/types'

const importExpenses: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const groupId = params.groupId as string
  const rows = (params.rows as ImportRowPayload[]) ?? []
  const includeDuplicates = Boolean(params.includeDuplicates)
  const manualRates = (params.manualRates as Record<string, number>) ?? {}
  if (!groupId) return fail('groupId is required')
  if (!Array.isArray(rows) || rows.length === 0) return fail('No rows to import')

  const g = await loadGroup(tools, groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  const primary = g.record.data.primaryCurrency
  const memberIds = g.record.data.memberIds

  // Existing fingerprints (skip exact duplicates against the live ledger, §4).
  // queryAll so dedupe compares against EVERY existing expense, not a slice. The
  // per-row write fan-out stays bounded because the wizard feeds rows in chunks.
  const existing = await queryAll<ExpenseData>(tools, 'expenses', { groupId })
  const seen = new Set<string>()
  for (const e of existing) {
    if (e.data.deletedAt) continue
    const ms = e.data.expenseAtMs ?? Date.parse(e.createdAt) ?? Date.now()
    seen.add(
      fingerprint({
        dateMs: ms,
        amountMinor: e.data.amountMinor,
        description: e.data.description,
        payerId: derivePayer(e.data.paidBy),
      }),
    )
  }

  const result: ImportChunkResult = { imported: 0, skippedDuplicates: 0, errors: [], createdIds: [] }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const label = row?.description || `Row ${i + 1}`
    try {
      if (!Number.isInteger(row.amountMinor) || row.amountMinor <= 0) {
        result.errors.push({ index: i, description: label, reason: 'Amount must be a positive integer' })
        continue
      }

      const recon = reconstruct(row.nets ?? {}, row.amountMinor)
      if (!recon) {
        result.errors.push({ index: i, description: label, reason: 'Could not reconstruct a valid split from the row' })
        continue
      }
      if (sumShares(recon.paidBy) !== row.amountMinor) {
        result.errors.push({ index: i, description: label, reason: 'Reconstructed payments did not match the total' })
        continue
      }
      // Every payer / participant must be a current member (reject phantom ids that
      // would otherwise corrupt the group's derived balance graph with a non-member).
      const badId =
        nonMemberKey(Object.keys(recon.paidBy), memberIds) ??
        nonMemberKey(recon.splitConfig.participants, memberIds)
      if (badId) {
        result.errors.push({ index: i, description: label, reason: `"${badId}" is not a member of this group` })
        continue
      }

      const payerId = derivePayer(recon.paidBy)
      const fp = fingerprint({
        dateMs: row.dateMs,
        amountMinor: row.amountMinor,
        description: row.description,
        payerId,
      })
      if (seen.has(fp) && !includeDuplicates) {
        result.skippedDuplicates++
        continue
      }

      // Recompute owed splits via the engine (mirrors addExpense; asserts conservation).
      let splits
      try {
        splits = computeExpenseShares({
          amountMinor: row.amountMinor,
          splitConfig: recon.splitConfig,
          payerId,
        })
      } catch (e) {
        const reason = e instanceof SplitError ? `${e.code}: ${e.message}` : (e as Error).message
        result.errors.push({ index: i, description: label, reason })
        continue
      }

      // Snapshot FX at entry (manual rate as the fallback for a missing pair, §1.1 D4).
      const snap = await snapshotFor(tools, row.currency, primary, manualRates[row.currency])
      if (!snap) {
        result.errors.push({
          index: i,
          description: label,
          reason: `No exchange rate for ${row.currency} -> ${primary}; add a rate or match the group currency`,
        })
        continue
      }

      const created = await tools.create('expenses', {
        groupId,
        memberIds,
        description: row.description,
        category: row.category || 'other',
        currency: row.currency,
        amountMinor: row.amountMinor,
        fxRate: snap.fxRate,
        fxAsOf: snap.fxAsOf,
        paidBy: recon.paidBy,
        splits,
        splitConfig: recon.splitConfig,
        expenseAtMs: row.dateMs,
        receiptId: null,
        isReimbursement: false,
        recurringId: null,
        note: 'Imported from Splitwise',
        deletedAt: null,
      })
      if (!created.success) {
        result.errors.push({ index: i, description: label, reason: created.error })
        continue
      }

      const expenseId = created.data.recordId
      result.createdIds.push(expenseId)
      result.imported++
      seen.add(fp)

      await logActivity(tools, {
        groupId,
        memberIds,
        type: 'expense.created',
        actorId: userId,
        targetId: expenseId,
        payload: {
          after: { description: row.description, amountMinor: row.amountMinor, currency: row.currency },
          summary: `Imported "${row.description}"`,
        },
      })
    } catch (e) {
      result.errors.push({ index: i, description: label, reason: (e as Error).message })
    }
  }

  return ok(result)
}

export const importActions: Record<string, ActionHandler<Env>> = {
  importExpenses,
}
