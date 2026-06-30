/**
 * ActivityFeed — the cross-group history screen (`/app/activity`, CONTRACT §3.10).
 *
 * A reverse-chron stream of immutable `activity` rows, each rendered as an
 * actor-aware line ("You added \"Dinner\"", "Theo paid you") with a category /
 * type tile, relative time, and a deep link to the affected record. The feed is
 * sectioned by day (Today / Yesterday / date) and filterable by group and by
 * type. Empty, loading-skeleton, and inline-retry states included. Phone +
 * desktop share one warm column, matching the group view.
 */

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useQuery, type RecordData } from 'deepspace'
import {
  ActivityRow,
  AlertIcon,
  BellIcon,
  Button,
  ChevronDownIcon,
  EV,
  IconTile,
  MoneyText,
  PillTabs,
  SectionLabel,
} from '../../design'
import { useActivity, useGroups } from '../../hooks'
import { timeAgo } from '../app/shell-data'
import type { ActivityData, GroupMemberData } from '../../lib/data/types'
import { activityBucket, summarizeActivity, type ActivityBucket, type NameResolver } from './summarize'
import { groupByDay } from './grouping'

type TypeFilter = 'all' | ActivityBucket

const TYPE_TABS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'payments', label: 'Payments' },
  { id: 'people', label: 'People' },
]

