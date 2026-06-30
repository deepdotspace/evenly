/**
 * Friends / 1:1 (`/app/friends`) — CONTRACT §3.8.
 *
 * A `pair` group is a 1:1 friend ledger (D6 — everything is a group under the
 * hood). This surface lists every pair group with the friend's identity, the
 * viewer's net (labelled), and last activity; a combined "you're owed / you owe"
 * across friends; and an "Add a friend" flow that creates a pair group. Opening a
 * friend routes to the shared group view (§3.4) — one code path, no special-case
 * 1:1 math or duplicated feed.
 *
 * Per-friend figures use each row's stored FX snapshot (exact). The combined
 * header rolls each pair-net into the user's display currency at today's rates
 * via the pure `overallNet` selector, explicitly labelled approximate (R1).
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useQuery, type RecordData } from 'deepspace'
import {
  Avatar,
  Button,
  ChevronRightIcon,
  EqualsIcon,
  EqualsMark,
  EV,
  IconTile,
  MoneyText,
  PlusIcon,
  SectionLabel,
  UsersIcon,
  formatMoney,
  type MoneyTone,
} from '../../design'
import { useContacts, useExpenses, useFriendGroups, useProfile, useSettlements, useFxResolver } from '../../hooks'
import {
  EVEN_TOLERANCE,
  groupNet,
  memberKey,
  overallNet,
  viewerNet,
  type MemberId,
} from '../../lib/data'
import type { GroupMemberData } from '../../lib/data/types'
import { AddFriendSheet } from './AddFriendSheet'

interface FriendSummary {
  groupId: string
  friendId: MemberId
  friendName: string
  friendAvatarUrl: string | null
  /** Viewer's signed net in this pair's primary currency (>0 they owe you). */
  viewerNet: number
  primaryCurrency: string
  lastActivityMs: number
}

/* ------------------------------------------------------------------- screen */

