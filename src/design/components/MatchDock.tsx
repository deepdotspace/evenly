/**
 * MatchDock — the floating "Assigned X / total Y" bar on the assign screen. The
 * fill + figure go clay while short and snap to sage when the assigned amount
 * matches the receipt total, at which point the primary CTA appears. Sits in a
 * paper-fade so the feed scrolls cleanly underneath.
 */

import type { CSSProperties, ReactNode } from 'react'
import { Surface } from './Surface'
import { Button } from './Button'
import { CheckIcon } from '../icons'
import { formatMoney } from '../tokens'

export interface MatchDockProps {
  assignedMinor: number
  totalMinor: number
  currency?: string
  /** CTA label when matched. */
  matchLabel?: string
  onConfirm?: () => void
  /** Float over content with the paper gradient (assign screen). When false, render inline (preview/embedded). */
  floating?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export function MatchDock({
  assignedMinor,
  totalMinor,
  currency = 'USD',
  matchLabel = 'Matches the total · add to group',
  onConfirm,
  floating = true,
  className,
  style,
}: MatchDockProps) {
  const matched = Math.abs(assignedMinor - totalMinor) < 1
  const pct = totalMinor > 0 ? Math.min(100, (assignedMinor / totalMinor) * 100) : 0
  const matchColor = matched ? 'var(--ev-sage)' : 'var(--ev-clay)'
  const remaining = Math.max(0, totalMinor - assignedMinor)

  const dock = (
    <Surface variant="dock" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 13, color: 'var(--ev-ink-60)' }}>Assigned</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: matchColor, fontVariantNumeric: 'tabular-nums lining-nums' }}>
          {formatMoney(assignedMinor, currency)} / {formatMoney(totalMinor, currency)}
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 7,
          borderRadius: 4,
          background: 'var(--ev-track-strong)',
          overflow: 'hidden',
          marginBottom: 13,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            borderRadius: 4,
            width: `${pct}%`,
            background: matchColor,
            transition: 'width 0.35s ease, background 0.35s ease',
          }}
        />
      </div>
      {matched ? (
        <Button variant="primary" fullWidth size="md" style={{ borderRadius: 13, padding: 14 }} icon={<CheckIcon size={17} strokeWidth={2.4} />} onClick={onConfirm}>
          {matchLabel}
        </Button>
      ) : (
        <div
          style={{
            width: '100%',
            textAlign: 'center',
            background: 'var(--ev-fill-ghost)',
            color: 'var(--ev-ink-50)',
            borderRadius: 13,
            padding: 14,
            fontWeight: 600,
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums lining-nums',
          }}
        >
          {formatMoney(remaining, currency)} still to assign
        </div>
      )}
    </Surface>
  )

  if (!floating) return <div className={className} style={style}>{dock}</div>

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '14px 20px 30px',
        background: 'linear-gradient(180deg, rgba(var(--ev-paper-rgb),0) 0%, rgb(var(--ev-paper-rgb)) 22%)',
        ...style,
      }}
    >
      {dock}
    </div>
  )
}
