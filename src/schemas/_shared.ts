/**
 * Shared RBAC building blocks for Evenly's member-scoped collections.
 *
 * THE LOAD-BEARING ARCHITECTURE (CONTRACT D1):
 * Every group-scoped collection carries a denormalized `memberIds: string[]`
 * column, declared as the schema's `collaboratorsField`, and grants `read: 'shared'`
 * to every role. With NO `visibilityField` declared, the DO's `canRead()` resolves
 * `'shared'` to exactly:  isOwner(creator)  OR  memberIds.includes(connectingUserId).
 *
 * That check runs SERVER-SIDE in the RecordRoom DO before any row is returned —
 * both on initial query hydration and on every live realtime subscription push —
 * so a non-member receives ZERO of a group's rows over the WebSocket. The client
 * `where` clause is convenience only; this is the real boundary.
 *
 * NO role ever gets `read: true` on group data. In particular `admin` is `'shared'`,
 * NOT `true`, so the app owner does not receive a firehose of every group's rows.
 * `fxRates` is the only public-read collection (non-sensitive reference data).
 */

import type { CollectionSchema } from 'deepspace/worker'

/** The denormalized membership column used as `collaboratorsField` everywhere. */
export const COLLAB_FIELD = 'memberIds'

type Permissions = CollectionSchema['permissions']
type WriteLevel = 'shared' | 'own' | false

/**
 * Permissions for a group-scoped collection.
 *
 * WRITES ARE LOCKED OFF THE CLIENT. Every group-scoped collection is
 * `create:false / update:false / delete:false` for all connecting roles, so a
 * crafted WebSocket client (or the prompt-injectable AI assistant, which runs
 * under the caller's RBAC) CANNOT write group rows directly. All membership /
 * ledger / audit writes go through the validated server actions, which set the
 * `X-App-Action` header and therefore `skipUserRbac` in the DO — they bypass
 * these checks (verified: worker.js putRecord/deleteRecord gate canCreate/
 * canUpdate/canDelete behind `if (!skipUserRbac)`). This is what makes the D8
 * admin gate, the Σ-conservation invariant, and the append-only audit trail
 * actually enforceable rather than advisory.
 *
 * - read: always `'shared'` for member/admin/viewer (never `true`).
 * - `'*'` (unauthenticated): fully denied — anonymous connections get nothing.
 *
 * The opts default to fully locked (secure by default); they exist only so a
 * collection can opt INTO a narrow client-writable field set if it ever needs
 * one. No Evenly collection does today.
 *
 * @param create whether a signed-in member may create rows from the client.
 *               Defaults `false` — creation goes through a server action.
 * @param update who may edit existing rows from the client: `false` (default,
 *               writes go through server actions), `'shared'` = any group member,
 *               `'own'` = creator only.
 * @param del    `false` (default, no client hard-delete; the product uses
 *               soft-delete via `deletedAt`, D7) or `'own'` = creator may delete.
 */
export function groupScopedPermissions(opts: {
  create?: boolean
  update?: WriteLevel
  del?: 'own' | false
} = {}): Permissions {
  const create = opts.create ?? false
  const update: WriteLevel = opts.update ?? false
  const del = opts.del ?? false
  return {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'shared', create: false, update: false, delete: false },
    member: { read: 'shared', create, update, delete: del },
    admin: { read: 'shared', create, update, delete: del },
  }
}

/** The `memberIds` collaborators column. Required: an unstamped row is orphaned. */
export const memberIdsColumn = {
  name: COLLAB_FIELD,
  storage: 'text' as const,
  interpretation: { kind: 'json' as const },
  required: true,
}
