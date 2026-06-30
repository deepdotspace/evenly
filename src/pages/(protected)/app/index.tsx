/**
 * Dashboard (`/app`) — the authed home (CONTRACT §3.3, R1).
 *
 * Shows the cross-group "you are owed / you owe" rollup (today's rates, labelled
 * approximate), the groups list (each with the viewer's net + members), and a
 * recent-activity strip. Onboarding empty state, skeleton loading, inline error
 * retry — never a blank page or a raw spinner.
 */

import { useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, type RecordData } from 'deepspace'
import {
  ActivityRow,
  AvatarStack,
  Button,
  CameraIcon,
  EV,
  EqualsMark,
  IconTile,
  Logo,
  MoneyText,
  PlusIcon,
  SectionLabel,
  Surface,
  TagIcon,
  UsersIcon,
  formatMoney,
} from '../../../design'
import { useActivity, useProfile } from '../../../hooks'
import { useFxResolver } from '../../../hooks'
import { EVEN_TOLERANCE, memberKey, overallNet } from '../../../lib/data'
import type { GroupMemberData } from '../../../lib/data/types'
import {
  activityMeta,
  kindMeta,
  timeAgo,
  useGroupSummaries,
  type GroupSummary,
} from '../../../components/app/shell-data'
import { CreateGroupModal } from '../../../components/app/CreateGroupModal'

export default function Dashboard() {
  const [creating, setCreating] = useState(false)
  const { summaries, status, userId } = useGroupSummaries()
  const { record: profile } = useProfile()
  const { resolver } = useFxResolver()
  const activity = useActivity(undefined, { limit: 8 })
  const membersQ = useQuery<GroupMemberData>('groupMembers')

  const displayCurrency = profile?.data.defaultCurrency ?? 'USD'

  const overall = useMemo(
    () =>
      overallNet(
        summaries.map((s) => ({
          primaryCurrency: s.group.data.primaryCurrency,
          viewerNet: s.viewerNet,
        })),
        displayCurrency,
        resolver,
      ),
    [summaries, displayCurrency, resolver],
  )

  const membersByGroup = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>()
    for (const r of membersQ.records) {
      if (r.data.status === 'removed') continue
      const arr = map.get(r.data.groupId) ?? []
      arr.push({ id: memberKey(r.data), name: r.data.displayName })
      map.set(r.data.groupId, arr)
    }
    return map
  }, [membersQ.records])

  const groupNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of summaries) m.set(s.group.recordId, s.group.data.name)
    return m
  }, [summaries])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-9 lg:px-10 lg:py-12" style={{ maxWidth: 980 }}>
        {status === 'error' ? (
          <ErrorRetry onRetry={() => window.location.reload()} />
        ) : status === 'loading' && summaries.length === 0 ? (
          <DashboardSkeleton />
        ) : summaries.length === 0 ? (
          <EmptyDashboard onCreate={() => setCreating(true)} />
        ) : (
          <>
            <OverallHero
              net={overall.net}
              owed={overall.owed}
              owe={overall.owe}
              currency={displayCurrency}
              pendingGroups={overall.unconvertedGroups}
            />

            <section style={{ marginTop: 40 }}>
              <SectionLabel
                right={
                  <div className="flex items-center gap-2">
                    <Link to="/app/import" aria-label="Import from Splitwise">
                      <Button variant="secondary" size="sm" icon={<TagIcon size={15} />}>
                        Import
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<PlusIcon size={16} strokeWidth={2.4} />}
                      onClick={() => setCreating(true)}
                    >
                      New group
                    </Button>
                  </div>
                }
              >
                Your groups
              </SectionLabel>

              <div className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 16 }}>
                {summaries.map((s) => (
                  <GroupCard
                    key={s.group.recordId}
                    summary={s}
                    members={membersByGroup.get(s.group.recordId) ?? []}
                  />
                ))}
              </div>
            </section>

            <section style={{ marginTop: 40 }}>
              <SectionLabel>Recent activity</SectionLabel>
              <div style={{ marginTop: 8 }}>
                {activity.status === 'loading' && activity.records.length === 0 ? (
                  <FeedSkeleton />
                ) : activity.records.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: EV.ink45, padding: '14px 0' }}>No activity yet.</p>
                ) : (
                  activity.records.slice(0, 7).map((a, i, arr) => {
                    const meta = activityMeta(a.data.type)
                    const gname = groupNames.get(a.data.groupId) ?? 'a group'
                    const when = timeAgo(a.createdAt)
                    return (
                      <ActivityRow
                        key={a.recordId}
                        icon={<meta.Icon size={19} />}
                        iconTone={meta.tone}
                        title={a.data.payload?.summary || meta.label}
                        subtitle={`${gname}${when ? ` · ${when}` : ''}`}
                        noDivider={i === arr.length - 1}
                      />
                    )
                  })
                )}
              </div>
            </section>
          </>
        )}
      </div>

      <CreateGroupModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

