/**
 * Guest-claim rewrite (CONTRACT §1.6, §4 "Guest / placeholder members"). When an
 * invited person signs up, their `guest:<uuid>` ledger identity is rewritten to
 * their real `userId` across every row of the group -- memberIds, paidBy/splits
 * maps, splitConfig participants, settlement endpoints, receipt claims, and the
 * groupMembers row. Idempotent: a row that no longer references the guest is
 * skipped, so a crashed/retried run never double-applies.
 *
 * Order matters for crash-safety: rewrite all child rows FIRST, then flip the
 * group's `memberIds` LAST. A re-run before the final flip still sees the guest in
 * `group.memberIds` and re-processes the (already-idempotent) rows.
 *
 * Runs inline for small groups; the `claim-guest` Job reuses `runClaimGuest` with
 * owner-scoped tools for large ones (D5, subrequest ceiling).
 */

import type { ActionTools } from 'deepspace/worker'
import type { Claims, MemberId, Shares, SplitConfig } from '../lib/data/types'
import { GROUP_SCOPED, loadGroup, queryAll, type RecordEnvelope } from './helpers'

/** Bounded number of row WRITES per Job tick (keeps a big fan-out under the Worker
 *  subrequest ceiling; each tick also does ~7 unbounded reads). */
export const RESTAMP_CHUNK = 25

export interface ClaimIdentity {
  displayName?: string
  avatarUrl?: string | null
  paymentHandles?: unknown
}

export interface ClaimGuestArgs {
  groupId: string
  guestId: string
  userId: string
  identity?: ClaimIdentity
}

export interface ClaimGuestResult {
  claimed: boolean
  rewritten: number
  /** false = the per-tick write cap was hit before finishing; the Job should
   *  `ctx.continue` and run another idempotent pass. true = fully applied. */
  done: boolean
  noop?: boolean
  error?: string
}

/** Rename a key in a shares map, merging into an existing target key. */
function renameShareKey(map: Shares | undefined, from: MemberId, to: MemberId): { map: Shares; changed: boolean } {
  if (!map || !(from in map)) return { map: map ?? {}, changed: false }
  const out: Shares = {}
  for (const [k, v] of Object.entries(map)) {
    const key = k === from ? to : k
    out[key] = (out[key] ?? 0) + v
  }
  return { map: out, changed: true }
}

/** Replace an id in a string array, de-duplicating. */
function renameInArray(arr: MemberId[] | undefined, from: MemberId, to: MemberId): { arr: MemberId[]; changed: boolean } {
  if (!arr || !arr.includes(from)) return { arr: arr ?? [], changed: false }
  const out: MemberId[] = []
  for (const id of arr) {
    const next = id === from ? to : id
    if (!out.includes(next)) out.push(next)
  }
  return { arr: out, changed: true }
}

/** Rewrite a splitConfig's participant array + per-member maps. */
function renameSplitConfig(cfg: SplitConfig | undefined, from: MemberId, to: MemberId): { cfg: SplitConfig; changed: boolean } {
  if (!cfg) return { cfg: cfg as unknown as SplitConfig, changed: false }
  let changed = false
  const next: SplitConfig = { ...cfg }

  const parts = renameInArray(cfg.participants, from, to)
  if (parts.changed) {
    next.participants = parts.arr
    changed = true
  }
  for (const field of ['exactAmounts', 'percents', 'weights', 'adjustments'] as const) {
    const m = cfg[field] as Shares | undefined
    const r = renameShareKey(m, from, to)
    if (r.changed) {
      next[field] = r.map
      changed = true
    }
  }
  return { cfg: next, changed }
}

