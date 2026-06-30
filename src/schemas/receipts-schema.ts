import type { CollectionSchema } from 'deepspace/worker'
import { COLLAB_FIELD, groupScopedPermissions, memberIdsColumn } from './_shared'

/**
 * receipts — R2 image ref + parsed line items + per-item claims (CONTRACT §1.9).
 * Member-scoped (read:'shared'). Writes LOCKED off the client (create/update/
 * delete:false): the scanReceipt server action owns every write, and it validates
 * the `imageUrl` (https + our own files origin) before any vision fetch — a direct
 * client create('receipts', { imageUrl:'javascript:…' }) is exactly what this
 * lock + that validation prevent (stored-XSS / SSRF source). Image uploaded to R2
 * at scope:'app' (publicly readable, works as <img> and as Claude vision input).
 * `parsed` holds the AI output; `claims` maps itemId -> memberId[]. Always shown
 * for human edit and run through scan-vs-total reconciliation before save (D9).
 */
export const receiptsSchema: CollectionSchema = {
  name: 'receipts',
  collaboratorsField: COLLAB_FIELD,
  columns: [
    { name: 'groupId', storage: 'text', interpretation: 'plain', required: true },
    memberIdsColumn,
    { name: 'expenseId', storage: 'text', interpretation: 'plain' },
    { name: 'r2Key', storage: 'text', interpretation: 'plain', required: true },
    { name: 'imageUrl', storage: 'text', interpretation: { kind: 'url' }, required: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['parsing', 'parsed', 'low_confidence', 'failed', 'confirmed'] }, default: 'parsing' },
    { name: 'parsed', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'claims', storage: 'text', interpretation: { kind: 'json' } },
    // the model actually used for the parse (NOT a stale catalog default)
    { name: 'model', storage: 'text', interpretation: 'plain' },
    { name: 'confidence', storage: 'text', interpretation: { kind: 'select', options: ['high', 'medium', 'low'] } },
  ],
  permissions: groupScopedPermissions({ create: false, update: false, del: false }),
}