export function FriendsView() {
  const [adding, setAdding] = useState(false)

  const { userId } = useAuth()
  const pairGroups = useFriendGroups()
  const expenses = useExpenses(undefined)
  const settlements = useSettlements(undefined)
  const membersQ = useQuery<GroupMemberData>('groupMembers')
  const { record: profile } = useProfile()
  const { resolver } = useFxResolver()
  const contacts = useContacts()

  const displayCurrency = profile?.data.defaultCurrency ?? 'USD'

  const friends = useMemo<FriendSummary[]>(() => {
    if (!userId) return []

    const byGroup = new Map<string, RecordData<GroupMemberData>[]>()
    for (const m of membersQ.records) {
      const arr = byGroup.get(m.data.groupId) ?? []
      arr.push(m)
      byGroup.set(m.data.groupId, arr)
    }

    const rows = pairGroups.records.map((g) => {
      const gid = g.recordId
      const gExpenses = expenses.records.filter((e) => e.data.groupId === gid)
      const gSettlements = settlements.records.filter((s) => s.data.groupId === gid)
      const net = groupNet(g, gExpenses, gSettlements)

      let lastMs = 0
      for (const e of gExpenses) lastMs = Math.max(lastMs, e.data.expenseAtMs ?? 0)
      for (const s of gSettlements) lastMs = Math.max(lastMs, s.data.settledAtMs ?? 0)

      // The "friend" = the one member of the pair who isn't the viewer.
      const ms = byGroup.get(gid) ?? []
      const other =
        ms.find((m) => m.data.status !== 'removed' && memberKey(m.data) !== userId) ??
        ms.find((m) => memberKey(m.data) !== userId)

      return {
        groupId: gid,
        friendId: other ? memberKey(other.data) : gid,
        friendName: other?.data.displayName ?? g.data.name ?? 'Friend',
        friendAvatarUrl: other?.data.avatarUrl ?? null,
        viewerNet: viewerNet(net, userId),
        primaryCurrency: g.data.primaryCurrency,
        lastActivityMs: lastMs,
      }
    })

    rows.sort((a, b) => b.lastActivityMs - a.lastActivityMs)
    return rows
  }, [pairGroups.records, expenses.records, settlements.records, membersQ.records, userId])

  // Combined owed/owe across friends, each pair-net converted to the display
  // currency at today's rates (approximate; per-friend figures stay exact, R1).
  const totals = useMemo(() => {
    const toContribution = (f: FriendSummary) => ({
      primaryCurrency: f.primaryCurrency,
      viewerNet: f.viewerNet,
    })
    const owedRoll = overallNet(
      friends.filter((f) => f.viewerNet > EVEN_TOLERANCE).map(toContribution),
      displayCurrency,
      resolver,
    )
    const oweRoll = overallNet(
      friends.filter((f) => f.viewerNet < -EVEN_TOLERANCE).map(toContribution),
      displayCurrency,
      resolver,
    )
    const anyForeign = friends.some(
      (f) => f.primaryCurrency !== displayCurrency && Math.abs(f.viewerNet) > EVEN_TOLERANCE,
    )
    return { owed: owedRoll.owed, owe: oweRoll.owe, anyForeign }
  }, [friends, displayCurrency, resolver])

  const status: 'loading' | 'ready' | 'error' =
    pairGroups.status === 'error' || expenses.status === 'error' || settlements.status === 'error'
      ? 'error'
      : pairGroups.status === 'loading' || expenses.status === 'loading' || settlements.status === 'loading'
        ? 'loading'
        : 'ready'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-9 lg:px-10 lg:py-12" style={{ maxWidth: 760 }}>
        {status === 'error' ? (
          <ErrorRetry onRetry={() => window.location.reload()} />
        ) : status === 'loading' && friends.length === 0 ? (
          <FriendsSkeleton />
        ) : friends.length === 0 ? (
          <EmptyFriends onAdd={() => setAdding(true)} />
        ) : (
          <>
            <FriendsHero
              owed={totals.owed}
              owe={totals.owe}
              currency={displayCurrency}
              approximate={totals.anyForeign}
            />

            <section style={{ marginTop: 40 }}>
              <SectionLabel
                right={
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<PlusIcon size={16} strokeWidth={2.4} />}
                    onClick={() => setAdding(true)}
                  >
                    Add a friend
                  </Button>
                }
              >
                {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
              </SectionLabel>

              <div style={{ marginTop: 12 }}>
                {friends.map((f, i) => (
                  <FriendRow key={f.groupId} friend={f} last={i === friends.length - 1} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <AddFriendSheet
        open={adding}
        onClose={() => setAdding(false)}
        contacts={contacts.records}
        defaultCurrency={displayCurrency}
      />
    </div>
  )
}

/* -------------------------------------------------------------------- pieces */

function FriendsHero({
  owed,
  owe,
  currency,
  approximate,
}: {
  owed: number
  owe: number
  currency: string
  approximate: boolean
}) {
  const allEven = owed === 0 && owe === 0
  return (
    <header>
      <SectionLabel>Across friends</SectionLabel>
      {allEven ? (
        <div className="flex items-center gap-4" style={{ marginTop: 10 }}>
          <EqualsMark size={52} radius={16} bg={EV.tileHoney} markColor={EV.honey} markStroke={2.4} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: EV.ink55 }}>You and your friends</div>
            <div
              style={{
                fontFamily: EV.fontDisplay,
                fontSize: 'clamp(34px, 5vw, 46px)',
                fontWeight: 500,
                color: EV.honey,
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              All even
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div className="flex flex-wrap" style={{ gap: '24px 56px' }}>
            <HeroStat label="You're owed" amount={owed} currency={currency} tone="owed" />
            <div aria-hidden style={{ width: 1, alignSelf: 'stretch', background: EV.line }} className="hidden sm:block" />
            <HeroStat label="You owe" amount={owe} currency={currency} tone="owe" />
          </div>
          {approximate && (
            <div style={{ fontSize: 12, color: EV.ink40, marginTop: 12 }}>
              Converted to {currency} at today's rates · per-friend totals are exact
            </div>
          )}
        </div>
      )}
    </header>
  )
}

function HeroStat({
  label,
  amount,
  currency,
  tone,
}: {
  label: string
  amount: number
  currency: string
  tone: Extract<MoneyTone, 'owed' | 'owe'>
}) {
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: EV.ink55 }}>{label}</div>
      <div
        style={{
          fontFamily: EV.fontDisplay,
          fontSize: 'clamp(30px, 5vw, 42px)',
          fontWeight: 500,
          color: tone === 'owed' ? EV.sageDeep : EV.clayDeep,
          letterSpacing: '-0.025em',
          lineHeight: 1.02,
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums lining-nums',
        }}
      >
        {formatMoney(amount, currency)}
      </div>
    </div>
  )
}

function FriendRow({ friend, last }: { friend: FriendSummary; last: boolean }) {
  const even = Math.abs(friend.viewerNet) <= EVEN_TOLERANCE
  const tone: MoneyTone = friend.viewerNet > 0 ? 'owed' : 'owe'
  const verb = friend.viewerNet > 0 ? 'owes you' : 'you owe'

  return (
    <Link
      to={`/app/g/${friend.groupId}`}
      className="ev-row-link"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '14px 8px',
        marginInline: -8,
        borderRadius: 12,
        borderBottom: last ? undefined : `1px solid ${EV.line}`,
      }}
    >
      <Avatar id={friend.friendId} name={friend.friendName} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate" style={{ fontSize: 15, fontWeight: 600, color: EV.ink }}>
          {friend.friendName}
        </div>
        <div style={{ fontSize: 12.5, color: EV.ink45, marginTop: 1 }}>
          {friend.lastActivityMs ? `Last active ${timeAgo(friend.lastActivityMs)}` : 'No expenses yet'}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {even ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 13,
              fontWeight: 600,
              color: EV.honey,
            }}
          >
            <EqualsIcon size={15} strokeWidth={2.6} />
            settled up
          </span>
        ) : (
          <>
            <MoneyText tone={tone} size={15.5} weight={600}>
              {formatMoney(friend.viewerNet, friend.primaryCurrency)}
            </MoneyText>
            <div style={{ fontSize: 11, color: EV.ink45 }}>{verb}</div>
          </>
        )}
      </div>
      <ChevronRightIcon size={18} style={{ color: EV.ink35, flexShrink: 0 }} />
    </Link>
  )
}

