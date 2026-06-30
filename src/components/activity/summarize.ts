/**
 * summarize — turn an immutable `activity` row (CONTRACT §1.11) into the human
 * line the feed renders: an actor-aware sentence ("You added \"Dinner\"",
 * "Theo paid you", "Mara created the group"), an optional money amount, the
 * icon/tone (reused from the shell's `activityMeta`), a coarse filter bucket,
 * and a deep link to the affected record.
 *
 * Pure + presentation-only. The before/after snapshot the actions write
 * (`payload.before` / `payload.after`) is the source for descriptions and
 * amounts; `payload.summary` is the graceful fallback when a field is missing.
 */

import type { ComponentType } from 'react'
import type { RecordData } from 'deepspace'
import { formatMoney, type IconProps, type TileTone } from '../../design'
import { activityMeta } from '../app/shell-data'
import type { ActivityData, ActivityType } from '../../lib/data/types'

/** Coarse filter buckets for the type filter (15 raw types collapse to 4). */
export type ActivityBucket = 'expenses' | 'payments' | 'people' | 'updates'

/** A resolved feed line, ready for `ActivityRow`. */
export interface ActivityLine {
  Icon: ComponentType<IconProps>
  tone: TileTone
  /** Actor-aware sentence. */
  title: string
  /** Pre-formatted money string, when the row carries an amount. */
  amount?: string
  /** Tint the amount green for incoming payments; plain ink otherwise. */
  amountTone?: 'owe' | 'owed' | 'neutral'
  /** Deep link to the affected record, or null when there is nothing to open. */
  href: string | null
  bucket: ActivityBucket
}

/** Resolve a member id to a display name *within a group* (per-membership). */
export type NameResolver = (groupId: string, memberId: string | null | undefined) => string

/** Snapshot half of `payload` — loosely typed; fields are best-effort. */
interface Snapshot {
  description?: string
  amountMinor?: number
  currency?: string
  fromUserId?: string
  toUserId?: string
  name?: string
}

const quote = (s?: string | null): string => (s ? `“${s}”` : '')

/** Lowercase only the first character (to splice a stored summary after "You"). */
function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

/** Which filter bucket a raw activity type belongs to. */
export function activityBucket(type: ActivityType): ActivityBucket {
  switch (type) {
    case 'expense.created':
    case 'expense.edited':
    case 'expense.deleted':
    case 'expense.restored':
    case 'receipt.scanned':
    case 'recurring.created':
    case 'recurring.materialized':
      return 'expenses'
    case 'settlement.recorded':
    case 'settlement.deleted':
      return 'payments'
    case 'member.added':
    case 'member.removed':
    case 'member.left':
    case 'comment.added':
      return 'people'
    default:
      return 'updates'
  }
}

/** Deep link to the record an activity row refers to (CONTRACT §3.10). */
function deepLink(a: ActivityData): string | null {
  const gid = a.groupId
  if (!gid) return null
  switch (a.type) {
    case 'expense.created':
    case 'expense.edited':
    case 'expense.deleted':
    case 'expense.restored':
      // The expense detail page reads soft-deleted rows too, so a deleted
      // expense still opens (with its restore affordance).
      return a.targetId ? `/app/g/${gid}/expense/${a.targetId}` : `/app/g/${gid}`
    case 'recurring.created':
    case 'recurring.materialized':
      return `/app/g/${gid}/recurring`
    case 'member.added':
    case 'member.removed':
    case 'member.left':
      return `/app/g/${gid}/settings`
    default:
      // settlements, receipts, group + comment events open the group itself.
      return `/app/g/${gid}`
  }
}

/**
 * Build the feed line for one activity row.
 * `viewerId` lets us say "You" / "you" instead of the member's name.
 */
export function summarizeActivity(
  rec: RecordData<ActivityData>,
  ctx: { viewerId: string | null; nameOf: NameResolver },
): ActivityLine {
  const a = rec.data
  const meta = activityMeta(a.type)
  const p = a.payload ?? {}
  const after = (p.after ?? {}) as Snapshot
  const before = (p.before ?? {}) as Snapshot

  const isViewer = (id: string | null | undefined): boolean => !!id && id === ctx.viewerId
  const name = (id: string | null | undefined): string => ctx.nameOf(a.groupId, id)
  const actor = isViewer(a.actorId) ? 'You' : name(a.actorId)

  let title = `${actor} ${lowerFirst(meta.label)}`
  let amount: string | undefined
  let amountTone: ActivityLine['amountTone']

  switch (a.type) {
    case 'expense.created':
    case 'expense.edited':
    case 'expense.restored': {
      const verb = a.type === 'expense.created' ? 'added' : a.type === 'expense.edited' ? 'edited' : 'restored'
      const desc = after.description ?? before.description
      title = desc ? `${actor} ${verb} ${quote(desc)}` : `${actor} ${verb} an expense`
      if (after.amountMinor != null) amount = formatMoney(after.amountMinor, after.currency ?? 'USD')
      break
    }
    case 'expense.deleted': {
      const desc = before.description
      title = desc ? `${actor} deleted ${quote(desc)}` : `${actor} deleted an expense`
      if (before.amountMinor != null) amount = formatMoney(before.amountMinor, before.currency ?? 'USD')
      break
    }
    case 'settlement.recorded': {
      const fromLabel = isViewer(after.fromUserId) ? 'You' : name(after.fromUserId)
      const toLabel = isViewer(after.toUserId) ? 'you' : name(after.toUserId)
      title = `${fromLabel} paid ${toLabel}`
      if (after.amountMinor != null) {
        amount = formatMoney(after.amountMinor, after.currency ?? 'USD')
        amountTone = 'owed'
      }
      break
    }
    case 'settlement.deleted': {
      title = `${actor} removed a payment`
      if (before.amountMinor != null) amount = formatMoney(before.amountMinor, before.currency ?? 'USD')
      break
    }
    case 'receipt.scanned': {
      title = p.summary ? `${actor} ${lowerFirst(p.summary)}` : `${actor} scanned a receipt`
      break
    }
    case 'group.created': {
      title = `${actor} created the group`
      break
    }
    case 'group.renamed': {
      title = after.name ? `${actor} renamed the group to ${quote(after.name)}` : `${actor} renamed the group`
      break
    }
    case 'member.added':
    case 'member.removed':
    case 'member.left': {
      // The stored summary already reads as a complete sentence about the
      // member ("Theo joined…", "Theo removed", "Theo marked inactive").
      title = p.summary ?? lowerFirst(meta.label)
      break
    }
    case 'recurring.created': {
      title = `${actor} set up a recurring expense`
      break
    }
    case 'recurring.materialized': {
      const desc = after.description
      title = desc ? `Recurring ${quote(desc)} posted` : 'A recurring expense posted'
      if (after.amountMinor != null) amount = formatMoney(after.amountMinor, after.currency ?? 'USD')
      break
    }
    case 'comment.added': {
      title = `${actor} commented`
      break
    }
    default: {
      title = p.summary ? `${actor} ${lowerFirst(p.summary)}` : `${actor} ${lowerFirst(meta.label)}`
    }
  }

  return {
    Icon: meta.Icon,
    tone: meta.tone,
    title,
    amount,
    amountTone,
    href: deepLink(a),
    bucket: activityBucket(a.type),
  }
}
