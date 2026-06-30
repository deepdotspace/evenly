/**
 * ExpenseDetail — the full breakdown of one expense (CONTRACT §3.9).
 *
 * Description, category, amount (+ converted), date, paid-by (multi-payer aware),
 * every member's resolved share with the split type explained, the rounding note,
 * the receipt image when itemized, the note, a read-only comments list, and this
 * expense's history (its `activity` rows). Edit / soft-delete / restore route or
 * call the server actions; deletes are soft + revertible (D7).
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from 'deepspace'
import {
  ActivityRow,
  Avatar,
  Button,
  ChevronLeftIcon,
  EV,
  IconTile,
  MoneyText,
  SectionLabel,
  Surface,
  categoryIcon,
  formatMoney,
  useToast,
} from '../../design'
import { useActivity, useComments, useExpenses, useGroup, useGroupMembers, useReceipt } from '../../hooks'
import { convertMinorAt } from '../../lib/fx'
import { safeUrl } from '../../lib/util/safeUrl'
import type { MemberId, SplitConfig } from '../../lib/split'
import type { ExpenseData } from '../../lib/data/types'
import { callAction, nameMap, rosterFrom } from './shared'
import { CATEGORIES } from './shared'
import { inputStyle } from './fields'
import type { ExpenseDataWithNote } from './useExpenseForm'

function splitExplanation(cfg: SplitConfig): string {
  if (cfg.scope === 'itemized') return 'Split by item'
  switch (cfg.baseType) {
    case 'equal':
      return 'Split equally'
    case 'exact':
      return 'Split by exact amounts'
    case 'percent':
      return 'Split by percentage'
    case 'shares':
      return 'Split by shares'
    case 'treat':
      return 'A treat, the payer covered it'
    default:
      return 'Custom split'
  }
}

function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? 'Other'
}

export function ExpenseDetail({ groupId, expenseId }: { groupId: string; expenseId: string }) {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const expenses = useExpenses(groupId, { includeDeleted: true })
  const activity = useActivity(groupId)
  const comments = useComments(expenseId)

  const rec = useMemo(
    () => expenses.records.find((r) => r.recordId === expenseId) ?? null,
    [expenses.records, expenseId],
  )
  const receipt = useReceipt(rec?.data.receiptId ?? undefined)

  const roster = useMemo(() => rosterFrom(members.records, userId ?? undefined), [members.records, userId])
  const names = useMemo(() => nameMap(roster), [roster])
  const nameOf = (id: MemberId | undefined) =>
    !id ? 'Someone' : id === userId ? 'You' : names.get(id) ?? (id.startsWith('guest:') ? 'Guest' : 'Someone')

  const [busy, setBusy] = useState(false)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)

  const primary = group.record?.data.primaryCurrency ?? 'USD'

  const history = useMemo(
    () => activity.records.filter((a) => a.data.targetId === expenseId),
    [activity.records, expenseId],
  )

  // ---- loading / not found ----
  const loading = expenses.status === 'loading' && !rec
  if (loading) return <DetailSkeleton />
  if (!rec) {
    return (
      <Centered
        title="Expense not found"
        body="It may have been removed, or you're no longer a member of this group."
        action={
          <Link to={`/app/g/${groupId}`}>
            <Button variant="secondary">Back to group</Button>
          </Link>
        }
      />
    )
  }

  const e = rec.data as ExpenseDataWithNote
  const deleted = !!e.deletedAt
  const Icon = categoryIcon(e.category)
  const foreign = e.currency !== primary
  const convertedMinor = foreign ? convertMinorAt(e.amountMinor, e.currency, primary, e.fxRate) : e.amountMinor
  const payers = Object.entries(e.paidBy)
  const splitRows = Object.entries(e.splits).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1])
  const dateStr = e.expenseAtMs ? new Date(e.expenseAtMs).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : null

  async function act(action: 'softDeleteExpense' | 'restoreExpense') {
    if (busy) return
    setBusy(true)
    const res = await callAction(action, { expenseId })
    setBusy(false)
    if (res.success) {
      toast.success(action === 'softDeleteExpense' ? 'Expense deleted' : 'Expense restored')
      if (action === 'softDeleteExpense') navigate(`/app/g/${groupId}`)
    } else {
      toast.error('Could not update', res.error ?? 'Please try again.')
    }
  }

  async function sendComment() {
    const body = comment.trim()
    if (!body || sending) return
    setSending(true)
    // The comments list is a live useRecords query, so the new row arrives over
    // realtime; we just clear the field on success and never manually refetch.
    const res = await callAction('addComment', { expenseId, body })
    setSending(false)
    if (res.success) {
      setComment('')
    } else {
      toast.error('Could not post comment', res.error ?? 'Please try again.')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 680 }}>
        <Link
          to={`/app/g/${groupId}`}
          className="ev-pressable inline-flex items-center gap-1.5"
          style={{ fontSize: 14, fontWeight: 600, color: EV.ink55, marginBottom: 18 }}
        >
          <ChevronLeftIcon size={18} />
          {group.record?.data.name ?? 'Group'}
        </Link>

        {deleted && (
          <div
            className="flex items-center justify-between gap-3 flex-wrap"
            style={{ padding: '12px 14px', borderRadius: 13, background: EV.badgeBg, marginBottom: 16 }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: EV.clayDeep }}>This expense was deleted.</span>
            <Button size="sm" variant="secondary" onClick={() => act('restoreExpense')} disabled={busy}>
              Restore
            </Button>
          </div>
        )}

        {/* header */}
        <div className="flex items-start gap-4">
          <IconTile size={54} radius={17} tone={e.receiptId ? 'warm' : 'neutral'}>
            <Icon size={26} />
          </IconTile>
          <div className="min-w-0" style={{ flex: 1 }}>
            <SectionLabel>{categoryLabel(e.category)}</SectionLabel>
            <h1
              style={{
                fontFamily: EV.fontDisplay,
                fontSize: 'clamp(24px, 4vw, 30px)',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: EV.ink,
                marginTop: 3,
                textDecoration: deleted ? 'line-through' : undefined,
                opacity: deleted ? 0.6 : 1,
              }}
            >
              {e.description}
            </h1>
            {dateStr && <div style={{ fontSize: 13, color: EV.ink55, marginTop: 4 }}>{dateStr}</div>}
          </div>
        </div>

        {/* amount */}
        <div style={{ marginTop: 22 }}>
          <div
            style={{
              fontFamily: EV.fontDisplay,
              fontSize: 'clamp(38px, 7vw, 52px)',
              fontWeight: 500,
              color: EV.ink,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums lining-nums',
            }}
          >
            {formatMoney(e.amountMinor, e.currency)}
          </div>
          {foreign && (
            <div style={{ fontSize: 13.5, color: EV.ink55, marginTop: 6 }}>
              ≈ {formatMoney(convertedMinor, primary)} in {primary} · snapshot rate {e.fxRate.toFixed(4)}
            </div>
          )}
        </div>

        {/* paid by */}
        <Surface variant="card" style={{ padding: '18px 20px', marginTop: 22 }}>
          <SectionLabel style={{ marginBottom: 12 }}>Paid by</SectionLabel>
          {payers.length === 1 ? (
            <div className="flex items-center gap-3">
              <Avatar id={payers[0][0]} name={nameOf(payers[0][0])} size={30} />
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: EV.ink }}>{nameOf(payers[0][0])}</span>
              <MoneyText amountMinor={payers[0][1]} currency={e.currency} tone="neutral" size={14.5} weight={600} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {payers
                .sort((a, b) => b[1] - a[1])
                .map(([id, v]) => (
                  <div key={id} className="flex items-center gap-3">
                    <Avatar id={id} name={nameOf(id)} size={28} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: EV.ink }}>{nameOf(id)}</span>
                    <MoneyText amountMinor={v} currency={e.currency} tone="neutral" size={14} weight={600} />
                  </div>
                ))}
            </div>
          )}
        </Surface>

        {/* split */}
        <Surface variant="card" style={{ padding: '18px 20px', marginTop: 16 }}>
          <SectionLabel style={{ marginBottom: 4 }}>Split</SectionLabel>
          <p style={{ fontSize: 13, color: EV.ink55, marginBottom: 12 }}>{splitExplanation(e.splitConfig)}</p>
          <div className="flex flex-col">
            {splitRows.map(([id, v], i) => (
              <div
                key={id}
                className="flex items-center gap-3"
                style={{ padding: '10px 0', borderBottom: i === splitRows.length - 1 ? 'none' : `1px solid ${EV.line}` }}
              >
                <Avatar id={id} name={nameOf(id)} size={28} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: EV.ink }}>{nameOf(id)}</span>
                <MoneyText amountMinor={v} currency={e.currency} tone="neutral" size={14} weight={600} />
              </div>
            ))}
          </div>
          <RoundingHint splits={e.splits} cfg={e.splitConfig} currency={e.currency} nameOf={nameOf} />
        </Surface>

        {/* receipt */}
        {e.receiptId && safeUrl(receipt.record?.data.imageUrl, { image: true }) && (
          <Surface variant="card" style={{ padding: 14, marginTop: 16 }}>
            <SectionLabel style={{ marginBottom: 10 }}>Receipt</SectionLabel>
            <a href={safeUrl(receipt.record?.data.imageUrl)} target="_blank" rel="noreferrer">
              <img
                src={safeUrl(receipt.record?.data.imageUrl, { image: true })}
                alt="Receipt"
                style={{ width: '100%', borderRadius: 12, display: 'block', maxHeight: 460, objectFit: 'cover' }}
                onError={(ev) => {
                  ;(ev.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            </a>
          </Surface>
        )}

        {/* note */}
        {e.note && e.note.trim() && (
          <Surface variant="card" style={{ padding: '16px 20px', marginTop: 16 }}>
            <SectionLabel style={{ marginBottom: 8 }}>Note</SectionLabel>
            <p style={{ fontSize: 14, color: EV.ink70, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{e.note}</p>
          </Surface>
        )}

        {/* comments */}
        <Surface variant="card" style={{ padding: '16px 20px', marginTop: 16 }}>
          <SectionLabel style={{ marginBottom: 12 }}>Comments</SectionLabel>
          {comments.records.length > 0 && (
            <div className="flex flex-col gap-3" style={{ marginBottom: 16 }}>
              {comments.records.map((c) => (
                <div key={c.recordId} className="flex items-start gap-3">
                  <Avatar id={c.createdBy} name={nameOf(c.createdBy)} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: EV.ink }}>{nameOf(c.createdBy)}</div>
                    <p style={{ fontSize: 13.5, color: EV.ink70, lineHeight: 1.45, marginTop: 1 }}>{c.data.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <textarea
            className="ev-input"
            value={comment}
            onChange={(ev) => setComment(ev.target.value)}
            placeholder="Add a comment"
            maxLength={2000}
            style={{ ...inputStyle, fontSize: 14, minHeight: 64, resize: 'vertical', lineHeight: 1.5 }}
            onKeyDown={(ev) => {
              if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
                ev.preventDefault()
                void sendComment()
              }
            }}
          />
          <div className="flex justify-end" style={{ marginTop: 10 }}>
            <Button size="sm" onClick={() => void sendComment()} disabled={!comment.trim() || sending}>
              {sending ? 'Sending' : 'Send'}
            </Button>
          </div>
        </Surface>

        {/* history */}
        {history.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <SectionLabel style={{ marginBottom: 4 }}>History</SectionLabel>
            {history.map((a, i) => (
              <ActivityRow
                key={a.recordId}
                icon={<HistoryDot />}
                iconTone="neutral"
                title={a.data.payload?.summary ?? a.data.type.replace('expense.', '')}
                subtitle={`${nameOf(a.data.actorId)} · ${new Date(Date.parse(a.createdAt) || Date.now()).toLocaleDateString()}`}
                noDivider={i === history.length - 1}
              />
            ))}
          </section>
        )}

        {/* actions */}
        {!deleted && (
          <div className="flex items-center gap-2.5" style={{ marginTop: 28 }}>
            <Link to={`/app/g/${groupId}/expense/${expenseId}/edit`} style={{ flex: 1 }}>
              <Button fullWidth>Edit</Button>
            </Link>
            <Button variant="secondary" onClick={() => act('softDeleteExpense')} disabled={busy}>
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function RoundingHint({
  splits,
  cfg,
  currency,
  nameOf,
}: {
  splits: Record<MemberId, number>
  cfg: SplitConfig
  currency: string
  nameOf: (id: MemberId) => string
}) {
  if (cfg.scope !== 'simple' || cfg.baseType !== 'equal') return null
  const ids = Object.keys(splits).filter((id) => splits[id] !== 0)
  if (ids.length < 2) return null
  const min = Math.min(...ids.map((id) => splits[id]))
  const extra = ids.filter((id) => splits[id] > min)
  if (extra.length === 0 || extra.length === ids.length) return null
  return (
    <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 10, lineHeight: 1.45 }}>
      Rounding: {extra.map(nameOf).join(', ')} covered the extra cent so it splits exactly.
    </p>
  )
}

function HistoryDot() {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: EV.honey, display: 'block' }} />
}

function Centered({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
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

function DetailSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 680 }}>
        <Bar w={120} h={11} />
        <Bar w="70%" h={30} mt={18} />
        <Bar w={180} h={48} mt={20} />
        <Bar w="100%" h={120} mt={22} />
        <Bar w="100%" h={160} mt={16} />
      </div>
    </div>
  )
}
