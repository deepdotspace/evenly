import type { CollectionSchema } from 'deepspace/worker'
import { COLLAB_FIELD, groupScopedPermissions, memberIdsColumn } from './_shared'

/**
 * groups — trip / household / pair / oneoff container (CONTRACT §1.5).
 * Member-scoped: `memberIds` is the collaboratorsField; read:'shared'. Ownership
 * falls back to the spoof-proof envelope `_created_by` (no ownerField needed).
 * Group-level powers (rename, currency, member changes, archive/delete) are
 * gated to admins at the server-action / UI layer (D8); group creator may delete.
 */
export const groupsSchema: CollectionSchema = {
  name: 'groups',
  collaboratorsField: COLLAB_FIELD,
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: ['group', 'pair', 'oneoff'] }, default: 'group' },
    { name: 'primaryCurrency', storage: 'text', interpretation: 'plain', default: 'USD' },
    memberIdsColumn,
    { name: 'adminIds', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'simplifyDefault', storage: 'number', interpretation: { kind: 'boolean' }, default: false },
    { name: 'defaultSplit', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'coverColor', storage: 'text', interpretation: 'plain' },
    { name: 'icon', storage: 'text', interpretation: 'plain' },
    { name: 'coverImageKey', storage: 'text', interpretation: 'plain' },
    { name: 'archivedAt', storage: 'number', interpretation: 'plain' },
    { name: 'cachedNet', storage: 'text', interpretation: { kind: 'json' } },
  ],
  // Writes locked off the client: createGroup / updateGroup / archiveGroup /
  // deleteGroupCascade server actions own every write (admin-gated, D8). A direct
  // client put({ adminIds:[me] }) is what this lock prevents (privilege escalation).
  permissions: groupScopedPermissions({ create: false, update: false, del: false }),
}
