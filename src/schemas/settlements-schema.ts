import type { CollectionSchema } from 'deepspace/worker'
import { COLLAB_FIELD, groupScopedPermissions, memberIdsColumn } from './_shared'

/**
 * settlements — a payment that pays down a balance (CONTRACT §1.8). Member-scoped
 * (read:'shared'). Writes LOCKED off the client (create/update/delete:false): the
 * recordSettlement / deleteSettlement server actions own every write (validated +
 * FX-snapshotted + audited); soft delete only (D7). A settlement moves `amountMinor`
 * (snapshot to primary) from `fromUserId`'s debt toward zero and reduces the credit.
 */
export const settlementsSchema: CollectionSchema = {
  name: 'settlements',
  collaboratorsField: COLLAB_FIELD,
  columns: [
    { name: 'groupId', storage: 'text', interpretation: 'plain', required: true },
    memberIdsColumn,
    { name: 'fromUserId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'toUserId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'currency', storage: 'text', interpretation: 'plain', required: true },
    { name: 'amountMinor', storage: 'number', interpretation: 'plain', required: true },
    { name: 'fxRate', storage: 'number', interpretation: 'plain', default: 1 },
    { name: 'fxAsOf', storage: 'number', interpretation: 'plain' },
    { name: 'method', storage: 'text', interpretation: { kind: 'select', options: ['manual', 'venmo', 'paypal', 'cashapp', 'upi', 'cash'] }, default: 'manual' },
    { name: 'note', storage: 'text', interpretation: 'plain' },
    { name: 'settledAtMs', storage: 'number', interpretation: 'plain' },
    { name: 'deletedAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: groupScopedPermissions({ create: false, update: false, del: false }),
}
