import type { CollectionSchema } from 'deepspace/worker'

/**
 * contacts — per-user address book for autocomplete / "add friend" (CONTRACT §1.4).
 * Private to its owner: read/write all `'own'`. `ownerUserId` is the ownerField and
 * is userBound+immutable, so the DO stamps it from the verified JWT (no spoofing).
 * Created/updated via server action with query-then-update by (ownerUserId,
 * contactUserId) — never trust a deterministic recordId (SDK footgun #7).
 */
export const contactsSchema: CollectionSchema = {
  name: 'contacts',
  ownerField: 'ownerUserId',
  columns: [
    { name: 'ownerUserId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'contactUserId', storage: 'text', interpretation: 'plain' },
    { name: 'contactGuestId', storage: 'text', interpretation: 'plain' },
    { name: 'cachedName', storage: 'text', interpretation: 'plain' },
    { name: 'cachedAvatarUrl', storage: 'text', interpretation: 'plain' },
    { name: 'email', storage: 'text', interpretation: { kind: 'email' } },
    { name: 'lastSplitAtMs', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: 'own', delete: 'own' },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    admin: { read: 'own', create: true, update: 'own', delete: 'own' },
  },
}
