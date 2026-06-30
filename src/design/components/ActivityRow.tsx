/**
 * ActivityRow — a feed line: category/activity tile, title (+ optional badge),
 * a sub line (who paid / how split), and a right-aligned amount with an optional
 * converted sub-amount (foreign-currency expenses). `rise` plays the evRise
 * fade-up used when a freshly-added expense lands.
 */

import type { CSSProperties, ReactNode } from 'react'
import { IconTile, type TileTone } from './IconTile'

export interface ActivityRowProps {
  icon: ReactNode
  iconTone?: TileTone
  title: ReactNode
  badge?: ReactNode
  subtitle?: ReactNode
  /** Primary amount string (pre-formatted, or a node). */
  amount?: ReactNode
  /** Secondary amount under the primary (e.g. original foreign value). */
  subAmount?: ReactNode
  /** Make the whole row a hoverable link. */
  interactive?: boolean
  onClick?: () => void
  /** Play the fade-up entrance. */
  rise?: boolean
  /** Hide the bottom hairline (last row). */
  noDivider?: boolean
  className?: string
  style?: CSSProperties
}

export function ActivityRow({
  icon,
  iconTone = 'neutral',
  title,
  badge,
  subtitle,
  amount,
  subAmount,
  interactive = false,
  onClick,
  rise = false,
  noDivider = false,
  className,
  style,
}: ActivityRowProps) {
  const cls = [interactive ? 'ev-row-link' : '', className].filter(Boolean).join(' ')
  return (
    <div
      className={cls}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: interactive ? '14px 8px' : '14px 0',
        marginInline: interactive ? -8 : 0,
        borderRadius: interactive ? 10 : 0,
        borderBottom: noDivider ? undefined : '1px solid var(--ev-line)',
        animation: rise ? 'evRise 0.5s both' : undefined,
        ...style,
      }}
    >
      <IconTile tone={iconTone}>{icon}</IconTile>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ev-ink)', display: 'flex', alignItems: 'center', gap: 7 }}>
          {title}
          {badge}
        </div>
        {subtitle != null && (
          <div style={{ fontSize: 12.5, color: 'var(--ev-ink-55)', marginTop: 1 }}>{subtitle}</div>
        )}
      </div>
      {(amount != null || subAmount != null) && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {amount != null && (
            <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ev-ink)', fontVariantNumeric: 'tabular-nums lining-nums' }}>
              {amount}
            </div>
          )}
          {subAmount != null && (
            <div style={{ fontSize: 11, color: 'var(--ev-ink-42)', fontVariantNumeric: 'tabular-nums lining-nums' }}>
              {subAmount}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** The little "RECEIPT" pill used on itemized expenses. */
export function ReceiptBadge({ children = 'RECEIPT' }: { children?: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: 'var(--ev-clay-deep)',
        background: 'var(--ev-badge-bg)',
        padding: '2px 6px',
        borderRadius: 5,
      }}
    >
      {children}
    </span>
  )
}
