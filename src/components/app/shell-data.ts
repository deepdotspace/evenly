/**
 * Shell data + formatting helpers (CONTRACT §3.3, §3.4, §2.7-§2.10).
 *
 * `useGroupSummaries` is the one place per-group viewer balances are derived for
 * the left rail AND the dashboard. It nets each group from the (member-scoped)
 * global expense/settlement streams via the pure selectors — balances are never
 * stored (D2). The SDK dedupes the underlying `useQuery`s, so calling this from
 * both the shell and the dashboard costs one set of subscriptions.
 *
 * Per-group figures use each row's stored FX snapshot (exact); we pass no live
 * resolver here. The cross-group dashboard rollup (today's rates) lives in the
 * dashboard itself via `overallNet`.
 */

import { useMemo } from 'react'
import { useAuth, type RecordData } from 'deepspace'
import { useGroups, useExpenses, useSettlements } from '../../hooks'
import { groupNet, viewerNet } from '../../lib/data'
import type { GroupData, GroupKind } from '../../lib/data/types'
import {
  BellIcon,
  CameraIcon,
  CheckIcon,
  EqualsIcon,
  HomeIcon,
  InfoIcon,
  ReceiptIcon,
  TagIcon,
  UsersIcon,
  type IconProps,
  type TileTone,
} from '../../design'
import type { ComponentType } from 'react'
import type { ActivityType } from '../../lib/data/types'

export type LoadStatus = 'loading' | 'ready' | 'error'

export interface GroupSummary {
  group: RecordData<GroupData>
  /** Signed net for the viewer in this group's primary currency (>0 owed, <0 owe). */
  viewerNet: number
  /** Latest ledger timestamp in the group (ms), 0 if none yet. */
  lastActivityMs: number
}

export interface GroupSummariesState {
  summaries: GroupSummary[]
  status: LoadStatus
  userId: string | null
  error?: string
}

function combine(...s: LoadStatus[]): LoadStatus {
  if (s.includes('error')) return 'error'
  if (s.includes('loading')) return 'loading'
  return 'ready'
}

/** Per-group viewer balances for the rail + dashboard, sorted by recent activity. */
export function useGroupSummaries(): GroupSummariesState {
  const { userId } = useAuth()
  const groups = useGroups()
  const expenses = useExpenses(undefined)
  const settlements = useSettlements(undefined)

  const summaries = useMemo<GroupSummary[]>(() => {
    if (!userId) return []
    const rows = groups.records.map((g) => {
      const gid = g.recordId
      const gExpenses = expenses.records.filter((e) => e.data.groupId === gid)
      const gSettlements = settlements.records.filter((s) => s.data.groupId === gid)
      const net = groupNet(g, gExpenses, gSettlements)
      let lastMs = 0
      for (const e of gExpenses) lastMs = Math.max(lastMs, e.data.expenseAtMs ?? 0)
      for (const s of gSettlements) lastMs = Math.max(lastMs, s.data.settledAtMs ?? 0)
      return { group: g, viewerNet: viewerNet(net, userId), lastActivityMs: lastMs }
    })
    rows.sort((a, b) => b.lastActivityMs - a.lastActivityMs)
    return rows
  }, [groups.records, expenses.records, settlements.records, userId])

  return {
    summaries,
    status: combine(groups.status, expenses.status, settlements.status),
    userId: userId ?? null,
    error: groups.error ?? expenses.error ?? settlements.error,
  }
}

/* ---------------------------------------------------------------- formatting */

const MIN = 60_000
const HR = 3_600_000
const DAY = 86_400_000

/** A short relative time ("just now", "5m", "3h", "2d") or a "Jun 12" date.
 *  Accepts a ms number or an ISO string (RecordData timestamps are ISO). */
export function timeAgo(input: number | string | undefined | null, now = Date.now()): string {
  if (input == null || input === '') return ''
  const ms = typeof input === 'string' ? Date.parse(input) : input
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const d = now - ms
  if (d < 0) return 'just now'
  if (d < MIN) return 'just now'
  if (d < HR) return `${Math.floor(d / MIN)}m ago`
  if (d < DAY) return `${Math.floor(d / HR)}h ago`
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export interface KindMeta {
  label: string
  Icon: ComponentType<IconProps>
}

/** Presentation metadata for a group `kind` (D6 — kind is presentation only). */
export function kindMeta(kind: GroupKind): KindMeta {
  switch (kind) {
    case 'pair':
      return { label: 'Friend', Icon: UsersIcon }
    case 'oneoff':
      return { label: 'Quick split', Icon: ReceiptIcon }
    default:
      return { label: 'Group', Icon: HomeIcon }
  }
}

export interface ActivityMeta {
  Icon: ComponentType<IconProps>
  tone: TileTone
  /** Fallback line when the activity row carries no `payload.summary`. */
  label: string
}

/** Icon + tone + fallback line for an activity feed row (CONTRACT §3.10). */
export function activityMeta(type: ActivityType): ActivityMeta {
  switch (type) {
    case 'expense.created':
      return { Icon: ReceiptIcon, tone: 'warm', label: 'Expense added' }
    case 'expense.edited':
      return { Icon: ReceiptIcon, tone: 'neutral', label: 'Expense edited' }
    case 'expense.deleted':
      return { Icon: ReceiptIcon, tone: 'neutral', label: 'Expense deleted' }
    case 'expense.restored':
      return { Icon: ReceiptIcon, tone: 'neutral', label: 'Expense restored' }
    case 'settlement.recorded':
      return { Icon: CheckIcon, tone: 'sage', label: 'Payment recorded' }
    case 'settlement.deleted':
      return { Icon: EqualsIcon, tone: 'neutral', label: 'Payment removed' }
    case 'member.added':
      return { Icon: UsersIcon, tone: 'neutral', label: 'Member added' }
    case 'member.removed':
      return { Icon: UsersIcon, tone: 'neutral', label: 'Member removed' }
    case 'member.left':
      return { Icon: UsersIcon, tone: 'neutral', label: 'Member left' }
    case 'comment.added':
      return { Icon: InfoIcon, tone: 'neutral', label: 'New comment' }
    case 'receipt.scanned':
      return { Icon: CameraIcon, tone: 'warm', label: 'Receipt scanned' }
    case 'group.created':
      return { Icon: HomeIcon, tone: 'honey', label: 'Group created' }
    case 'group.renamed':
      return { Icon: TagIcon, tone: 'neutral', label: 'Group renamed' }
    case 'recurring.created':
      return { Icon: BellIcon, tone: 'neutral', label: 'Recurring expense added' }
    case 'recurring.materialized':
      return { Icon: BellIcon, tone: 'neutral', label: 'Recurring expense posted' }
    default:
      return { Icon: InfoIcon, tone: 'neutral', label: 'Activity' }
  }
}
