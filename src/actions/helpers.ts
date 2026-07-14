/**
 * Shared server-action helpers (CONTRACT §0, §8). Authorization, record loading,
 * audit logging, and FX snapshotting -- the building blocks every action composes.
 *
 * `tools.*` bypass user RBAC (they run "as the app"), so every action MUST
 * authorize the caller itself: any active member for ledger writes (D8), the
 * admin/creator for group-structure changes. Reads/casts go through `loadRecord`
 * / `queryRecords` so we never pass our interface types as the `T extends
 * Record<string,unknown>` generic (interfaces lack the index signature the SDK
 * generic requires) -- we cast the wire result instead.
 */

import type { ActionResult, ActionTools } from 'deepspace/worker'
import { snapshotFxRate, type FxSnapshot } from '../lib/fx'
import type {
  ActivityPayload,
  ActivityType,
  FxRatesData,
  GroupData,
  MemberId,
  Shares,
} from '../lib/data/types'

/** A DeepSpace record envelope as it arrives over the tools wire. */
export interface RecordEnvelope<T> {
  recordId: string
  data: T
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** Collections that carry a denormalized `memberIds` and belong to a group. */
export const GROUP_SCOPED = [
  'groupMembers',
  'expenses',
  'settlements',
  'receipts',
  'comments',
  'activity',
  'recurringExpenses',
] as const

/** Row counts above this fan-out threshold push a re-stamp/claim into a Job (D5). */
export const LARGE_GROUP_ROW_THRESHOLD = 60

export type Fail = { success: false; error: string }
export type Ok<T> = { success: true; data: T }

export function fail(error: string): Fail {
  return { success: false, error }
}
export function ok<T>(data: T): Ok<T> {
  return { success: true, data }
}

/* ---------------------------------------------------------------- identity */

/** The identity fields we can read off a `users` row: the app's own opt-in
 *  `displayName`, plus the SDK baseline `name` / `email` that `registerUser`
 *  populates at connect. */
export interface IdentityFields {
  displayName?: string | null
  name?: string | null
  email?: string | null
}

/**
 * The name to show for a real member, best-first: the name they set themselves,
 * then the identity the SDK already holds (OAuth/display name), then the email
 * local-part (e.g. `heidi.serendipity`), and only then a neutral last resort.
 *
 * This is the single source of truth for turning an account into a member label,
 * so no code path ever persists a placeholder like "You"/"Member" for someone
 * whose real identity was available the whole time (the account always has at
 * least an email). Guest placeholders are named by whoever added them and never
 * go through here.
 */
export function resolveDisplayName(id: IdentityFields | null | undefined): string {
  const custom = id?.displayName?.trim()
  if (custom) return custom
  const name = id?.name?.trim()
  if (name) return name
  const local = id?.email?.trim().split('@')[0]?.trim()
  if (local) return local
  return 'Member'
}

/* --------------------------------------------------------------- record I/O */

export type LoadResult<T> = { ok: true; record: RecordEnvelope<T> } | { ok: false; error: string }

/** Load one record and cast its `.data` to `T` (the tools generic can't take an interface). */
export async function loadRecord<T>(
  tools: ActionTools,
  collection: string,
  recordId: string,
): Promise<LoadResult<T>> {
  const res = await tools.get(collection, recordId)
  if (!res.success) return { ok: false, error: res.error }
  return { ok: true, record: res.data.record as unknown as RecordEnvelope<T> }
}

/** Query records and cast to typed envelopes (empty array on failure). */
export async function queryRecords<T>(
  tools: ActionTools,
  collection: string,
  opts?: { where?: Record<string, unknown>; orderBy?: string; orderDir?: 'asc' | 'desc'; limit?: number },
): Promise<RecordEnvelope<T>[]> {
  const res = await tools.query(collection, opts)
  if (!res.success) return []
  return res.data.records as unknown as RecordEnvelope<T>[]
}

/**
 * Scan EVERY row of a collection matching `where`. The single entry point for the
 * app's "scan all of a group's rows" loops (re-stamp, remove-member balance gate,
 * recurring dedupe, cascade delete, import dedupe, guest claim).
 *
 * The 0.4.3 `records.query` tool applies a SQL `LIMIT` *only* when a `limit` is
 * passed, and exposes NO offset/cursor param — verified directly in the SDK bundle
 * (`node_modules/deepspace/dist/worker.js`, `executeTableQuery`: the clause is
 * `if (query.limit) sql += " LIMIT ?"`, and the tool's param list is just
 * collection/where/orderBy/orderDir/limit). So an unbounded query returns the full
 * result set in one round-trip — there is no implicit 50-row page to defeat, and
 * because there is no cursor there is nothing to paginate THROUGH. Centralizing the
 * scan here means that if a future SDK ever introduces an implicit cap, this is the
 * one place to add real pagination. (The write fan-out a big scan feeds is the part
 * that can hit the Worker subrequest ceiling — that is bounded via chunked Jobs,
 * not here.)
 */
export async function queryAll<T>(
  tools: ActionTools,
  collection: string,
  where?: Record<string, unknown>,
): Promise<RecordEnvelope<T>[]> {
  return queryRecords<T>(tools, collection, where ? { where } : undefined)
}

/* ------------------------------------------------------------ authorization */

export async function loadGroup(
  tools: ActionTools,
  groupId: string,
): Promise<LoadResult<GroupData>> {
  return loadRecord<GroupData>(tools, 'groups', groupId)
}

/** Any current member of the group (ledger writes, D8). */
export function isMember(group: RecordEnvelope<GroupData>, userId: string): boolean {
  return (group.data.memberIds ?? []).includes(userId) || group.createdBy === userId
}

/** The admin/creator (group-structure changes: members, rename, currency, archive). */
export function isAdmin(group: RecordEnvelope<GroupData>, userId: string): boolean {
  return (group.data.adminIds ?? []).includes(userId) || group.createdBy === userId
}

/* ------------------------------------------------------------------- audit */

/** Append an immutable `activity` row (CONTRACT D7, §1.11). Best-effort. */
export async function logActivity(
  tools: ActionTools,
  args: {
    groupId: string
    memberIds: MemberId[]
    type: ActivityType
    actorId: string
    targetId?: string | null
    payload?: ActivityPayload | null
  },
): Promise<void> {
  await tools.create('activity', {
    groupId: args.groupId,
    memberIds: args.memberIds,
    type: args.type,
    actorId: args.actorId,
    targetId: args.targetId ?? null,
    payload: args.payload ?? null,
  })
}

/* ---------------------------------------------------------------------- FX */

/** Load the FX cache rows (CONTRACT §1.13). */
export async function loadFxRows(tools: ActionTools): Promise<FxRatesData[]> {
  const rows = await queryRecords<FxRatesData>(tools, 'fxRates', { limit: 5 })
  return rows.map((r) => r.data)
}

/** Snapshot the entry-time FX rate for a row's currency (CONTRACT D4, §1.1). */
export async function snapshotFor(
  tools: ActionTools,
  currency: string,
  primaryCurrency: string,
  manualRate?: number | null,
): Promise<FxSnapshot | null> {
  const rows = await loadFxRows(tools)
  return snapshotFxRate({ currency, primaryCurrency, rows, manualRate })
}

/* ------------------------------------------------------------------ money */

export function sumShares(s: Shares): number {
  let total = 0
  for (const v of Object.values(s)) total += v
  return total
}

/**
 * The first id in `keys` that is not a current group member, or `null` if all are
 * members. Used to reject expense `paidBy` / resolved `splits` that reference a
 * phantom participant (a non-member or another group's id) before it pollutes the
 * group's derived balance graph (D8 integrity). RBAC is unaffected (the row's
 * `memberIds` stamp is always the group's), so this is data integrity, not authz.
 */
export function nonMemberKey(keys: Iterable<string>, memberIds: MemberId[]): string | null {
  const set = new Set(memberIds)
  for (const k of keys) if (!set.has(k)) return k
  return null
}

/** The single dominant payer (largest `paidBy` entry); used for treat / unclaimed-payer. */
export function derivePayerId(paidBy: Shares): MemberId | undefined {
  let best: MemberId | undefined
  let max = -Infinity
  for (const [id, v] of Object.entries(paidBy)) {
    if (v > max) {
      max = v
      best = id
    }
  }
  return best
}

/** A normalized result type widening any helper failure to the ActionResult union. */
export type AnyResult = ActionResult
