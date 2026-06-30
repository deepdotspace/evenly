import type { CollectionSchema } from 'deepspace/worker'
import { USERS_COLUMNS } from 'deepspace/worker'

/**
 * users — account profile (CONTRACT §1.3). Extends the required USERS_COLUMNS
 * baseline (never rename/replace it). read:'own' for EVERY role, including admin
 * (no firehose): members never read each other's `users` rows. Co-member identity
 * (displayName / avatarUrl / opted-in paymentHandles) is denormalized onto each
 * `groupMembers` row instead, so `users` stays private.
 */
export const usersSchema: CollectionSchema = {
  name: 'users',
  columns: [
    ...USERS_COLUMNS,
    { name: 'displayName', storage: 'text', interpretation: 'plain' },
    { name: 'avatarUrl', storage: 'text', interpretation: 'plain' },
    { name: 'defaultCurrency', storage: 'text', interpretation: 'plain', default: 'USD' },
    // { venmo?, paypalMe?, cashtag?, upiId? } — opt-in, powers settle-up deep links
    { name: 'paymentHandles', storage: 'text', interpretation: { kind: 'json' } },
    // { added, settled, comments, reminders, weekly } per-channel toggles
    { name: 'notifyPrefs', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'createdAtMs', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: 'own', delete: false },
    member: { read: 'own', create: false, update: 'own', delete: false },
    admin: { read: 'own', create: false, update: 'own', delete: false },
  },
}
