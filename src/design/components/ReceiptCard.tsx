/**
 * ReceiptCard — the thermal-paper receipt being read. Dashed rules, tabular
 * line items, a bold total, and (when `scanning`) the clay scan beam sweeping
 * top-to-bottom via evScan. The merchant name is set in Fraunces small-caps
 * spacing to read like a printed header.
 */

import type { CSSProperties } from 'react'

export interface ReceiptItem {
  name: string
  /** Pre-formatted price string (kept verbatim — receipts print their own format). */
  price: string
}

export interface ReceiptCardProps {
  merchant: string
  location?: string
  items: ReceiptItem[]
  /** Pre-formatted total, e.g. "€73,50". */
  total: string
  totalLabel?: string
  scanning?: boolean
  className?: string
  style?: CSSProperties
}

const dashed: CSSProperties = { borderTop: '1.5px dashed var(--ev-receipt-rule)' }

export function ReceiptCard({
  merchant,
  location,
  items,
  total,
  totalLabel = 'TOTAL',
  scanning = false,
  className,
  style,
}: ReceiptCardProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--ev-surface)',
        boxShadow: 'var(--ev-shadow-receipt)',
        ...style,
      }}
    >
      <div style={{ padding: '22px 24px', fontFamily: 'var(--ev-font-ui)', color: 'var(--ev-ink)' }}>
        <div style={{ textAlign: 'center', fontFamily: 'var(--ev-font-display)', fontSize: 16, fontWeight: 600, letterSpacing: '0.04em' }}>
          {merchant}
        </div>
        {location && (
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ev-ink-45)', marginTop: 2, letterSpacing: '0.05em' }}>
            {location}
          </div>
        )}

        <div style={{ ...dashed, margin: '16px 0 12px' }} />

        {items.map((it, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 13,
              padding: '4px 0',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>{it.name}</span>
            <span>{it.price}</span>
          </div>
        ))}

        <div style={{ ...dashed, margin: '12px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          <span>{totalLabel}</span>
          <span>{total}</span>
        </div>
      </div>

      {scanning && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 60,
            background: 'linear-gradient(180deg, rgba(226,114,91,0) 0%, rgba(226,114,91,0.14) 60%, rgba(226,114,91,0.55) 100%)',
            borderBottom: '2px solid var(--ev-clay)',
            animation: 'evScan 1.7s var(--ev-ease-scan) infinite',
          }}
        />
      )}
    </div>
  )
}
