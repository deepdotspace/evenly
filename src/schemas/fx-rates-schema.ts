import type { CollectionSchema } from 'deepspace/worker'

/**
 * fxRates — worker-written daily FX cache (CONTRACT §1.13). The ONLY public-read
 * collection: non-sensitive reference data with no owner, so read:true for every
 * role (including '*' anonymous) is correct and intentional. Rows are written by a
 * worker cron / server action (tools.* bypasses RBAC), so NO client role gets
 * create/update/delete. Cross-rate: rate(A->B) = rates[B] / rates[A].
 */
export const fxRatesSchema: CollectionSchema = {
  name: 'fxRates',
  columns: [
    { name: 'base', storage: 'text', interpretation: 'plain', default: 'USD' },
    // { [code]: number } major-unit rates vs base
    { name: 'rates', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'fetchedAtMs', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: false },
  },
}
