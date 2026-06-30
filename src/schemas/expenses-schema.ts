import type { CollectionSchema } from 'deepspace/worker'
import { COLLAB_FIELD, groupScopedPermissions, memberIdsColumn } from './_shared'

/**
 * expenses — a shared charge: paid + owed ledger entry (CONTRACT §1.7).
 * Member-scoped (read:'shared'). Writes are LOCKED off the client (create/update/
 * delete:false) — the addExpense/editExpense/softDeleteExpense/restoreExpense
 * server actions are the only write path, so the invariant Σ paidBy === Σ splits
 * === amountMinor (recomputed server-side via the engine) and the audit row can
 * never be bypassed. Deletion is soft via `deletedAt` (D7), fully revertible.
 * Money is integer minor units. `splits` is the immutable ledger truth balances
 * derive from; `splitConfig` re-opens the editor.
 */
export const expensesSchema: CollectionSchema = {
  name: 'expenses',
  collaboratorsField: COLLAB_FIELD,
  columns: [
    { name: 'groupId', storage: 'text', interpretation: 'plain', required: true },
    memberIdsColumn,
    { name: 'description', storage: 'text', interpretation: 'plain', required: true },
    { name: 'category', storage: 'text', interpretation: 'plain', default: 'other' },
    { name: 'currency', storage: 'text', interpretation: 'plain', required: true },
    { name: 'amountMinor', storage: 'number', interpretation: 'plain', required: true },
    { name: 'fxRate', storage: 'number', interpretation: 'plain', default: 1 },
    { name: 'fxAsOf', storage: 'number', interpretation: 'plain' },
    { name: 'paidBy', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'splits', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'splitConfig', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'expenseAtMs', storage: 'number', interpretation: 'plain' },
    { name: 'receiptId', storage: 'text', interpretation: 'plain' },
    { name: 'isReimbursement', storage: 'number', interpretation: { kind: 'boolean' }, default: false },
    { name: 'recurringId', storage: 'text', interpretation: 'plain' },
    { name: 'note', storage: 'text', interpretation: 'plain' },
    { name: 'deletedAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: groupScopedPermissions({ create: false, update: false, del: false }),
}
