/**
 * Settle up (`/app/g/:groupId/settle`) — CONTRACT §3.7, §2.9/§2.10.
 *
 * The signature "settle to even" beat. Shows the payment plan derived from the
 * ledger: Simplified (greedy, fewest payments) or Direct (raw pairwise) via a
 * personal toggle seeded from the group default (R3 — never writes it). Each row
 * deep-links the payee's payment handles with the amount prefilled, or falls back
 * to copy. Record full or partial payments, or "Mark all settled" to record the
 * settlements that zero the plan and land back on the group view where the bars
 * resolve to even and the "=" lands.
 *
 * Balances are derived (D2) from the ledger via the pure selectors using each
 * row's stored FX snapshot (§2.8) — the same numbers the group view shows, so the
 * plan here and the bars there always agree.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from 'deepspace'
import {
  ArrowRightIcon,
  Avatar,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  EV,
  EqualsIcon,
  EqualsMark,
  IconTile,
  MoneyText,
  PillTabs,
  SectionLabel,
  formatMoney,
  useToast,
} from '../../../../../design'
import { useGroup, useGroupMembers, useExpenses, useSettlements } from '../../../../../hooks'
import {
  EVEN_TOLERANCE,
  groupNet,
  memberIdentityMap,
  settlePlan,
  truthy,
  type MemberId,
  type SettleEdge,
} from '../../../../../lib/data'
import type { PaymentHandles, SettlementMethod } from '../../../../../lib/data/types'
import {
  PaymentHandoffSheet,
  RecordPaymentSheet,
  recordSettlement,
  type MemberOption,
  type RecordPrefill,
} from '../../../../../components/settle'

export default function SettlePage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const toast = useToast()

  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)

  // Personal simplify view-pref, seeded once from the group default (R3).
  const [simplify, setSimplify] = useState(false)
  const [seeded, setSeeded] = useState(false)
  if (group.record && !seeded) {
    setSeeded(true)
    setSimplify(truthy(group.record.data.simplifyDefault))
  }

  const primary = group.record?.data.primaryCurrency ?? 'USD'
  const groupName = group.record?.data.name ?? 'Group'
  const backTo = groupId ? `/app/g/${groupId}` : '/app'

  const identities = useMemo(() => memberIdentityMap(members.records), [members.records])
  const handlesById = useMemo(() => {
    const m = new Map<MemberId, PaymentHandles | null>()
    for (const rec of members.records) {
      const id = (rec.data.userId ?? rec.data.guestId) as MemberId | undefined
      if (id) m.set(id, rec.data.paymentHandles ?? null)
    }
    return m
  }, [members.records])

  const memberOptions = useMemo<MemberOption[]>(
    () =>
      members.records
        .filter((m) => m.data.status !== 'removed')
        .map((m) => ({
          id: (m.data.userId ?? m.data.guestId ?? m.recordId) as string,
          name: m.data.displayName,
        })),
    [members.records],
  )

  const edges = useMemo<SettleEdge[]>(
    () =>
      group.record
        ? settlePlan(group.record, expenses.records, settlements.records, simplify)
        : [],
    [group.record, expenses.records, settlements.records, simplify],
  )

  // "Squared" is a property of the NET (the same signal as the group's All-even
  // hero), not of the edge list: settling via the simplified plan can leave the
  // raw pairwise (Direct) view with offsetting circular edges that net to zero.
  // Keying the empty state on the net keeps both toggles honest and prevents a
  // "Mark all settled" that would record overpayments on an already-even group.
  const squared = useMemo(() => {
    if (!group.record) return false
    const net = groupNet(group.record, expenses.records, settlements.records)
    const values = Object.values(net)
    if (values.length === 0) return true
    return values.every((v) => Math.abs(v) <= EVEN_TOLERANCE)
  }, [group.record, expenses.records, settlements.records])

  const nameFor = useMemo(() => {
    return (id: string | undefined): string => {
      if (!id) return 'Someone'
      return identities.get(id)?.displayName ?? (id.startsWith('guest:') ? 'Guest' : 'Someone')
    }
  }, [identities])

  const note = `Settle up · ${groupName}`

  /* ----------------------------------------------------------------- sheets */
  const [handoffEdge, setHandoffEdge] = useState<SettleEdge | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordPrefill, setRecordPrefill] = useState<RecordPrefill | undefined>(undefined)
  const [marking, setMarking] = useState(false)

  function openRecord(prefill?: RecordPrefill) {
    setRecordPrefill(prefill)
    setRecordOpen(true)
  }

  async function recordEdgeFull(edge: SettleEdge, method: SettlementMethod) {
    setHandoffEdge(null)
    const res = await recordSettlement({
      groupId: groupId as string,
      fromUserId: edge.from,
      toUserId: edge.to,
      amountMinor: edge.amount,
      currency: primary,
      method,
      note,
    })
    if (res.success) {
      toast.success(
        'Payment recorded',
        `${nameFor(edge.from)} → ${nameFor(edge.to)} · ${formatMoney(edge.amount, primary)}`,
      )
    } else {
      toast.error('Could not record', res.error ?? 'Please try again.')
    }
  }

  async function markAllSettled() {
    if (marking || edges.length === 0) return
    setMarking(true)
    let failures = 0
    for (const edge of edges) {
      const res = await recordSettlement({
        groupId: groupId as string,
        fromUserId: edge.from,
        toUserId: edge.to,
        amountMinor: edge.amount,
        currency: primary,
        method: 'manual',
        note,
      })
      if (!res.success) failures++
    }
    setMarking(false)
    if (failures === 0) {
      toast.success('Settled to even', 'Watch the balances slide to zero.')
      navigate(backTo)
    } else {
      toast.error('Some payments failed', `${failures} of ${edges.length} could not be recorded.`)
    }
  }

  /* ------------------------------------------------------------- load/error */
  const errored = group.status === 'error'
  const notFound = group.status === 'ready' && !group.record
  // Hold the skeleton until the ledger has loaded: the "all square" headline derives
  // over expenses + settlements, so rendering before the first ledger response would
  // flash the settled state on a group that still owes (R5-3).
  const loading =
    (group.status === 'loading' && !group.record) ||
    (expenses.status === 'loading' && expenses.records.length === 0) ||
    (settlements.status === 'loading' && settlements.records.length === 0)

  if (errored) {
    return (
      <CenterState
        title="Couldn't load settle up"
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
  if (loading) return <SettleSkeleton backTo={backTo} groupName={groupName} />

  // Square by net, OR nothing left to pay in the current view.
  const allSquare = squared || edges.length === 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 620 }}>
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

        {allSquare ? (
          <AllSquare onRecord={() => openRecord()} />
        ) : (
          <>
            {/* heading */}
            <SectionLabel>{`${primary} · ${edges.length} ${edges.length === 1 ? 'payment' : 'payments'} to settle`}</SectionLabel>
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
              Settle to even
            </h1>
            <p style={{ fontSize: 14, color: EV.ink55, marginTop: 4, lineHeight: 1.5 }}>
              {simplify
                ? 'The fewest payments that make everyone square.'
                : 'Who owes whom, directly.'}
            </p>

            {/* simplify / direct toggle (personal view pref) */}
            <PillTabs
              fill
              tabs={[
                { id: 'simplified', label: 'Simplified' },
                { id: 'direct', label: 'Direct' },
              ]}
              value={simplify ? 'simplified' : 'direct'}
              onChange={(id) => setSimplify(id === 'simplified')}
              style={{ marginTop: 18, maxWidth: 320 }}
            />

            {/* the plan */}
            <div style={{ marginTop: 22 }}>
              {edges.map((edge, i) => (
                <SettleRow
                  key={`${edge.from}-${edge.to}-${i}`}
                  edge={edge}
                  primary={primary}
                  fromName={nameFor(edge.from)}
                  toName={nameFor(edge.to)}
                  hasHandles={hasAnyHandle(handlesById.get(edge.to))}
                  last={i === edges.length - 1}
                  onClick={() => setHandoffEdge(edge)}
                />
              ))}
            </div>

            {/* mark all settled — the signature beat */}
            <Button
              fullWidth
              size="lg"
              onClick={markAllSettled}
              disabled={marking}
              iconRight={<EqualsIcon size={20} strokeWidth={2.6} />}
              style={{ marginTop: 24 }}
            >
              {marking ? 'Settling…' : 'Mark all settled'}
            </Button>
            <p style={{ textAlign: 'center', fontSize: 12.5, color: EV.ink40, marginTop: 12 }}>
              Watch the bars resolve on the group screen.
            </p>

            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <Button variant="quiet" size="sm" onClick={() => openRecord()}>
                Record a payment manually
              </Button>
            </div>
          </>
        )}
      </div>

      {/* per-payee pay handoff */}
      <PaymentHandoffSheet
        open={handoffEdge !== null}
        onClose={() => setHandoffEdge(null)}
        edge={handoffEdge}
        primary={primary}
        fromName={nameFor(handoffEdge?.from)}
        toName={nameFor(handoffEdge?.to)}
        payeeHandles={handoffEdge ? handlesById.get(handoffEdge.to) ?? null : null}
        note={note}
        onMarkPaid={recordEdgeFull}
        onRecordDifferent={(edge) => {
          setHandoffEdge(null)
          openRecord({ from: edge.from, to: edge.to, amountMinor: edge.amount })
        }}
        onCopied={(text) => toast.success('Amount copied', text)}
      />

      {/* record / partial-payment form */}
      <RecordPaymentSheet
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        groupId={groupId as string}
        primary={primary}
        members={memberOptions}
        prefill={recordPrefill}
        onRecorded={({ fromName, toName, amountMinor, currency }) =>
          toast.success('Payment recorded', `${fromName} → ${toName} · ${formatMoney(amountMinor, currency)}`)
        }
      />
    </div>
  )
}

