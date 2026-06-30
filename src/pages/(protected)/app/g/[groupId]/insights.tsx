/**
 * Group insights (`/app/g/:groupId/insights`) — CONTRACT §7 A1.
 *
 * "Where the money went." Derived read-only from the ledger via the pure
 * `spendInsights` selector (each expense converted to the group's primary
 * currency through its STORED FX snapshot, so every figure here matches the
 * group screen exactly). SETTLEMENTS ARE EXCLUDED — this is spend, not money
 * moving between people.
 *
 * Stat cards (group total, avg per person, expense count, avg size, largest +
 * description, your paid vs your net) · a category donut · a per-person
 * contribution donut · a weekly spending bar chart · the biggest expenses.
 * Charts are hand-drawn inline SVG (no chart-library dependency), in the warm
 * palette with tabular money. Same loading / empty / error language as the rest
 * of the app, coherent on phone and desktop.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth, type RecordData } from 'deepspace'
import {
  ActivityRow,
  Avatar,
  Button,
  CameraIcon,
  ChevronLeftIcon,
  EV,
  IconTile,
  MoneyText,
  ReceiptBadge,
  SectionLabel,
  TagIcon,
  categoryIcon,
  formatMoney,
  minorDigits,
  tintForId,
} from '../../../../../design'
import { useGroup, useGroupMembers, useExpenses } from '../../../../../hooks'
import { memberIdentityMap, spendInsights, type MemberId } from '../../../../../lib/data'
import type { ExpenseData } from '../../../../../lib/data/types'
import {
  Donut,
  DonutLegend,
  StatCard,
  WeeklyBars,
  categoryColor,
  categoryLabel,
  type DonutSegment,
  type WeeklyBar,
} from '../../../../../components/insights'

/** Convert a minor amount in `cur` to `primary` minor units via a stored rate. */
function toPrimaryMinor(amountMinor: number, cur: string, fxRate: number, primary: string): number {
  if (cur === primary) return amountMinor
  return Math.round((amountMinor / 10 ** minorDigits(cur)) * fxRate * 10 ** minorDigits(primary))
}

/** Short label for a UTC Monday-week bucket, e.g. "Jun 2". */
const WEEK_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

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

