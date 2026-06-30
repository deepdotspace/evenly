import type { CollectionSchema } from 'deepspace/worker'
import { COLLAB_FIELD, groupScopedPermissions, memberIdsColumn } from './_shared'

/**
 * activity — append-only audit + activity feed (CONTRACT §1.11). Member-scoped
 * (read:'shared'). Writes LOCKED off the client (create/update/delete:false): only
 * the server actions append rows (via logActivity), so the feed cannot be forged or
 * spoofed (no client-created "You received $500" notification, no tampered history).
 * Every create/edit/delete across the app appends one row with a before/after
 * `payload` that powers history + undo (D7). Immutable evidence.
 */
export const activitySchema: CollectionSchema = {
  name: 'activity',
  collaboratorsField: COLLAB_FIELD,
  columns: [
    { name: 'groupId', storage: 'text', interpretation: 'plain', required: true },
    memberIdsColumn,
    {
      name: 'type',
      storage: 'text',
      interpretation: {
        kind: 'select',
        options: [
          'expense.created', 'expense.edited', 'expense.deleted', 'expense.restored',
          'settlement.recorded', 'settlement.deleted',
          'member.added', 'member.removed', 'member.left',
          'comment.added', 'receipt.scanned',
          'group.created', 'group.renamed',
          'recurring.created', 'recurring.materialized',
        ],
      },
      required: true,
    },
    { name: 'actorId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'targetId', storage: 'text', interpretation: 'plain' },
    // { before?, after?, summary }
    { name: 'payload', storage: 'text', interpretation: { kind: 'json' } },
  ],
  // Append-only audit: only server actions write (via logActivity); the client
  // can neither create nor edit/delete a feed row.
  permissions: groupScopedPermissions({ create: false, update: false, del: false }),
}
