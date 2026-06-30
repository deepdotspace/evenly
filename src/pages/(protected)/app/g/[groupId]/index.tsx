/**
 * Group detail (`/app/g/:groupId`) — CONTRACT §3.4.
 *
 * Header (name, currency, members) · the viewer's hero balance · the signature
 * balance ladder (center-line bars) · the interleaved expense + settlement feed
 * with search · Scan / Settle actions · a desktop settle-to-even right panel
 * with a personal Simplify-debts toggle (R3). Balances are derived from the
 * ledger via the pure selectors using each row's stored FX snapshot.
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth, type RecordData } from 'deepspace'
import {
  ActivityRow,
  AvatarStack,
  Avatar,
  BalanceLadderRow,
  Button,
  CameraIcon,
  PlusIcon,
  CheckIcon,
  ArrowRightIcon,
  EV,
  EqualsMark,
  IconTile,
  MoneyText,
  OwesOwedLegend,
  ReceiptBadge,
  SearchIcon,
  SectionLabel,
  SettingsIcon,
  categoryIcon,
  formatMoney,
  minorDigits,
} from '../../../../../design'
import { useGroup, useGroupMembers, useExpenses, useSettlements } from '../../../../../hooks'
import { ExportMenu } from '../../../../../components/export'
import {
  EVEN_TOLERANCE,
  buildBalanceLadder,
  groupNet,
  memberIdentityMap,
  settlePlan,
  truthy,
  viewerNet,
  type MemberId,
} from '../../../../../lib/data'
import type {
  ExpenseData,
  GroupMemberData,
  SettlementData,
} from '../../../../../lib/data/types'

type FeedItem =
  | { type: 'expense'; ms: number; rec: RecordData<ExpenseData> }
  | { type: 'settlement'; ms: number; rec: RecordData<SettlementData> }

/** Convert a minor amount in `cur` to `primary` minor units via a stored rate. */
function toPrimaryMinor(amountMinor: number, cur: string, fxRate: number, primary: string): number {
  if (cur === primary) return amountMinor
  return Math.round((amountMinor / 10 ** minorDigits(cur)) * fxRate * 10 ** minorDigits(primary))
}