function EmptyFriends({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ paddingTop: 'clamp(24px, 9vh, 90px)' }}>
      <IconTile size={64} radius={20} tone="warm">
        <UsersIcon size={30} />
      </IconTile>
      <h1
        style={{
          fontFamily: EV.fontDisplay,
          fontSize: 'clamp(26px, 5vw, 36px)',
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: EV.ink,
          marginTop: 20,
        }}
      >
        No friends yet
      </h1>
      <p style={{ fontSize: 15, color: EV.ink55, marginTop: 8, maxWidth: 400, lineHeight: 1.55 }}>
        Add someone to start splitting one-on-one. Every friend gets a running balance and a one-tap
        settle.
      </p>
      <Button
        size="lg"
        icon={<PlusIcon size={18} strokeWidth={2.4} />}
        onClick={onAdd}
        style={{ marginTop: 26 }}
      >
        Add a friend
      </Button>
    </div>
  )
}

function ErrorRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ paddingTop: 'clamp(40px, 12vh, 120px)' }}>
      <div style={{ fontFamily: EV.fontDisplay, fontSize: 24, fontWeight: 500, color: EV.ink }}>
        Couldn't load your friends
      </div>
      <p style={{ fontSize: 14, color: EV.ink55, marginTop: 6 }}>Something interrupted the connection.</p>
      <Button size="md" onClick={onRetry} style={{ marginTop: 18 }}>
        Retry
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ skeleton */

function Bar({ w, h = 14, mt = 0 }: { w: number | string; h?: number; mt?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 6, background: EV.fillGhost, marginTop: mt }} />
}

function FriendsSkeleton() {
  return (
    <div>
      <Bar w={120} h={11} />
      <div className="flex flex-wrap" style={{ gap: '24px 56px', marginTop: 14 }}>
        <div>
          <Bar w={90} h={12} />
          <Bar w={150} h={40} mt={10} />
        </div>
        <div>
          <Bar w={70} h={12} />
          <Bar w={130} h={40} mt={10} />
        </div>
      </div>
      <Bar w={110} h={11} mt={42} />
      <div style={{ marginTop: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3" style={{ padding: '14px 0' }}>
            <Bar w={44} h={44} />
            <div className="flex-1">
              <Bar w="45%" h={14} />
              <Bar w="28%" h={11} mt={7} />
            </div>
            <Bar w={64} h={14} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- helpers */

const MIN = 60_000
const HR = 3_600_000
const DAY = 86_400_000

/** Compact relative time for the last-activity line. */
function timeAgo(ms: number, now = Date.now()): string {
  const d = now - ms
  if (d < MIN) return 'just now'
  if (d < HR) return `${Math.floor(d / MIN)}m ago`
  if (d < DAY) return `${Math.floor(d / HR)}h ago`
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