/* ------------------------------------------------------------------- pieces */

function OverallHero({
  net,
  owed,
  owe,
  currency,
  pendingGroups,
}: {
  net: number
  owed: number
  owe: number
  currency: string
  pendingGroups: number
}) {
  const even = Math.abs(net) <= EVEN_TOLERANCE
  const pending = pendingGroups > 0
  // We never claim a single rolled-up total that silently drops groups we can't
  // convert yet (no FX rate). When some groups are pending, the headline is
  // honestly scoped to the groups we could convert and the rest are surfaced.
  const pendingNote = pending
    ? `${pendingGroups} ${pendingGroups === 1 ? 'group' : 'groups'} pending exchange rates`
    : null

  return (
    <header>
      <SectionLabel>Overview</SectionLabel>
      {even ? (
        <div className="flex items-center gap-4" style={{ marginTop: 8 }}>
          <EqualsMark size={52} radius={16} bg={EV.tileHoney} markColor={EV.honey} markStroke={2.4} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: EV.ink55 }}>
              {pending ? 'Even where rates are known' : 'Across all groups'}
            </div>
            <div
              style={{
                fontFamily: EV.fontDisplay,
                fontSize: 'clamp(36px, 5vw, 48px)',
                fontWeight: 500,
                color: EV.honey,
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {pending ? 'All square so far' : 'All even'}
            </div>
            {pendingNote && (
              <div style={{ fontSize: 12.5, fontWeight: 600, color: EV.clayDeep, marginTop: 7 }}>
                {pendingNote}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: EV.ink55 }}>
            {net > 0 ? 'You are owed overall' : 'You owe overall'}{' '}
            <span style={{ color: EV.ink40 }}>· approx, today's rates</span>
          </div>
          <div
            style={{
              fontFamily: EV.fontDisplay,
              fontSize: 'clamp(48px, 8vw, 72px)',
              fontWeight: 500,
              color: net > 0 ? EV.sageDeep : EV.clayDeep,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              marginTop: 4,
              fontVariantNumeric: 'tabular-nums lining-nums',
            }}
          >
            {formatMoney(net > 0 ? owed : owe, currency)}
          </div>
          {pendingNote && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: EV.clayDeep, marginTop: 8 }}>
              + {pendingNote}
            </div>
          )}
        </div>
      )}
    </header>
  )
}

function GroupCard({ summary, members }: { summary: GroupSummary; members: { id: string; name: string }[] }) {
  const { name, kind, primaryCurrency } = summary.group.data
  const meta = kindMeta(kind)
  const v = summary.viewerNet
  const even = Math.abs(v) <= EVEN_TOLERANCE

  return (
    <Link to={`/app/g/${summary.group.recordId}`} className="block">
      <Surface
        variant="card"
        className="transition-transform hover:-translate-y-0.5"
        style={{ padding: 18, cursor: 'pointer', height: '100%', boxShadow: 'var(--ev-shadow-soft)' }}
      >
        <div className="flex items-start justify-between">
          <IconTile tone="neutral" size={38}>
            <meta.Icon size={19} />
          </IconTile>
          <span style={{ fontSize: 11.5, color: EV.ink40, fontWeight: 500 }}>
            {summary.lastActivityMs ? timeAgo(summary.lastActivityMs) : 'No activity'}
          </span>
        </div>

        <div style={{ fontSize: 16, fontWeight: 600, color: EV.ink, marginTop: 13 }} className="truncate">
          {name}
        </div>

        <div className="flex items-end justify-between" style={{ marginTop: 14, gap: 10 }}>
          {members.length > 0 ? (
            <AvatarStack members={members} size={26} max={4} />
          ) : (
            <span style={{ fontSize: 12, color: EV.ink40 }}>{meta.label}</span>
          )}
          {even ? (
            <span style={{ fontSize: 13, fontWeight: 600, color: EV.honey }}>settled up</span>
          ) : (
            <div style={{ textAlign: 'right' }}>
              <MoneyText tone={v > 0 ? 'owed' : 'owe'} size={15} weight={600}>
                {formatMoney(v, primaryCurrency)}
              </MoneyText>
              <div style={{ fontSize: 11, color: EV.ink45 }}>{v > 0 ? 'you are owed' : 'you owe'}</div>
            </div>
          )}
        </div>
      </Surface>
    </Link>
  )
}

