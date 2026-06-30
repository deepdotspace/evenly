import type { CollectionSchema } from 'deepspace/worker'
import { COLLAB_FIELD, groupScopedPermissions, memberIdsColumn } from './_shared'

/**
 * comments — discussion on an expense (CONTRACT §1.10). Member-scoped (read:'shared').
 * Writes LOCKED off the client (create/update/delete:false) for parity with the rest
 * of the group-scoped surface and to keep the AI assistant off the write path. The
 * one write path is the `addComment` server action, which authorizes the caller as a
 * group member before creating the row; the author is the row's `createdBy` stamp.
 */
export const commentsSchema: CollectionSchema = {
  name: 'comments',
  collaboratorsField: COLLAB_FIELD,
  columns: [
    { name: 'expenseId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'groupId', storage: 'text', interpretation: 'plain', required: true },
    memberIdsColumn,
    { name: 'body', storage: 'text', interpretation: 'plain', required: true },
    { name: 'deletedAt', storage: 'number', interpretation: 'plain' },
  ],
  // Writes locked off the client; the `addComment` server action owns creation.
  permissions: groupScopedPermissions({ create: false, update: false, del: false }),
}
