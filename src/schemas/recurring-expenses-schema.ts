import type { CollectionSchema } from 'deepspace/worker'
import { COLLAB_FIELD, groupScopedPermissions, memberIdsColumn } from './_shared'

/**
 * recurringExpenses — a template a cron materializes into expenses (CONTRACT §1.12).
 * Member-scoped (read:'shared'). Writes LOCKED off the client (create/update/
 * delete:false): the createRecurring / updateRecurring / deleteRecurring /
 * runRecurringNow server actions own every write. The cron (warmed via the
 * worker's app.use poke) scans due rows, creates an expense with `recurringId`
 * set, idempotent on (recurringId, occurrenceDate), then advances nextRunAtMs/
 * lastRunAtMs. `active` pauses without delete; deleteRecurring removes the template.
 */
export const recurringExpensesSchema: CollectionSchema = {
  name: 'recurringExpenses',
  collaboratorsField: COLLAB_FIELD,
  columns: [
    { name: 'groupId', storage: 'text', interpretation: 'plain', required: true },
    memberIdsColumn,
    // { description, category, currency, amountMinor, paidBy, splitConfig }
    { name: 'template', storage: 'text', interpretation: { kind: 'json' }, required: true },
    // { unit:'day'|'week'|'month', interval, anchorDay? }
    { name: 'cadence', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'timezone', storage: 'text', interpretation: 'plain' },
    { name: 'nextRunAtMs', storage: 'number', interpretation: 'plain' },
    { name: 'lastRunAtMs', storage: 'number', interpretation: 'plain' },
    { name: 'endsAtMs', storage: 'number', interpretation: 'plain' },
    { name: 'active', storage: 'number', interpretation: { kind: 'boolean' }, default: true },
  ],
  permissions: groupScopedPermissions({ create: false, update: false, del: false }),
}