function EmptyDashboard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ paddingTop: 'clamp(24px, 8vh, 80px)' }}>
      <Logo size="lg" markOnly shadow />
      <h1
        style={{
          fontFamily: EV.fontDisplay,
          fontSize: 'clamp(28px, 5vw, 40px)',
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: EV.ink,
          marginTop: 22,
        }}
      >
        Start splitting
      </h1>
      <p style={{ fontSize: 15, color: EV.ink55, marginTop: 8, maxWidth: 420, lineHeight: 1.55 }}>
        Make a group for a trip, a household, or a one-off dinner. Add expenses, and Evenly keeps
        everyone square.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3" style={{ marginTop: 26 }}>
        <Button size="lg" icon={<PlusIcon size={18} strokeWidth={2.4} />} onClick={onCreate}>
          Create your first group
        </Button>
        <Link to="/app/import">
          <Button variant="secondary" size="lg" icon={<TagIcon size={17} />}>
            Import from Splitwise
          </Button>
        </Link>
      </div>

      <div
        className="grid gap-3 sm:grid-cols-3"
        style={{ marginTop: 44, width: '100%', maxWidth: 620 }}
      >
        <Hint Icon={UsersIcon} title="Make a group" body="Trip, flatmates, or a quick split." />
        <Hint Icon={CameraIcon} title="Scan receipts" body="Tap who had what. We do the math." />
        <Hint Icon={EqualsMarkHintIcon} title="Settle to even" body="The fewest payments to square up." />
      </div>
    </div>
  )
}

function EqualsMarkHintIcon({ size = 19 }: { size?: number }) {
  return <EqualsMark size={size} bg="transparent" markColor={EV.clayDeep} markStroke={2.4} />
}

function Hint({
  Icon,
  title,
  body,
}: {
  Icon: ComponentType<{ size?: number }>
  title: string
  body: string
}) {
  return (
    <Surface variant="card" style={{ padding: 16, textAlign: 'left', boxShadow: 'var(--ev-shadow-soft)' }}>
      <IconTile tone="warm" size={36}>
        <Icon size={18} />
      </IconTile>
      <div style={{ fontSize: 14, fontWeight: 600, color: EV.ink, marginTop: 11 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: EV.ink55, marginTop: 2, lineHeight: 1.5 }}>{body}</div>
    </Surface>
  )
}

function ErrorRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ paddingTop: 'clamp(40px, 12vh, 120px)' }}>
      <div style={{ fontFamily: EV.fontDisplay, fontSize: 24, fontWeight: 500, color: EV.ink }}>
        Couldn't load your groups
      </div>
      <p style={{ fontSize: 14, color: EV.ink55, marginTop: 6 }}>
        Something interrupted the connection.
      </p>
      <Button size="md" onClick={onRetry} style={{ marginTop: 18 }}>
        Retry
      </Button>
    </div>
  )
}

/* ---- skeletons ---- */

function Bar({ w, h = 14, mt = 0 }: { w: number | string; h?: number; mt?: number }) {
  return (
    <div style={{ width: w, height: h, borderRadius: 6, background: EV.fillGhost, marginTop: mt }} />
  )
}

function DashboardSkeleton() {
  return (
    <div>
      <Bar w={120} h={11} />
      <Bar w={260} h={56} mt={12} />
      <Bar w={130} h={11} mt={40} />
      <div className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <Surface key={i} variant="card" style={{ padding: 18, boxShadow: 'var(--ev-shadow-soft)' }}>
            <Bar w={38} h={38} />
            <Bar w="60%" h={16} mt={14} />
            <Bar w="40%" h={14} mt={16} />
          </Surface>
        ))}
      </div>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3" style={{ paddingTop: 8 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Bar w={38} h={38} />
          <div className="flex-1">
            <Bar w="45%" h={13} />
            <Bar w="30%" h={11} mt={7} />
          </div>
        </div>
      ))}
    </div>
  )
}