export default function InsightsPage() {
  const { groupId } = useParams()
  const { userId } = useAuth()
  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const expenses = useExpenses(groupId)

  const backTo = groupId ? `/app/g/${groupId}` : '/app'
  const groupName = group.record?.data.name ?? 'Group'
  const primary = group.record?.data.primaryCurrency ?? 'USD'

  const identities = useMemo(() => memberIdentityMap(members.records), [members.records])
  const activeCount = useMemo(
    () => members.records.filter((m) => m.data.status === 'active').length,
    [members.records],
  )

  const ins = useMemo(
    () =>
      group.record ? spendInsights(group.record, expenses.records, members.records, userId ?? undefined) : null,
    [group.record, expenses.records, members.records, userId],
  )

  /* category donut — descending value, clay-first palette */
  const categorySegments = useMemo<DonutSegment[]>(() => {
    if (!ins) return []
    return Object.entries(ins.byCategory)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, value], i) => ({ id, label: categoryLabel(id), value, color: categoryColor(i) }))
  }, [ins])

  /* per-person donut — each slice in the payer's avatar tint */
  const personSegments = useMemo<DonutSegment[]>(() => {
    if (!ins) return []
    return Object.entries(ins.byPayer)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, value]) => ({
        id,
        label: nameFor(identities, id),
        value,
        color: tintForId(id).ink,
      }))
  }, [ins, identities])

  /* weekly bars — most recent 16 buckets, oldest -> newest */
  const weeklyBars = useMemo<WeeklyBar[]>(() => {
    if (!ins) return []
    return ins.byWeek.slice(-16).map((w) => ({
      id: String(w.weekStartMs),
      label: WEEK_FMT.format(new Date(w.weekStartMs)),
      value: w.amountMinor,
      display: formatMoney(w.amountMinor, primary),
    }))
  }, [ins, primary])

  /* biggest expenses — top 5 by primary amount */
  const biggest = useMemo(() => {
    return expenses.records
      .map((rec) => ({ rec, amount: toPrimaryMinor(rec.data.amountMinor, rec.data.currency, rec.data.fxRate, primary) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [expenses.records, primary])

  const money = (m: number) => formatMoney(m, primary)

  /* --------------------------------------------------------------- load/error */
  const errored = group.status === 'error'
  const notFound = group.status === 'ready' && !group.record
  // Hold the skeleton until expenses have loaded: the charts derive over them, so
  // rendering first would flash "Nothing to chart yet" on a group that has data (R5-3).
  const loading =
    (group.status === 'loading' && !group.record) ||
    (expenses.status === 'loading' && expenses.records.length === 0)

  if (errored) {
    return (
      <CenterState
        title="Couldn't load insights"
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
  if (loading || !ins) return <InsightsSkeleton backTo={backTo} groupName={groupName} />

  const hasData = ins.expenseCount > 0
  const youPaidPct = ins.totalMinor > 0 ? Math.round((ins.viewerPaidMinor / ins.totalMinor) * 100) : 0
  const netTone = ins.viewerNetMinor > 0 ? 'owed' : ins.viewerNetMinor < 0 ? 'owe' : 'even'
  const netCaption =
    ins.viewerNetMinor > 0
      ? 'paid more than your share'
      : ins.viewerNetMinor < 0
        ? 'your share exceeds what you paid'
        : 'paid exactly your share'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 940 }}>
        {/* back */}
        <Link
          to={backTo}
          className="ev-pressable"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            color: EV.ink55,
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 18,
          }}
        >
          <ChevronLeftIcon size={18} />
          {groupName}
        </Link>

        {/* header */}
        <SectionLabel>
          {`Insights · ${primary} · ${ins.expenseCount} ${ins.expenseCount === 1 ? 'expense' : 'expenses'}`}
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
          Where the money went
        </h1>
        <p style={{ fontSize: 14, color: EV.ink55, marginTop: 4, lineHeight: 1.5 }}>
          Spending only. Settlements between people are left out.
        </p>

        {!hasData ? (
          <EmptyInsights groupId={groupId} />
        ) : (
          <>
            {/* ---- the numbers ---- */}
            <section style={{ marginTop: 26 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 12,
                }}
              >
                <StatCard
                  label="Total spent"
                  value={money(ins.totalMinor)}
                  caption={`${ins.expenseCount} ${ins.expenseCount === 1 ? 'expense' : 'expenses'}`}
                  large
                  style={{ gridColumn: 'span 2' }}
                />
                <StatCard
                  label="Per person"
                  value={money(ins.avgPerPersonMinor)}
                  caption={`across ${activeCount} ${activeCount === 1 ? 'person' : 'people'}`}
                />
                <StatCard label="Expenses" value={String(ins.expenseCount)} caption="logged" />
                <StatCard label="Avg expense" value={money(ins.avgPerExpenseMinor)} caption="per charge" />
                <StatCard
                  label="You paid"
                  value={money(ins.viewerPaidMinor)}
                  caption={`${youPaidPct}% of spend`}
                  tone="owed"
                />
                <StatCard
                  label="Your net"
                  value={formatMoney(ins.viewerNetMinor, primary, { signed: true })}
                  caption={netCaption}
                  tone={netTone}
                />
              </div>
            </section>

            {/* ---- largest expense ---- */}
            {ins.largest && (
              <Link
                to={groupId ? `/app/g/${groupId}/expense/${ins.largest.expenseId}` : '/app'}
                className="ev-row-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  marginTop: 12,
                  padding: '16px 18px',
                  borderRadius: 16,
                  background: EV.surface,
                  boxShadow: 'var(--ev-shadow-soft)',
                }}
              >
                <IconTile size={44} radius={14} tone="warm">
                  <TagIcon size={20} />
                </IconTile>
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: EV.ink42 }}>
                    Largest expense
                  </div>
                  <div className="truncate" style={{ fontSize: 15, fontWeight: 600, color: EV.ink, marginTop: 3 }}>
                    {ins.largest.description || 'Untitled'}
                  </div>
                </div>
                <MoneyText tone="neutral" size={18} weight={600} display>
                  {money(ins.largest.amountMinor)}
                </MoneyText>
              </Link>
            )}

            {/* ---- donuts ---- */}
            <section style={{ marginTop: 30 }}>
              <SectionLabel>Where it went</SectionLabel>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 12,
                  marginTop: 14,
                }}
              >
                <ChartCard title="By category">
                  <div className="flex items-center" style={{ gap: 20, flexWrap: 'wrap' }}>
                    <Donut
                      segments={categorySegments}
                      centerValue={money(ins.totalMinor)}
                      centerLabel="spent"
                    />
                    <DonutLegend segments={categorySegments} total={ins.totalMinor} format={money} />
                  </div>
                </ChartCard>

                <ChartCard title="By person">
                  <div className="flex items-center" style={{ gap: 20, flexWrap: 'wrap' }}>
                    <Donut
                      segments={personSegments}
                      centerValue={`${personSegments.length}`}
                      centerLabel={personSegments.length === 1 ? 'payer' : 'payers'}
                    />
                    <DonutLegend
                      segments={personSegments}
                      total={ins.totalMinor}
                      format={money}
                      leading={(seg) => <Avatar id={seg.id} name={seg.label} size={22} />}
                    />
                  </div>
                </ChartCard>
              </div>
            </section>

            {/* ---- spending over time ---- */}
            {weeklyBars.length > 0 && (
              <section style={{ marginTop: 30 }}>
                <SectionLabel>Spending over time</SectionLabel>
                <ChartCard title="By week" style={{ marginTop: 14 }}>
                  <WeeklyBars bars={weeklyBars} />
                </ChartCard>
              </section>
            )}

            {/* ---- biggest expenses ---- */}
            {biggest.length > 0 && (
              <section style={{ marginTop: 30, marginBottom: 8 }}>
                <SectionLabel>Biggest expenses</SectionLabel>
                <div
                  style={{
                    marginTop: 14,
                    padding: '4px 18px',
                    borderRadius: 16,
                    background: EV.surface,
                    boxShadow: 'var(--ev-shadow-soft)',
                  }}
                >
                  {biggest.map((b, i) => (
                    <BiggestRow
                      key={b.rec.recordId}
                      rec={b.rec}
                      amount={b.amount}
                      primary={primary}
                      groupId={groupId}
                      identities={identities}
                      last={i === biggest.length - 1}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- chart card */

function ChartCard({
  title,
  children,
  style,
}: {
  title: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        background: EV.surface,
        borderRadius: 16,
        boxShadow: 'var(--ev-shadow-soft)',
        padding: '18px 20px',
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: EV.ink42,
          marginBottom: 16,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------- biggest row */

function BiggestRow({
  rec,
  amount,
  primary,
  groupId,
  identities,
  last,
}: {
  rec: RecordData<ExpenseData>
  amount: number
  primary: string
  groupId: string | undefined
  identities: Map<MemberId, { displayName: string }>
  last: boolean
}) {
  const navigate = useNavigate()
  const e = rec.data
  const Icon = categoryIcon(e.category)
  const foreign = e.currency !== primary

  return (
    <ActivityRow
      icon={<Icon size={19} />}
      iconTone={e.receiptId ? 'warm' : 'neutral'}
      interactive
      title={
        <>
          {e.description || 'Untitled'}
          {e.receiptId ? <ReceiptBadge /> : null}
        </>
      }
      subtitle={`${payerSummary(identities, e.paidBy)} · ${categoryLabel(e.category)}`}
      amount={formatMoney(amount, primary)}
      subAmount={foreign ? formatMoney(e.amountMinor, e.currency) : undefined}
      noDivider={last}
      onClick={groupId ? () => navigate(`/app/g/${groupId}/expense/${rec.recordId}`) : undefined}
    />
  )
}

/* ----------------------------------------------------------------- empty/load */

function EmptyInsights({ groupId }: { groupId: string | undefined }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ marginTop: 26, padding: '44px 24px', borderRadius: 20, background: EV.surface, boxShadow: 'var(--ev-shadow-soft)' }}
    >
      <IconTile size={56} radius={18} tone="honey">
        <TagIcon size={26} />
      </IconTile>
      <div style={{ fontFamily: EV.fontDisplay, fontSize: 22, fontWeight: 500, color: EV.ink, marginTop: 16 }}>
        Nothing to chart yet
      </div>
      <p style={{ fontSize: 14, color: EV.ink55, marginTop: 6, maxWidth: 340, lineHeight: 1.5 }}>
        Add a few expenses and the totals, breakdowns, and trends fill in here.
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

function CenterState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
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

function Bar({ w, h = 14, mt = 0, radius = 6 }: { w: number | string; h?: number; mt?: number; radius?: number }) {
  return <div style={{ width: w, height: h, borderRadius: radius, background: EV.fillGhost, marginTop: mt }} />
}

function InsightsSkeleton({ backTo, groupName }: { backTo: string; groupName: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 940 }}>
        <Link
          to={backTo}
          className="ev-pressable"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: EV.ink55, fontSize: 14, fontWeight: 600, marginBottom: 18 }}
        >
          <ChevronLeftIcon size={18} />
          {groupName}
        </Link>
        <Bar w={180} h={11} />
        <Bar w={280} h={32} mt={10} />
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 26 }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ background: EV.surface, borderRadius: 16, boxShadow: 'var(--ev-shadow-soft)', padding: 18 }}>
              <Bar w="55%" h={10} />
              <Bar w="70%" h={24} mt={12} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 30 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ background: EV.surface, borderRadius: 16, boxShadow: 'var(--ev-shadow-soft)', padding: 20, height: 220 }}>
              <Bar w={120} h={10} />
              <div className="flex items-center" style={{ gap: 20, marginTop: 18 }}>
                <div style={{ width: 150, height: 150, borderRadius: 999, background: EV.fillGhost }} />
                <div className="flex-1 flex flex-col" style={{ gap: 12 }}>
                  {[0, 1, 2, 3].map((j) => (
                    <Bar key={j} w="100%" h={12} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
