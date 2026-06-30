/**
 * RecurringCard — one row in the recurring-expenses list (CONTRACT §3.11).
 *
 * Shows the template (description, amount + currency badge, who pays, how it
 * splits), the cadence in words, the next run and last-posted times, and an
 * active/paused state. Actions: run now, edit, pause/resume, delete. A paused
 * template reads dimmed but stays fully actionable.
 */

import { type RecordData } from 'deepspace'
import {
  Button,
  EV,
  IconTile,
  MoneyText,
  categoryIcon,
  formatMoney,
} from '../../design'
import { truthy, type MemberId, type RecurringExpenseData } from '../../lib/data'
import { describeCadence } from './schedule'

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function fmtDate(ms: number | null | undefined): string | null {
  if (!ms) return null
  return DATE_FMT.format(new Date(ms))
}

export interface RecurringCardProps {
  row: RecordData<RecurringExpenseData>
  primary: string
  nameOf: (id: string | undefined) => string
  busy?: boolean
  onRunNow: () => void
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
}

export function RecurringCard({ row, primary, nameOf, busy, onRunNow, onEdit, onToggleActive, onDelete }: RecurringCardProps) {
  const rec = row.data
  const t = rec.template
  const active = truthy(rec.active)
  const Icon = categoryIcon(t.category)
  const foreign = t.currency !== primary

  const payerIds = Object.keys(t.paidBy ?? {})
  const payer =
    payerIds.length === 0
      ? 'Someone'
      : payerIds.length === 1
        ? nameOf(payerIds[0])
        : `${nameOf(payerIds[0])} +${payerIds.length - 1}`
  // "You pay" vs "Mara pays" — match the subject to the verb.
  const payerVerb = payerIds.length === 1 && nameOf(payerIds[0]) === 'You' ? 'pay' : 'pays'
  const splitN = (t.splitConfig?.participants?.length ?? Object.keys((t as { splits?: Record<MemberId, number> }).splits ?? {}).length) || 0

  const next = fmtDate(rec.nextRunAtMs)
  const last = fmtDate(rec.lastRunAtMs)
  const ends = fmtDate(rec.endsAtMs)

  return (
    <div
      style={{
        background: EV.surface,
        borderRadius: 18,
        boxShadow: 'var(--ev-shadow-soft)',
        padding: '18px 20px',
        opacity: active ? 1 : 0.72,
      }}
    >
      <div className="flex items-start gap-3.5">
        <IconTile size={44} radius={14} tone={active ? 'warm' : 'neutral'}>
          <Icon size={20} />
        </IconTile>

        <div className="min-w-0" style={{ flex: 1 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <span className="truncate" style={{ fontSize: 15.5, fontWeight: 600, color: EV.ink }}>
              {t.description || 'Untitled'}
            </span>
            {!active && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: EV.ink45,
                  background: EV.fillGhost,
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                Paused
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: EV.ink55, marginTop: 3 }}>
            {payer} {payerVerb} · split {splitN} {splitN === 1 ? 'way' : 'ways'}
          </div>
          <div style={{ fontSize: 12.5, color: EV.ink45, marginTop: 6, lineHeight: 1.5 }}>
            {describeCadence(rec.cadence)}
            {next && active ? ` · next ${next}` : ''}
            {ends ? ` · until ${ends}` : ''}
          </div>
          <div style={{ fontSize: 11.5, color: EV.ink42, marginTop: 2 }}>
            {last ? `Last posted ${last}` : 'Not posted yet'}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <MoneyText tone="neutral" size={17} weight={600} display>
            {formatMoney(t.amountMinor, t.currency)}
          </MoneyText>
          {foreign && (
            <div style={{ fontSize: 11, color: EV.ink45, marginTop: 2, fontWeight: 600 }}>{t.currency}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 16 }}>
        {active && (
          <Button size="sm" variant="secondary" onClick={onRunNow} disabled={busy}>
            Run now
          </Button>
        )}
        <Button size="sm" variant="quiet" onClick={onEdit} disabled={busy}>
          Edit
        </Button>
        <Button size="sm" variant="quiet" onClick={onToggleActive} disabled={busy}>
          {active ? 'Pause' : 'Resume'}
        </Button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="ev-pressable"
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: EV.ink45,
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            padding: '6px 8px',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