function hasAnyHandle(h: PaymentHandles | null | undefined): boolean {
  return !!h && !!(h.venmo || h.paypalMe || h.cashtag || h.upiId)
}

/* --------------------------------------------------------------- settle row */

function SettleRow({
  edge,
  primary,
  fromName,
  toName,
  hasHandles,
  last,
  onClick,
}: {
  edge: SettleEdge
  primary: string
  fromName: string
  toName: string
  hasHandles: boolean
  last: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ev-pressable"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '15px 4px',
        background: 'none',
        border: 'none',
        borderBottom: last ? 'none' : `1px solid ${EV.line}`,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Avatar id={edge.from} name={fromName} size={34} />
        <ArrowRightIcon size={20} style={{ color: EV.ink35, margin: '0 2px' }} />
        <Avatar id={edge.to} name={toName} size={34} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            color: EV.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fromName} pays {toName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
          <span style={{ fontSize: 12.5, color: EV.ink50 }}>
            {hasHandles ? 'Tap to pay · one tap' : 'Tap to record'}
          </span>
          {edge.simplified && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: EV.honey,
                background: EV.tileHoney,
                borderRadius: 999,
                padding: '2px 7px',
              }}
            >
              Simplified
            </span>
          )}
        </div>
      </div>

      <MoneyText tone="neutral" size={15.5} weight={600}>
        {formatMoney(edge.amount, primary)}
      </MoneyText>
      <ChevronRightIcon size={17} style={{ color: EV.ink35, flexShrink: 0 }} />
    </button>
  )
}