export default function GroupView() {
  const { groupId } = useParams()
  const { userId } = useAuth()
  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)

  const [query, setQuery] = useState('')
  const [simplify, setSimplify] = useState(false)
  const simplifyInit = group.record ? truthy(group.record.data.simplifyDefault) : false
  // Seed the personal toggle from the group default once the group resolves.
  const [seeded, setSeeded] = useState(false)
  if (group.record && !seeded) {
    setSeeded(true)
    setSimplify(simplifyInit)
  }

  const primary = group.record?.data.primaryCurrency ?? 'USD'

  const net = useMemo(
    () =>
      group.record
        ? groupNet(group.record, expenses.records, settlements.records)
        : {},
    [group.record, expenses.records, settlements.records],
  )

  const identities = useMemo(() => memberIdentityMap(members.records), [members.records])

  const ladder = useMemo(
    () => buildBalanceLadder(net, members.records),
    [net, members.records],
  )

  const myNet = userId ? viewerNet(net, userId) : 0
  const even = Math.abs(myNet) <= EVEN_TOLERANCE

  const edges = useMemo(
    () =>
      group.record
        ? settlePlan(group.record, expenses.records, settlements.records, simplify)
        : [],
    [group.record, expenses.records, settlements.records, simplify],
  )

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...expenses.records.map((rec) => ({
        type: 'expense' as const,
        ms: rec.data.expenseAtMs ?? (Date.parse(rec.createdAt) || 0),
        rec,
      })),
      ...settlements.records.map((rec) => ({
        type: 'settlement' as const,
        ms: rec.data.settledAtMs ?? (Date.parse(rec.createdAt) || 0),
        rec,
      })),
    ]
    items.sort((a, b) => b.ms - a.ms)
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      if (it.type === 'expense') {
        const payer = nameFor(identities, Object.keys(it.rec.data.paidBy)[0])
        return (
          it.rec.data.description.toLowerCase().includes(q) ||
          payer.toLowerCase().includes(q) ||
          it.rec.data.category.toLowerCase().includes(q)
        )
      }
      const from = nameFor(identities, it.rec.data.fromUserId)
      const to = nameFor(identities, it.rec.data.toUserId)
      return `${from} ${to}`.toLowerCase().includes(q)
    })
  }, [expenses.records, settlements.records, query, identities])

  const memberStack = useMemo(
    () =>
      members.records
        .filter((m) => m.data.status !== 'removed')
        .map((m) => ({ id: m.data.userId ?? m.data.guestId ?? m.recordId, name: m.data.displayName })),
    [members.records],
  )

  const loading = group.status === 'loading'
  const errored = group.status === 'error'
  const notFound = group.status === 'ready' && !group.record
  // Hold the skeleton until the ledger has loaded too: the hero/ladder derive over
  // expenses + settlements, so showing them before the first ledger response would
  // flash "All even" on a group that actually has expenses (R5-3).
  const ledgerLoading =
    (expenses.status === 'loading' && expenses.records.length === 0) ||
    (settlements.status === 'loading' && settlements.records.length === 0)

  if (errored) {
    return (
      <CenterState
        title="Couldn't load this group"
        body="Something interrupted the connection."
        action={<Button onClick={() => window.location.reload()}>Retry</Button>}
      />
    )
  }
  if (notFound) {
    return (
      <CenterState
        title="Group not found"
        body="It may have been deleted, or you're no longer a member."
        action={
          <Link to="/app">
            <Button variant="secondary">Back to overview</Button>
          </Link>
        }
      />
    )
  }
  if ((loading && !group.record) || ledgerLoading) {
    return <GroupSkeleton />
  }

  const name = group.record?.data.name ?? 'Group'

  return (
    <div className="h-full lg:flex lg:min-h-0">
      {/* ---- main column ---- */}
      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 720 }}>
          {/* header */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SectionLabel>
                {`${primary} · ${memberStack.length} ${memberStack.length === 1 ? 'member' : 'members'}`}
              </SectionLabel>
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
                {name}
              </h1>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <GroupQuickNav groupId={groupId} />
              <ExportMenu groupId={groupId} variant="icon" />
              {memberStack.length > 0 && (
                <div className="hidden sm:flex items-center">
                  <AvatarStack members={memberStack} size={30} max={5} />
                </div>
              )}
              <Link to={`/app/g/${groupId}/expense/new`} className="hidden lg:inline-flex">
                <Button size="sm" icon={<PlusIcon size={17} />}>
                  Add expense
                </Button>
              </Link>
              <Link to={`/app/g/${groupId}/scan`} className="hidden lg:inline-flex">
                <Button size="sm" variant="secondary" icon={<CameraIcon size={17} />}>
                  Scan a receipt
                </Button>
              </Link>
            </div>
          </div>

          {/* hero balance */}
          <div style={{ marginTop: 30 }}>
            {even ? (
              <div className="flex items-center gap-4">
                <EqualsMark size={56} radius={17} bg={EV.tileHoney} markColor={EV.honey} markStroke={2.4} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: EV.ink55 }}>Everyone is square</div>
                  <div
                    style={{
                      fontFamily: EV.fontDisplay,
                      fontSize: 'clamp(34px, 5vw, 44px)',
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
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: EV.ink55 }}>
                  {myNet > 0 ? 'You are owed' : 'You owe'}
                </div>
                <div
                  style={{
                    fontFamily: EV.fontDisplay,
                    fontSize: 'clamp(48px, 8vw, 64px)',
                    fontWeight: 500,
                    color: myNet > 0 ? EV.sageDeep : EV.clayDeep,
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                    marginTop: 3,
                    fontVariantNumeric: 'tabular-nums lining-nums',
                  }}
                >
                  {formatMoney(myNet, primary)}
                </div>
              </div>
            )}
          </div>

          {/* balance ladder */}
          {ladder.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <SectionLabel right={<OwesOwedLegend />}>Where everyone stands</SectionLabel>

              {/* mobile: stacked */}
              <div className="lg:hidden flex flex-col" style={{ marginTop: 14, gap: 16 }}>
                {ladder.map((row) => (
                  <BalanceLadderRow
                    key={row.memberId}
                    layout="stacked"
                    member={{ id: row.memberId, name: row.displayName, you: row.memberId === userId }}
                    status={row.state}
                    amountMinor={Math.abs(row.value)}
                    currency={primary}
                    widthPct={row.barWidth * 50}
                  />
                ))}
              </div>

              {/* desktop: name | bar | amount */}
              <div className="hidden lg:flex" style={{ marginTop: 16, flexDirection: 'column', gap: 18 }}>
                {ladder.map((row) => (
                  <BalanceLadderRow
                    key={row.memberId}
                    layout="row"
                    member={{ id: row.memberId, name: row.displayName, you: row.memberId === userId }}
                    status={row.state}
                    amountMinor={Math.abs(row.value)}
                    currency={primary}
                    widthPct={row.barWidth * 50}
                  />
                ))}
              </div>
            </section>
          )}

          {/* mobile actions */}
          <div className="lg:hidden flex flex-col gap-2.5" style={{ marginTop: 28 }}>
            <Link to={`/app/g/${groupId}/expense/new`}>
              <Button fullWidth icon={<PlusIcon size={18} />}>
                Add expense
              </Button>
            </Link>
            <div className="flex gap-2.5">
              <Link to={`/app/g/${groupId}/scan`} style={{ flex: 1 }}>
                <Button fullWidth variant="secondary" icon={<CameraIcon size={18} />}>
                  Scan
                </Button>
              </Link>
              <Link to={`/app/g/${groupId}/settle`} style={{ flex: 1 }}>
                <Button fullWidth variant="secondary">
                  Settle up
                </Button>
              </Link>
            </div>
          </div>

          {/* feed */}
          <section style={{ marginTop: 34 }}>
            <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}>
              <SectionLabel>Activity</SectionLabel>
              {feed.length > 0 && (
                <div
                  className="flex items-center gap-2"
                  style={{
                    background: EV.fillGhost,
                    borderRadius: 999,
                    padding: '6px 12px',
                    minWidth: 0,
                    maxWidth: 240,
                    flex: '0 1 240px',
                  }}
                >
                  <SearchIcon size={15} style={{ color: EV.ink40, flexShrink: 0 }} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search"
                    aria-label="Search activity"
                    className="ev-input"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      fontSize: 13.5,
                      color: EV.ink,
                      width: '100%',
                      minWidth: 0,
                    }}
                  />
                </div>
              )}
            </div>

            {expenses.status === 'loading' && expenses.records.length === 0 ? (
              <FeedSkeleton />
            ) : feed.length === 0 ? (
              query ? (
                <p style={{ fontSize: 13.5, color: EV.ink45, padding: '14px 0' }}>
                  Nothing matches “{query}”.
                </p>
              ) : (
                <EmptyFeed groupId={groupId} />
              )
            ) : (
              feed.map((it, i) =>
                it.type === 'expense' ? (
                  <ExpenseFeedRow
                    key={it.rec.recordId}
                    rec={it.rec}
                    groupId={groupId}
                    primary={primary}
                    identities={identities}
                    last={i === feed.length - 1}
                  />
                ) : (
                  <SettlementFeedRow
                    key={it.rec.recordId}
                    rec={it.rec}
                    primary={primary}
                    identities={identities}
                    last={i === feed.length - 1}
                  />
                ),
              )
            )}
          </section>
        </div>
      </main>

      {/* ---- desktop right panel: settle to even ---- */}
      <aside
        className="hidden lg:flex flex-col h-full overflow-y-auto shrink-0"
        style={{ width: 320, background: EV.surface, boxShadow: `-1px 0 0 ${EV.line}`, padding: '32px 26px' }}
      >
        <SettlePanel
          groupId={groupId}
          edges={edges}
          identities={identities}
          primary={primary}
          simplify={simplify}
          onToggleSimplify={setSimplify}
          allSquare={edges.length === 0}
        />
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------- quick nav row */

