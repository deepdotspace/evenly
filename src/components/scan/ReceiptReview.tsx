/**
 * ReceiptReview -- CONTRACT §3.6 step 3 (+ the §4 failed/low-confidence paths).
 *
 * Leads with the signature thermal ReceiptCard (live, reflecting every edit) and
 * a scan-vs-total reconcile banner from `reconcileScan`. "Adjust lines" reveals
 * the editable items + tax/tip/fees/discount + printed total -- the parse is
 * never trusted blindly (D9). A "Paid by" selector sets the ledger payer. A low
 * confidence or a >2-minor mismatch blocks the "Assign" CTA until confirmed.
 */

import { useMemo, type CSSProperties } from 'react'
import {
  Avatar,
  Button,
  ArrowRightIcon,
  AlertIcon,
  CheckIcon,
  CloseIcon,
  EV,
  InfoIcon,
  PlusIcon,
  ReceiptCard,
  formatMoney,
  type ReceiptItem,
} from '../../design'
import type { AssignMember } from './types'
import type { ReceiptScanController } from './useReceiptScan'
import { BackLink, ScreenHeading } from './parts'
import { minorToInput } from './money'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR', 'MXN', 'BRL', 'CHF', 'CNY', 'KRW']

const fieldLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: EV.ink55,
  marginBottom: 6,
  display: 'block',
}

function MoneyField({
  label,
  minor,
  currency,
  onChange,
}: {
  label: string
  minor: number
  currency: string
  onChange: (v: string) => void
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={fieldLabel}>{label}</span>
      <input
        className="ev-input"
        inputMode="decimal"
        value={minorToInput(minor, currency)}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          fontSize: 14.5,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums lining-nums',
          color: EV.ink,
          background: EV.paper,
          border: `1px solid ${EV.borderGhost}`,
          borderRadius: 10,
          padding: '9px 11px',
        }}
      />
    </label>
  )
}