/* ------------------------------------------------------------- empty / load */

function AllSquare({ onRecord }: { onRecord: () => void }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ paddingTop: 'clamp(24px, 8vh, 80px)' }}>
      <IconTile size={72} radius={22} tone="honey">
        <EqualsMark size={38} bg="transparent" markColor={EV.honey} markStroke={2.6} />
      </IconTile>
      <div
        style={{
          fontFamily: EV.fontDisplay,
          fontSize: 'clamp(26px, 5vw, 32px)',
          fontWeight: 500,
          color: EV.ink,
          marginTop: 18,
          letterSpacing: '-0.01em',
        }}
      >
        You're all square
      </div>
      <p style={{ fontSize: 14, color: EV.ink55, marginTop: 8, maxWidth: 340, lineHeight: 1.5 }}>
        Every balance is zero. No reminders, no awkward math, just an even split.
      </p>
      <div style={{ marginTop: 20 }}>
        <Button variant="secondary" size="sm" onClick={onRecord}>
          Record a payment anyway
        </Button>
      </div>
    </div>
  )
}

function CenterState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div
        className="flex flex-col items-center text-center"
        style={{ paddingTop: 'clamp(48px, 14vh, 140px)' }}
      >
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

function SettleSkeleton({ backTo, groupName }: { backTo: string; groupName: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 620 }}>
        <Link
          to={backTo}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: EV.ink55, fontSize: 14, fontWeight: 600, marginBottom: 18 }}
        >
          <ChevronLeftIcon size={18} />
          {groupName}
        </Link>
        <Bar w={160} h={11} />
        <Bar w={220} h={32} mt={10} />
        <Bar w={300} h={40} mt={20} />
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Bar w={88} h={34} />
              <div className="flex-1">
                <Bar w="55%" h={13} />
                <Bar w="32%" h={11} mt={7} />
              </div>
              <Bar w={56} h={14} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
