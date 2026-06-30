/**
 * Per-payee pay handoff (CONTRACT §3.7). For one settle edge: deep-link the
 * payee's opted-in handles (Venmo / PayPal.me / Cash App / UPI) with the amount
 * + note prefilled; when no handle exists, fall back to "copy amount". The deep
 * link is UX only -- the ledger truth is the recorded settlement, so "Mark as
 * paid" writes the full amount and "A different amount" opens the partial form.
 */

import { useEffect, useMemo, useState } from 'react'
import { Avatar, ArrowRightIcon, Button, EV, Sheet, formatMoney } from '../../design'
import type { PaymentHandles } from '../../lib/data/types'
import type { SettleEdge } from '../../lib/data'
import {
  METHOD_FOR,
  majorAmount,
  openPayUrl,
  payOptions,
  type PayMethod,
  type PayOption,
} from './deeplinks'
import type { SettlementMethod } from '../../lib/data/types'

export interface PaymentHandoffSheetProps {
  open: boolean
  onClose: () => void
  edge: SettleEdge | null
  primary: string
  fromName: string
  toName: string
  payeeHandles: PaymentHandles | null
  note: string
  /** Record the full edge amount with the chosen method. */
  onMarkPaid: (edge: SettleEdge, method: SettlementMethod) => void
  /** Open the record form prefilled for a partial / different amount. */
  onRecordDifferent: (edge: SettleEdge) => void
  /** Surface a "copied" confirmation toast. */
  onCopied: (amountText: string) => void
}

export function PaymentHandoffSheet({
  open,
  onClose,
  edge,
  primary,
  fromName,
  toName,
  payeeHandles,
  note,
  onMarkPaid,
  onRecordDifferent,
  onCopied,
}: PaymentHandoffSheetProps) {
  const [chosen, setChosen] = useState<PayMethod | null>(null)
  useEffect(() => {
    if (open) setChosen(null)
  }, [open, edge])

  const amountText = edge ? majorAmount(edge.amount, primary) : ''
  const options = useMemo<PayOption[]>(
    () => (edge ? payOptions(payeeHandles, edge.amount, primary, note) : []),
    [edge, payeeHandles, primary, note],
  )

  function copyAmount() {
    const text = edge ? `${primary} ${amountText}` : amountText
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(amountText).catch(() => {})
    }
    onCopied(text)
  }

  const formattedAmount = edge ? formatMoney(edge.amount, primary) : ''

  return (
    <Sheet open={open && !!edge} onClose={onClose} title="Pay your share">
      {edge && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* from -> to header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: EV.tile,
              borderRadius: 16,
              padding: '16px 18px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Avatar id={edge.from} name={fromName} size={38} bordered />
              <ArrowRightIcon size={20} style={{ color: EV.ink35, margin: '0 2px' }} />
              <Avatar id={edge.to} name={toName} size={38} bordered />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: EV.ink }}>
                {fromName} pays {toName}
              </div>
              <div
                style={{
                  fontFamily: EV.fontDisplay,
                  fontSize: 26,
                  fontWeight: 500,
                  color: EV.ink,
                  letterSpacing: '-0.01em',
                  fontVariantNumeric: 'tabular-nums lining-nums',
                  marginTop: 2,
                }}
              >
                {formattedAmount}
              </div>
            </div>
          </div>

          {/* deep-link pills, or copy fallback */}
          {options.length > 0 ? (
            <div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: EV.ink42,
                  marginBottom: 9,
                }}
              >
                Open a payment app
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {options.map((o) => (
                  <button
                    key={o.method}
                    type="button"
                    onClick={() => {
                      setChosen(o.method)
                      openPayUrl(o)
                    }}
                    className="ev-pressable"
                    style={{
                      flex: '1 1 30%',
                      minWidth: 90,
                      textAlign: 'center',
                      padding: '12px 10px',
                      borderRadius: 12,
                      border: `1px solid ${chosen === o.method ? EV.clay : EV.borderGhost}`,
                      background: chosen === o.method ? EV.tileWarm : EV.fillGhost,
                      fontSize: 13,
                      fontWeight: 600,
                      color: EV.ink,
                      cursor: 'pointer',
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={copyAmount}
                className="ev-pressable"
                style={{
                  marginTop: 10,
                  background: 'none',
                  border: 'none',
                  color: EV.ink55,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Copy amount instead
              </button>
            </div>
          ) : (
            <div
              style={{
                background: EV.fillGhost,
                borderRadius: 14,
                padding: '14px 16px',
                fontSize: 13,
                color: EV.ink55,
                lineHeight: 1.5,
              }}
            >
              {toName} hasn't shared a payment handle yet.
              <div style={{ marginTop: 10 }}>
                <Button size="sm" variant="secondary" onClick={copyAmount}>
                  Copy amount
                </Button>
              </div>
            </div>
          )}

          {/* record the payment */}
          <div style={{ borderTop: `1px solid ${EV.line}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Button fullWidth onClick={() => onMarkPaid(edge, chosen ? METHOD_FOR[chosen] : 'manual')}>
              Mark as paid
            </Button>
            <Button fullWidth variant="quiet" onClick={() => onRecordDifferent(edge)}>
              Record a different amount
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