export function ReceiptReview({ scan, members }: { scan: ReceiptScanController; members: AssignMember[] }) {
  const { parsed } = scan
  const currency = parsed?.currency ?? 'USD'

  const cardItems = useMemo<ReceiptItem[]>(() => {
    if (!parsed) return []
    const rows: ReceiptItem[] = []
    for (const it of parsed.items) {
      rows.push({ name: it.name || 'Item', price: formatMoney(it.lineTotalMinor, currency) })
      for (const m of it.modifiers ?? []) rows.push({ name: `  ${m.name}`, price: '' })
    }
    rows.push({ name: 'Subtotal', price: formatMoney(scan.itemsSubtotalMinor, currency) })
    if (parsed.taxMinor > 0) rows.push({ name: 'Tax', price: formatMoney(parsed.taxMinor, currency) })
    if (parsed.tipMinor > 0) rows.push({ name: 'Tip', price: formatMoney(parsed.tipMinor, currency) })
    if (parsed.feesMinor > 0) rows.push({ name: 'Fees', price: formatMoney(parsed.feesMinor, currency) })
    if (parsed.discountMinor > 0)
      rows.push({ name: 'Discount', price: `-${formatMoney(parsed.discountMinor, currency)}` })
    return rows
  }, [parsed, currency, scan.itemsSubtotalMinor])

  if (!parsed) return null

  const mismatch = !scan.manual && Math.abs(scan.diffMinor) > 2
  const lowConf = !scan.manual && parsed.confidence === 'low'

  return (
    <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 620 }}>
      <BackLink label="Retake" onClick={scan.retake} />
      <ScreenHeading
        title={scan.manual ? 'Add the items' : 'Check the receipt'}
        subtitle={
          scan.manual
            ? "We couldn't read this one. Add the lines by hand -- the photo is saved."
            : 'We pulled out every line. Tweak anything that looks off, then assign.'
        }
      />

      {/* reconcile / status banner */}
      <Banner manual={scan.manual} mismatch={mismatch} lowConf={lowConf} diffMinor={scan.diffMinor} currency={currency} />

      {/* thermal receipt summary (live) */}
      {!scan.manual && cardItems.length > 0 && (
        <div style={{ marginTop: 18, maxWidth: 340, marginLeft: 'auto', marginRight: 'auto' }}>
          <ReceiptCard
            merchant={parsed.merchant || 'Receipt'}
            location={parsed.datetime ? formatDate(parsed.datetime) : undefined}
            items={cardItems}
            total={formatMoney(scan.grandTotalMinor, currency)}
          />
        </div>
      )}

      {/* edit toggle */}
      {!scan.manual && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button variant="quiet" size="sm" onClick={() => scan.setEditorOpen(!scan.editorOpen)}>
            {scan.editorOpen ? 'Done adjusting' : 'Adjust lines'}
          </Button>
        </div>
      )}

      {/* editor */}
      {(scan.editorOpen || scan.manual) && (
        <div
          style={{
            marginTop: 14,
            background: EV.surface,
            borderRadius: 16,
            boxShadow: 'var(--ev-shadow-soft)',
            padding: '18px 18px 20px',
          }}
        >
          <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            <input
              className="ev-input"
              value={parsed.merchant ?? ''}
              placeholder="Merchant"
              onChange={(e) => scan.setMerchant(e.target.value)}
              style={{
                flex: 1,
                fontSize: 14.5,
                fontWeight: 600,
                color: EV.ink,
                background: EV.paper,
                border: `1px solid ${EV.borderGhost}`,
                borderRadius: 10,
                padding: '9px 11px',
              }}
            />
            <select
              className="ev-input"
              value={currency}
              onChange={(e) => scan.setCurrency(e.target.value)}
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: EV.ink,
                background: EV.paper,
                border: `1px solid ${EV.borderGhost}`,
                borderRadius: 10,
                padding: '9px 11px',
                cursor: 'pointer',
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* items */}
          {parsed.items.map((it) => (
            <div key={it.id} style={{ padding: '8px 0', borderTop: `1px solid ${EV.lineSoft}` }}>
              <div className="flex items-center gap-2">
                <input
                  className="ev-input"
                  value={it.name}
                  placeholder="Item"
                  onChange={(e) => scan.setItemName(it.id, e.target.value)}
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 500,
                    color: EV.ink,
                    background: 'transparent',
                    border: 'none',
                    padding: '4px 0',
                  }}
                />
                <input
                  className="ev-input"
                  inputMode="decimal"
                  value={minorToInput(it.lineTotalMinor, currency)}
                  onChange={(e) => scan.setItemTotal(it.id, e.target.value)}
                  style={{
                    width: 92,
                    textAlign: 'right',
                    fontSize: 14,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums lining-nums',
                    color: EV.ink,
                    background: EV.paper,
                    border: `1px solid ${EV.borderGhost}`,
                    borderRadius: 9,
                    padding: '7px 10px',
                  }}
                />
                <button
                  type="button"
                  aria-label="Remove item"
                  className="ev-pressable"
                  onClick={() => scan.removeItem(it.id)}
                  style={{ border: 'none', background: 'transparent', color: EV.ink40, padding: 4, cursor: 'pointer' }}
                >
                  <CloseIcon size={15} />
                </button>
              </div>
              {(it.modifiers ?? []).map((m, i) => (
                <div key={i} style={{ fontSize: 12, color: EV.ink45, paddingLeft: 2, marginTop: 1 }}>
                  {m.name} <span style={{ color: EV.ink40 }}>(included)</span>
                </div>
              ))}
            </div>
          ))}

          <div style={{ marginTop: 8 }}>
            <Button variant="secondary" size="sm" icon={<PlusIcon size={15} strokeWidth={2.4} />} onClick={scan.addItem}>
              Add item
            </Button>
          </div>

          {/* overheads */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: `1px solid ${EV.lineSoft}`,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            <MoneyField label="Tax" minor={parsed.taxMinor} currency={currency} onChange={(v) => scan.setOverhead('tax', v)} />
            <MoneyField label="Tip" minor={parsed.tipMinor} currency={currency} onChange={(v) => scan.setOverhead('tip', v)} />
            <MoneyField label="Fees" minor={parsed.feesMinor} currency={currency} onChange={(v) => scan.setOverhead('fees', v)} />
            <MoneyField
              label="Discount"
              minor={parsed.discountMinor}
              currency={currency}
              onChange={(v) => scan.setOverhead('discount', v)}
            />
            {!scan.manual && (
              <MoneyField
                label="Printed total (on receipt)"
                minor={parsed.printedTotalMinor}
                currency={currency}
                onChange={scan.setPrintedTotal}
              />
            )}
          </div>

          {/* live computed total */}
          <div
            className="flex items-center justify-between"
            style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${EV.line}` }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: EV.ink60 }}>Total</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: EV.ink, fontVariantNumeric: 'tabular-nums lining-nums' }}>
              {formatMoney(scan.grandTotalMinor, currency)}
            </span>
          </div>
        </div>
      )}

      {/* paid by */}
      <PayerSelect members={members} payerId={scan.payerId} onSelect={scan.setPayer} />

      {scan.error && (
        <p
          role="alert"
          style={{ fontSize: 13, color: EV.clayDeep, background: EV.badgeBg, borderRadius: 10, padding: '10px 12px', marginTop: 16 }}
        >
          {scan.error}
        </p>
      )}

      {/* assign CTA */}
      <div style={{ marginTop: 22 }}>
        <Button
          fullWidth
          size="lg"
          iconRight={<ArrowRightIcon size={18} />}
          disabled={!scan.canProceedToAssign}
          onClick={scan.goAssign}
        >
          {mismatch ? `Off by ${formatMoney(Math.abs(scan.diffMinor), currency)} -- adjust to continue` : 'Assign who had what'}
        </Button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- pieces */

function Banner({
  manual,
  mismatch,
  lowConf,
  diffMinor,
  currency,
}: {
  manual: boolean
  mismatch: boolean
  lowConf: boolean
  diffMinor: number
  currency: string
}) {
  let tone: 'sage' | 'amber' | 'clay'
  let icon
  let text
  if (manual) {
    tone = 'amber'
    icon = <InfoIcon size={16} />
    text = 'Manual entry -- add each line and the totals below.'
  } else if (mismatch) {
    tone = 'clay'
    icon = <AlertIcon size={16} />
    text = `Off by ${formatMoney(Math.abs(diffMinor), currency)} from the printed total. Check a line or the total.`
  } else if (lowConf) {
    tone = 'amber'
    icon = <InfoIcon size={16} />
    text = "Low-confidence scan -- give the lines a quick look before assigning."
  } else {
    tone = 'sage'
    icon = <CheckIcon size={16} />
    text = 'Matches the printed total.'
  }

  const bg = tone === 'sage' ? 'rgba(156,175,136,0.16)' : tone === 'amber' ? 'rgba(199,154,78,0.16)' : EV.badgeBg
  const fg = tone === 'sage' ? EV.sageDeep : tone === 'amber' ? EV.honey : EV.clayDeep

  return (
    <div
      role="status"
      className="flex items-center gap-2.5"
      style={{ marginTop: 18, background: bg, color: fg, borderRadius: 12, padding: '11px 14px', fontSize: 13.5, fontWeight: 600 }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ lineHeight: 1.4 }}>{text}</span>
    </div>
  )
}

function PayerSelect({
  members,
  payerId,
  onSelect,
}: {
  members: AssignMember[]
  payerId: string
  onSelect: (id: string) => void
}) {
  if (members.length === 0) return null
  return (
    <div style={{ marginTop: 22 }}>
      <span style={{ ...fieldLabel, marginBottom: 9 }}>Paid by</span>
      <div className="flex flex-wrap items-center gap-2.5">
        {members.map((m) => {
          const active = m.id === payerId
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className="ev-pressable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: active ? EV.surface : 'transparent',
                border: `1px solid ${active ? EV.lineStrong : EV.borderGhost}`,
                borderRadius: 999,
                padding: '5px 12px 5px 5px',
                cursor: 'pointer',
                boxShadow: active ? 'var(--ev-shadow-soft)' : undefined,
              }}
            >
              <Avatar id={m.id} name={m.name} size={26} active={active} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: active ? EV.ink : EV.ink55 }}>{m.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
