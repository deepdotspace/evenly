/**
 * Record a payment (CONTRACT §3.7, §1.8). A manual/cash settlement form, also
 * the partial-payment path: enter an amount smaller than the balance and the
 * remainder carries (no special state -- it's just a smaller ledger entry).
 *
 * Member pick is on-brand avatar chips (from / to); currency, method and date
 * are compact styled controls. On save it calls the `recordSettlement` action;
 * balances re-derive live from the new row.
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Avatar, Button, EV, Sheet, minorDigits } from '../../design'
import type { SettlementMethod } from '../../lib/data/types'
import { recordSettlement } from './api'

export interface MemberOption {
  id: string
  name: string
}

export interface RecordPrefill {
  from?: string
  to?: string
  amountMinor?: number
  method?: SettlementMethod
}

export interface RecordPaymentSheetProps {
  open: boolean
  onClose: () => void
  groupId: string
  primary: string
  members: MemberOption[]
  prefill?: RecordPrefill
  /** Called after a successful write (parent shows a toast). */
  onRecorded: (summary: { fromName: string; toName: string; amountMinor: number; currency: string }) => void
}

const METHODS: { id: SettlementMethod; label: string }[] = [
  { id: 'manual', label: 'Manually' },
  { id: 'cash', label: 'Cash' },
  { id: 'venmo', label: 'Venmo' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'cashapp', label: 'Cash App' },
  { id: 'upi', label: 'UPI' },
]

/** yyyy-mm-dd in the local timezone (avoids the UTC off-by-one). */
function todayLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Parse a yyyy-mm-dd date input as LOCAL noon (stable, not UTC-shifted). */
function localMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return Date.now()
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
}

function formatPreview(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: minorDigits(currency),
      maximumFractionDigits: minorDigits(currency),
    }).format(amountMinor / 10 ** minorDigits(currency))
  } catch {
    return `${(amountMinor / 10 ** minorDigits(currency)).toFixed(minorDigits(currency))} ${currency}`
  }
}

const fieldLabel: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: EV.ink42,
}

const controlStyle: CSSProperties = {
  width: '100%',
  appearance: 'none',
  WebkitAppearance: 'none',
  border: `1px solid ${EV.borderGhost}`,
  background: EV.surface,
  borderRadius: 12,
  padding: '11px 13px',
  fontFamily: EV.fontUI,
  fontSize: 14,
  fontWeight: 500,
  color: EV.ink,
}

export function RecordPaymentSheet({
  open,
  onClose,
  groupId,
  primary,
  members,
  prefill,
  onRecorded,
}: RecordPaymentSheetProps) {
  const nameOf = useMemo(() => {
    const m = new Map(members.map((x) => [x.id, x.name]))
    return (id: string) => m.get(id) ?? 'Someone'
  }, [members])

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(primary)
  const [method, setMethod] = useState<SettlementMethod>('manual')
  const [date, setDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed every time the sheet opens (prefill from a tapped row, else blank).
  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    setFrom(prefill?.from ?? '')
    setTo(prefill?.to ?? '')
    setCurrency(primary)
    setMethod(prefill?.method ?? 'manual')
    setDate(todayLocal())
    setNote('')
    setAmount(
      prefill?.amountMinor != null
        ? (prefill.amountMinor / 10 ** minorDigits(primary)).toFixed(minorDigits(primary))
        : '',
    )
  }, [open, prefill, primary])

  const currencyOptions = useMemo(
    () => Array.from(new Set([primary, 'USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD'])),
    [primary],
  )

  const amountMinor = useMemo(() => {
    const n = Number.parseFloat(amount)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.round(n * 10 ** minorDigits(currency))
  }, [amount, currency])

  const valid = from !== '' && to !== '' && from !== to && amountMinor > 0

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const res = await recordSettlement({
      groupId,
      fromUserId: from,
      toUserId: to,
      amountMinor,
      currency,
      method,
      note: note.trim() || null,
      settledAtMs: localMs(date),
    })
    if (res.success) {
      onRecorded({ fromName: nameOf(from), toName: nameOf(to), amountMinor, currency })
      onClose()
    } else {
      setError(res.error ?? 'Could not record the payment.')
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Record a payment">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <ChipPicker label="Who paid" members={members} value={from} onPick={setFrom} disabledId={to} />
        <ChipPicker label="Paid to" members={members} value={to} onPick={setTo} disabledId={from} />

        {/* amount + currency */}
        <div>
          <div style={fieldLabel}>Amount</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="ev-input"
              style={{
                ...controlStyle,
                flex: 1,
                fontSize: 16,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums lining-nums',
              }}
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ ...controlStyle, width: 104, flex: 'none', cursor: 'pointer' }}
              aria-label="Currency"
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {currency !== primary && (
            <div style={{ fontSize: 11.5, color: EV.ink45, marginTop: 6 }}>
              Recorded with today's rate to {primary}.
            </div>
          )}
        </div>

        {/* method + date */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={fieldLabel}>Method</div>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as SettlementMethod)}
              style={{ ...controlStyle, marginTop: 7, cursor: 'pointer' }}
              aria-label="Method"
            >
              {METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={fieldLabel}>Date</div>
            <input
              type="date"
              value={date}
              max={todayLocal()}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...controlStyle, marginTop: 7, cursor: 'pointer' }}
              aria-label="Date"
            />
          </div>
        </div>

        {/* note */}
        <div>
          <div style={fieldLabel}>Note</div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
            className="ev-input"
            style={{ ...controlStyle, marginTop: 7 }}
          />
        </div>

        {error && (
          <div
            role="alert"
            style={{
              fontSize: 13,
              color: EV.clayDeep,
              background: EV.badgeBg,
              borderRadius: 12,
              padding: '10px 13px',
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        <Button fullWidth size="lg" onClick={submit} disabled={!valid || busy}>
          {busy ? 'Recording…' : amountMinor > 0 ? `Record ${formatPreview(amountMinor, currency)}` : 'Record payment'}
        </Button>
      </div>
    </Sheet>
  )
}

/* A row of selectable avatar chips -- the on-brand member picker. */
function ChipPicker({
  label,
  members,
  value,
  onPick,
  disabledId,
}: {
  label: string
  members: MemberOption[]
  value: string
  onPick: (id: string) => void
  disabledId?: string
}): ReactNode {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
        {members.map((m) => {
          const active = m.id === value
          const disabled = m.id === disabledId
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(m.id)}
              className="ev-pressable"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 11px 5px 5px',
                borderRadius: 999,
                border: `1px solid ${active ? EV.ink : EV.borderGhost}`,
                background: active ? EV.ink : EV.surface,
                color: active ? EV.paper : EV.ink,
                fontSize: 13,
                fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.35 : 1,
              }}
            >
              <Avatar id={m.id} name={m.name} size={22} />
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
