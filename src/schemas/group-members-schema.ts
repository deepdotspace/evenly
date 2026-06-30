import type { CollectionSchema } from 'deepspace/worker'
import { COLLAB_FIELD, groupScopedPermissions, memberIdsColumn } from './_shared'

/**
 * groupMembers — one row per membership; the rich per-member record (CONTRACT §1.6).
 * `memberIds` mirrors the parent group for RBAC (read:'shared'). A member identity
 * is either a real `userId` or a `guest:<uuid>`. Identity (displayName/avatarUrl/
 * paymentHandles) is denormalized here at join time and re-stamped via server action
 * on profile edit (fan-out -> Job for users in many groups, D5). Membership mutations
 * (add/remove/invite/claim) go through validated server actions, never client put.
 */
export const groupMembersSchema: CollectionSchema = {
  name: 'groupMembers',
  collaboratorsField: COLLAB_FIELD,
  columns: [
    { name: 'groupId', storage: 'text', interpretation: 'plain', required: true },
    memberIdsColumn,
    { name: 'userId', storage: 'text', interpretation: 'plain' },
    { name: 'guestId', storage: 'text', interpretation: 'plain' },
    { name: 'role', storage: 'text', interpretation: { kind: 'select', options: ['admin', 'member'] }, default: 'member' },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['active', 'inactive', 'removed'] }, default: 'active' },
    { name: 'displayName', storage: 'text', interpretation: 'plain', required: true },
    { name: 'avatarUrl', storage: 'text', interpretation: 'plain' },
    { name: 'paymentHandles', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'joinedAtMs', storage: 'number', interpretation: 'plain' },
    { name: 'leftAtMs', storage: 'number', interpretation: 'plain' },
    { name: 'inviteEmail', storage: 'text', interpretation: { kind: 'email' } },
    { name: 'inviteToken', storage: 'text', interpretation: 'plain' },
    { name: 'inviteExpiresMs', storage: 'number', interpretation: 'plain' },
  ],
  // Writes locked off the client: membership mutations (add/remove/invite/claim
  // /profile re-stamp) go through validated server actions only (D5, D8).
  permissions: groupScopedPermissions({ create: false, update: false, del: false }),
}