/** Build the rewrite patch for one row of a given collection (empty = no change). */
function rowPatch(
  collection: string,
  rec: RecordEnvelope<Record<string, unknown>>,
  from: MemberId,
  to: MemberId,
  identity?: ClaimIdentity,
): Record<string, unknown> | null {
  const data = rec.data
  const patch: Record<string, unknown> = {}

  const members = renameInArray(data.memberIds as MemberId[] | undefined, from, to)
  if (members.changed) patch.memberIds = members.arr

  if (collection === 'expenses' || collection === 'recurringExpenses') {
    const template = collection === 'recurringExpenses' ? (data.template as Record<string, unknown> | undefined) : null
    const paidBySrc = (collection === 'expenses' ? data.paidBy : template?.paidBy) as Shares | undefined
    const splitsSrc = data.splits as Shares | undefined
    const cfgSrc = (collection === 'expenses' ? data.splitConfig : template?.splitConfig) as SplitConfig | undefined

    const paid = renameShareKey(paidBySrc, from, to)
    const splits = renameShareKey(splitsSrc, from, to)
    const cfg = renameSplitConfig(cfgSrc, from, to)

    if (collection === 'expenses') {
      if (paid.changed) patch.paidBy = paid.map
      if (splits.changed) patch.splits = splits.map
      if (cfg.changed) patch.splitConfig = cfg.cfg
    } else if (template && (paid.changed || cfg.changed)) {
      patch.template = { ...template, ...(paid.changed ? { paidBy: paid.map } : {}), ...(cfg.changed ? { splitConfig: cfg.cfg } : {}) }
    }
  }

  if (collection === 'settlements') {
    if (data.fromUserId === from) patch.fromUserId = to
    if (data.toUserId === from) patch.toUserId = to
  }

  if (collection === 'receipts') {
    const claims = data.claims as Claims | undefined
    if (claims) {
      let claimsChanged = false
      const next: Claims = {}
      for (const [itemId, ids] of Object.entries(claims)) {
        const r = renameInArray(ids, from, to)
        next[itemId] = r.arr
        if (r.changed) claimsChanged = true
      }
      if (claimsChanged) patch.claims = next
    }
  }

  if (collection === 'groupMembers' && data.guestId === from) {
    patch.userId = to
    patch.guestId = null
    patch.status = 'active'
    if (identity?.displayName) patch.displayName = identity.displayName
    if (identity?.avatarUrl !== undefined) patch.avatarUrl = identity.avatarUrl
    if (identity?.paymentHandles !== undefined) patch.paymentHandles = identity.paymentHandles
  }

  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * Run the guest -> user rewrite over a group. Idempotent (a row that no longer
 * references the guest is skipped), and crash-safe (child rows rewritten FIRST,
 * group.memberIds flipped LAST — a re-run before the flip still re-processes).
 *
 * Pass `opts.maxWrites` to bound the WRITES this pass performs: when the cap is
 * hit it returns `{ done:false }` WITHOUT flipping group.memberIds, so the Job can
 * `ctx.continue` and run another idempotent pass that picks up the remaining rows.
 * The group flip happens only on a clean pass that completes under the cap, which
 * is also the convergence signal (`done:true`). Inline (no `maxWrites`) always
 * completes in one call.
 */
export async function runClaimGuest(
  tools: ActionTools,
  args: ClaimGuestArgs,
  opts?: { maxWrites?: number },
): Promise<ClaimGuestResult> {
  const { groupId, guestId, userId, identity } = args
  const g = await loadGroup(tools, groupId)
  if (!g.ok) return { claimed: false, rewritten: 0, done: true, error: g.error }

  if (!(g.record.data.memberIds ?? []).includes(guestId)) {
    return { claimed: true, rewritten: 0, done: true, noop: true } // already claimed
  }

  const cap = opts?.maxWrites
  let rewritten = 0
  for (const collection of GROUP_SCOPED) {
    const rows = await queryAll<Record<string, unknown>>(tools, collection, { groupId })
    for (const rec of rows) {
      const patch = rowPatch(collection, rec, guestId, userId, identity)
      if (patch) {
        await tools.update(collection, rec.recordId, patch)
        rewritten++
        if (cap && rewritten >= cap) {
          // Hit the per-tick cap mid-fan-out: yield WITHOUT flipping memberIds.
          return { claimed: true, rewritten, done: false }
        }
      }
    }
  }

  // Flip the group's membership LAST (crash-safety -- see file header).
  const nextMembers = renameInArray(g.record.data.memberIds, guestId, userId)
  if (nextMembers.changed) {
    await tools.update('groups', groupId, { memberIds: nextMembers.arr })
    rewritten++
  }

  return { claimed: true, rewritten, done: true }
}

/**
 * Re-stamp a group's denormalized `memberIds` onto every group-scoped child row
 * (the fan-out `addGroupMember` needs so a new member's `canRead()` filter matches
 * the older rows). Idempotent: a row already carrying `memberId` is skipped, so a
 * Job that yields and resumes never double-writes and always makes forward progress.
 *
 * `opts.maxWrites` bounds the WRITES per pass; `done:false` means more rows remain
 * (the Job should `ctx.continue` for another pass). Does NOT touch the `groups` row
 * itself — the caller owns that O(1) write.
 */
export async function restampMemberIds(
  tools: ActionTools,
  args: { groupId: string; memberId: MemberId; nextMemberIds: MemberId[] },
  opts?: { maxWrites?: number },
): Promise<{ done: boolean; written: number }> {
  const { groupId, memberId, nextMemberIds } = args
  const cap = opts?.maxWrites
  let written = 0
  for (const collection of GROUP_SCOPED) {
    const rows = await queryAll<{ memberIds?: MemberId[] }>(tools, collection, { groupId })
    for (const r of rows) {
      if ((r.data.memberIds ?? []).includes(memberId)) continue // already stamped
      const res = await tools.update(collection, r.recordId, { memberIds: nextMemberIds })
      if (res.success) written++
      if (cap && written >= cap) return { done: false, written }
    }
  }
  return { done: true, written }
}

/** Estimate the group-scoped row count to decide inline vs Job (D5). */
export async function estimateGroupRowCount(tools: ActionTools, groupId: string): Promise<number> {
  let total = 0
  for (const collection of GROUP_SCOPED) {
    const rows = await queryAll(tools, collection, { groupId })
    total += rows.length
  }
  return total
}