export function ActivityFeed() {
  const { userId } = useAuth()
  const activity = useActivity()
  const groups = useGroups({ includeArchived: true })
  // Cross-group identity needs every membership the viewer can see; the
  // single-group `useGroupMembers(gid)` hook can't span groups, so we read the
  // member-scoped stream directly (the same query that hook wraps internally).
  const membersQ = useQuery<GroupMemberData>('groupMembers')

  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  // groupId -> display name (for labels + the group filter)
  const groupName = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups.records) m.set(g.recordId, g.data.name)
    return m
  }, [groups.records])

  // `${groupId}::${memberId}` -> display name (per-membership identity)
  const memberNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of membersQ.records) {
      const id = r.data.userId ?? r.data.guestId
      if (id) m.set(`${r.data.groupId}::${id}`, r.data.displayName)
    }
    return m
  }, [membersQ.records])

  const nameOf = useCallback<NameResolver>(
    (groupId, memberId) => {
      if (!memberId) return 'Someone'
      return memberNames.get(`${groupId}::${memberId}`) ?? (memberId.startsWith('guest:') ? 'a guest' : 'Someone')
    },
    [memberNames],
  )

  // Only offer groups that actually appear in the feed, so the filter stays tight.
  const groupOptions = useMemo(() => {
    const ids = new Set(activity.records.map((r) => r.data.groupId))
    return Array.from(ids)
      .map((id) => ({ id, name: groupName.get(id) ?? 'Group' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [activity.records, groupName])

  const filtered = useMemo(() => {
    let rows = activity.records
    if (groupFilter !== 'all') rows = rows.filter((r) => r.data.groupId === groupFilter)
    if (typeFilter !== 'all') rows = rows.filter((r) => activityBucket(r.data.type) === typeFilter)
    return rows
  }, [activity.records, groupFilter, typeFilter])

  const sections = useMemo(() => groupByDay(filtered), [filtered])

  const loading = activity.status === 'loading' && activity.records.length === 0
  const errored = activity.status === 'error'
  const filtersActive = groupFilter !== 'all' || typeFilter !== 'all'

  const clearFilters = () => {
    setGroupFilter('all')
    setTypeFilter('all')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 720 }}>
        {/* header */}
        <SectionLabel>Activity</SectionLabel>
        <h1
          style={{
            fontFamily: EV.fontDisplay,
            fontSize: 'clamp(26px, 4vw, 34px)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: EV.ink,
            marginTop: 4,
          }}
        >
          Everything that happened
        </h1>
        <p style={{ fontSize: 14, color: EV.ink55, marginTop: 6, maxWidth: 460, lineHeight: 1.5 }}>
          Every change across your groups, newest first: added, edited, settled.
        </p>

        {/* filters */}
        {(activity.records.length > 0 || filtersActive) && (
          <div
            className="flex flex-wrap items-center gap-2.5"
            style={{ marginTop: 22 }}
          >
            <PillTabs
              tabs={TYPE_TABS}
              value={typeFilter}
              onChange={(id) => setTypeFilter(id as TypeFilter)}
            />
            {groupOptions.length > 1 && (
              <GroupSelect
                value={groupFilter}
                options={groupOptions}
                onChange={setGroupFilter}
              />
            )}
          </div>
        )}

        {/* body */}
        <div style={{ marginTop: 26 }}>
          {loading ? (
            <FeedSkeleton />
          ) : errored ? (
            <InlineError />
          ) : sections.length === 0 ? (
            filtersActive ? (
              <EmptyState
                title="Nothing matches these filters"
                body="Try a different group or type."
                action={
                  <Button size="sm" variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No activity yet"
                body="As you and your group add expenses and settle up, every change shows up here."
              />
            )
          ) : (
            sections.map((section) => (
              <section key={section.key} style={{ marginBottom: 26 }}>
                <SectionLabel style={{ marginBottom: 4 }}>{section.label}</SectionLabel>
                {section.rows.map((rec, i) => (
                  <FeedRow
                    key={rec.recordId}
                    rec={rec}
                    viewerId={userId ?? null}
                    nameOf={nameOf}
                    groupLabel={groupFilter === 'all' ? groupName.get(rec.data.groupId) : undefined}
                    last={i === section.rows.length - 1}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- feed row */

function FeedRow({
  rec,
  viewerId,
  nameOf,
  groupLabel,
  last,
}: {
  rec: RecordData<ActivityData>
  viewerId: string | null
  nameOf: NameResolver
  groupLabel?: string
  last: boolean
}) {
  const navigate = useNavigate()
  const line = summarizeActivity(rec, { viewerId, nameOf })
  const { Icon } = line

  const when = timeAgo(rec.createdAt)
  const subtitle = [groupLabel, when].filter(Boolean).join(' · ')

  return (
    <ActivityRow
      icon={<Icon size={18} />}
      iconTone={line.tone}
      title={line.title}
      subtitle={subtitle || undefined}
      interactive={!!line.href}
      onClick={line.href ? () => navigate(line.href as string) : undefined}
      amount={
        line.amount != null ? (
          line.amountTone === 'owed' ? (
            <MoneyText tone="owed" size={14.5} weight={600}>
              {line.amount}
            </MoneyText>
          ) : (
            line.amount
          )
        ) : undefined
      }
      noDivider={last}
    />
  )
}

/* --------------------------------------------------------------- group select */

function GroupSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: { id: string; name: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div
      className="relative inline-flex items-center"
      style={{
        background: EV.fillGhost,
        borderRadius: 999,
        padding: '0 30px 0 14px',
        height: 38,
      }}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter by group"
        className="ev-input"
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          border: 'none',
          background: 'transparent',
          color: EV.ink,
          fontFamily: EV.fontUI,
          fontSize: 13.5,
          fontWeight: 600,
          cursor: 'pointer',
          maxWidth: 200,
        }}
      >
        <option value="all">All groups</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        size={16}
        style={{ position: 'absolute', right: 11, color: EV.ink45, pointerEvents: 'none' }}
      />
    </div>
  )
}

/* ----------------------------------------------------------- states / skeleton */

function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ padding: '44px 24px', borderRadius: 20, background: EV.surface, boxShadow: 'var(--ev-shadow-soft)' }}
    >
      <IconTile size={56} radius={18} tone="honey">
        <BellIcon size={26} />
      </IconTile>
      <div style={{ fontFamily: EV.fontDisplay, fontSize: 20, fontWeight: 500, color: EV.ink, marginTop: 14 }}>
        {title}
      </div>
      <p style={{ fontSize: 13.5, color: EV.ink55, marginTop: 6, maxWidth: 340, lineHeight: 1.55 }}>{body}</p>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  )
}

function InlineError() {
  return (
    <div
      className="flex items-center gap-3.5"
      style={{ padding: '18px 18px', borderRadius: 16, background: EV.surface, boxShadow: 'var(--ev-shadow-soft)' }}
    >
      <IconTile size={42} radius={13} tone="clay">
        <AlertIcon size={20} />
      </IconTile>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14.5, fontWeight: 600, color: EV.ink }}>Couldn't load activity</div>
        <div style={{ fontSize: 13, color: EV.ink55, marginTop: 1 }}>Something interrupted the connection.</div>
      </div>
      <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  )
}

function Bar({ w, h = 13, mt = 0 }: { w: number | string; h?: number; mt?: number }) {
  const style: CSSProperties = { width: w, height: h, borderRadius: 6, background: EV.fillGhost, marginTop: mt }
  return <div style={style} />
}

function FeedSkeleton() {
  return (
    <div>
      <Bar w={90} h={11} />
      <div className="flex flex-col" style={{ marginTop: 14, gap: 18 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar w={38} h={38} />
            <div className="flex-1">
              <Bar w={`${55 - i * 4}%`} h={13} />
              <Bar w={`${32 - i * 2}%`} h={11} mt={7} />
            </div>
            <Bar w={52} h={13} />
          </div>
        ))}
      </div>
    </div>
  )
}