/**
 * Secondary group surfaces (Insights / Recurring / Group settings) as a tidy
 * row of warm ghost icon-buttons in the header. Scan + Settle stay the loud
 * primaries; these are the quiet doorways. Coherent on phone and desktop.
 *
 * Chart + repeat marks are local to this file (they're not in the shared icon
 * set yet); they follow the design-system Icon contract so they read as native.
 */
function QuickIcon({
  children,
  size = 17,
  strokeWidth = 2,
}: {
  children: ReactNode
  size?: number
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const QUICK_NAV: {
  slug: string
  label: string
  icon: ReactNode
}[] = [
  {
    slug: 'insights',
    label: 'Insights',
    icon: (
      <QuickIcon>
        <path d="M3 3v18h18" />
        <path d="M7 16V11" />
        <path d="M12 16V7" />
        <path d="M17 16v-3" />
      </QuickIcon>
    ),
  },
  {
    slug: 'recurring',
    label: 'Recurring',
    icon: (
      <QuickIcon>
        <path d="m17 2 4 4-4 4" />
        <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 13v1a4 4 0 0 1-4 4H3" />
      </QuickIcon>
    ),
  },
  {
    slug: 'settings',
    label: 'Group settings',
    icon: <SettingsIcon size={17} />,
  },
]

function GroupQuickNav({ groupId }: { groupId: string | undefined }) {
  const base = groupId ? `/app/g/${groupId}` : '/app'
  return (
    <div className="flex items-center" style={{ gap: 5 }}>
      {QUICK_NAV.map((item) => (
        <Link
          key={item.slug}
          to={`${base}/${item.slug}`}
          aria-label={item.label}
          title={item.label}
          className="ev-btn ev-btn-ghost inline-flex items-center justify-center"
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: EV.fillGhost,
            color: EV.ink55,
          }}
        >
          {item.icon}
        </Link>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------- feed rows */

function nameFor(identities: Map<MemberId, { displayName: string }>, id: string | undefined): string {
  if (!id) return 'Someone'
  return identities.get(id)?.displayName ?? (id.startsWith('guest:') ? 'Guest' : 'Someone')
}

function payerSummary(identities: Map<MemberId, { displayName: string }>, paidBy: Record<string, number>): string {
  const ids = Object.keys(paidBy)
  if (ids.length === 0) return 'Someone paid'
  const first = nameFor(identities, ids[0])
  if (ids.length === 1) return `${first} paid`
  return `${first} +${ids.length - 1} paid`
}

function ExpenseFeedRow({
  rec,
  groupId,
  primary,
  identities,
  last,
}: {
  rec: RecordData<ExpenseData>
  groupId: string | undefined
  primary: string
  identities: Map<MemberId, { displayName: string }>
  last: boolean
}) {
  const navigate = useNavigate()
  const e = rec.data
  const Icon = categoryIcon(e.category)
  const foreign = e.currency !== primary
  const convertedMinor = foreign ? toPrimaryMinor(e.amountMinor, e.currency, e.fxRate, primary) : e.amountMinor
  const splitN = Object.keys(e.splits).length

  return (
    <ActivityRow
      icon={<Icon size={19} />}
      iconTone={e.receiptId ? 'warm' : 'neutral'}
      interactive
      title={
        <>
          {e.description}
          {e.receiptId ? <ReceiptBadge /> : null}
        </>
      }
      subtitle={`${payerSummary(identities, e.paidBy)} · split ${splitN} ${splitN === 1 ? 'way' : 'ways'}`}
      amount={formatMoney(convertedMinor, primary)}
      subAmount={foreign ? formatMoney(e.amountMinor, e.currency) : undefined}
      noDivider={last}
      onClick={groupId ? () => navigate(`/app/g/${groupId}/expense/${rec.recordId}`) : undefined}
    />
  )
}

function SettlementFeedRow({
  rec,
  primary,
  identities,
  last,
}: {
  rec: RecordData<SettlementData>
  primary: string
  identities: Map<MemberId, { displayName: string }>
  last: boolean
}) {
  const s = rec.data
  const foreign = s.currency !== primary
  const convertedMinor = foreign ? toPrimaryMinor(s.amountMinor, s.currency, s.fxRate, primary) : s.amountMinor
  const from = nameFor(identities, s.fromUserId)
  const to = nameFor(identities, s.toUserId)

  return (
    <ActivityRow
      icon={<CheckIcon size={18} />}
      iconTone="sage"
      title={`${from} paid ${to}`}
      subtitle="Settled up"
      amount={
        <MoneyText tone="owed" size={14.5} weight={600}>
          {formatMoney(convertedMinor, primary)}
        </MoneyText>
      }
      subAmount={foreign ? formatMoney(s.amountMinor, s.currency) : undefined}
      noDivider={last}
    />
  )
}

/* --------------------------------------------------------------- settle panel */

function SettlePanel({
  groupId,
  edges,
  identities,
  primary,
  simplify,
  onToggleSimplify,
  allSquare,
}: {
  groupId: string | undefined
  edges: { from: MemberId; to: MemberId; amount: number; simplified: boolean }[]
  identities: Map<MemberId, { displayName: string }>
  primary: string
  simplify: boolean
  onToggleSimplify: (v: boolean) => void
  allSquare: boolean
}) {
  if (allSquare) {
    return (
      <div className="text-center" style={{ paddingTop: 24 }}>
        <IconTile size={64} radius={20} tone="honey" style={{ margin: '0 auto 16px' }}>
          <EqualsMark size={34} bg="transparent" markColor={EV.honey} markStroke={2.6} />
        </IconTile>
        <div style={{ fontFamily: EV.fontDisplay, fontSize: 22, fontWeight: 500, color: EV.ink }}>
          You're all square
        </div>
        <p style={{ fontSize: 13.5, color: EV.ink55, marginTop: 6, lineHeight: 1.5 }}>
          Every balance is zero. No reminders, no awkward math.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div style={{ fontFamily: EV.fontDisplay, fontSize: 20, fontWeight: 500, color: EV.ink }}>
            Settle to even
          </div>
          <p style={{ fontSize: 12.5, color: EV.ink55, marginTop: 3, lineHeight: 1.45 }}>
            {simplify ? 'The fewest payments to square up.' : 'Who owes whom, directly.'}
          </p>
        </div>
      </div>

      <SegToggle
        value={simplify ? 'simplified' : 'direct'}
        onChange={(v) => onToggleSimplify(v === 'simplified')}
        style={{ marginTop: 14 }}
      />

      <div style={{ marginTop: 8 }}>
        {edges.slice(0, 8).map((e, i) => (
          <div
            key={`${e.from}-${e.to}-${i}`}
            className="flex items-center gap-3"
            style={{ padding: '13px 0', borderBottom: i === Math.min(edges.length, 8) - 1 ? 'none' : `1px solid ${EV.line}` }}
          >
            <div className="flex items-center">
              <Avatar id={e.from} name={nameFor(identities, e.from)} size={30} />
              <ArrowRightIcon size={18} style={{ color: EV.ink35, margin: '0 1px' }} />
              <Avatar id={e.to} name={nameFor(identities, e.to)} size={30} />
            </div>
            <div className="flex-1 min-w-0" style={{ fontSize: 13, fontWeight: 600, color: EV.ink }}>
              <span className="truncate">{nameFor(identities, e.from)}</span>
              <span style={{ color: EV.ink45, fontWeight: 500 }}> → </span>
              <span className="truncate">{nameFor(identities, e.to)}</span>
            </div>
            <MoneyText tone="neutral" size={14} weight={600}>
              {formatMoney(e.amount, primary)}
            </MoneyText>
          </div>
        ))}
      </div>

      <Link to={groupId ? `/app/g/${groupId}/settle` : '/app'} style={{ marginTop: 18 }}>
        <Button fullWidth>Settle up</Button>
      </Link>
    </div>
  )
}

function SegToggle({
  value,
  onChange,
  style,
}: {
  value: 'direct' | 'simplified'
  onChange: (v: 'direct' | 'simplified') => void
  style?: CSSProperties
}) {
  const opts: { id: 'direct' | 'simplified'; label: string }[] = [
    { id: 'direct', label: 'Direct' },
    { id: 'simplified', label: 'Simplified' },
  ]
  return (
    <div
      className="flex"
      style={{ background: EV.fillGhost, borderRadius: 11, padding: 3, gap: 3, marginBottom: 14, ...style }}
    >
      {opts.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="ev-tab"
            data-active={active}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: 9,
              padding: '7px 10px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: active ? EV.surface : 'transparent',
              color: active ? EV.ink : EV.ink55,
              boxShadow: active ? 'var(--ev-shadow-soft)' : undefined,
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- empty/load */

function EmptyFeed({ groupId }: { groupId: string | undefined }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ padding: '36px 24px', borderRadius: 18, background: EV.surface, boxShadow: 'var(--ev-shadow-soft)' }}
    >
      <IconTile size={52} radius={16} tone="warm">
        <CameraIcon size={24} />
      </IconTile>
      <div style={{ fontFamily: EV.fontDisplay, fontSize: 20, fontWeight: 500, color: EV.ink, marginTop: 14 }}>
        Add the first expense
      </div>
      <p style={{ fontSize: 13.5, color: EV.ink55, marginTop: 6, maxWidth: 320, lineHeight: 1.5 }}>
        Scan a receipt or add a charge, and the balances start filling in.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2.5" style={{ marginTop: 18 }}>
        <Link to={groupId ? `/app/g/${groupId}/expense/new` : '/app'}>
          <Button size="sm">Add an expense</Button>
        </Link>
        <Link to={groupId ? `/app/g/${groupId}/scan` : '/app'}>
          <Button size="sm" variant="secondary" icon={<CameraIcon size={16} />}>
            Scan a receipt
          </Button>
        </Link>
      </div>
    </div>
  )
}

function CenterState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col items-center text-center" style={{ paddingTop: 'clamp(48px, 14vh, 140px)' }}>
        <div style={{ fontFamily: EV.fontDisplay, fontSize: 24, fontWeight: 500, color: EV.ink }}>{title}</div>
        <p style={{ fontSize: 14, color: EV.ink55, marginTop: 6, maxWidth: 360 }}>{body}</p>
        <div style={{ marginTop: 18 }}>{action}</div>
      </div>
    </div>
  )
}

function Bar({ w, h = 14, mt = 0 }: { w: number | string; h?: number; mt?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 6, background: EV.fillGhost, marginTop: mt }} />
}

function GroupSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 720 }}>
        <Bar w={140} h={11} />
        <Bar w={240} h={32} mt={10} />
        <Bar w={180} h={56} mt={28} />
        <Bar w={150} h={11} mt={34} />
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} w="100%" h={11} />
          ))}
        </div>
      </div>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3" style={{ paddingTop: 8 }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Bar w={38} h={38} />
          <div className="flex-1">
            <Bar w="50%" h={13} />
            <Bar w="32%" h={11} mt={7} />
          </div>
          <Bar w={56} h={13} />
        </div>
      ))}
    </div>
  )
}
