/**
 * BalanceLadderRow — the heart of Evenly. A center-line bar where "owed" grows
 * right in sage and "owes" grows left in clay; settling slides every bar to zero
 * and lands the honey "=" on the center line (evPopCenter). Two layouts: the
 * phone-first `stacked` (label row above the bar) and the desktop `row`
 * (name | bar | amount in one line).
 *
 * `widthPct` is 0–50: a bar fills at most half the track (from the center to one
 * edge), so it stays visually comparable to the opposite side.
 */

import type { CSSProperties } from 'react'
import { EqualsIcon } from '../icons'
import { Avatar } from './Avatar'
import { MoneyText } from './MoneyText'
import { formatMoney } from '../tokens'

export type LadderStatus = 'owed' | 'owes' | 'even'

export interface BalanceLadderRowProps {
  member: { id?: string; name: string; you?: boolean }
  status: LadderStatus
  amountMinor?: number
  currency?: string
  /** 0–50: how far the bar fills from the center toward its edge. */
  widthPct?: number
  /** Force the settled look (bar to zero + "=" pop), regardless of status. */
  settled?: boolean
  layout?: 'stacked' | 'row'
  /** Stagger the settle pop across rows. */
  popDelay?: number
  className?: string
  style?: CSSProperties
}

function lineFor(status: LadderStatus, amountMinor: number | undefined, currency: string, settled: boolean) {
  if (settled || status === 'even') return { tone: 'even' as const, label: undefined, text: 'even' }
  const money = typeof amountMinor === 'number' ? formatMoney(amountMinor, currency) : ''
  if (status === 'owed') return { tone: 'owed' as const, label: 'owed', text: money }
  return { tone: 'owe' as const, label: 'owes', text: money }
}

export function BalanceLadderRow({
  member,
  status,
  amountMinor,
  currency = 'USD',
  widthPct = 0,
  settled = false,
  layout = 'stacked',
  popDelay = 0,
  className,
  style,
}: BalanceLadderRowProps) {
  const isSettled = settled || status === 'even'
  const line = lineFor(status, amountMinor, currency, isSettled)
  const isOwed = status === 'owed'
  const barHeight = layout === 'row' ? 11 : 9
  const barRadius = layout === 'row' ? 6 : 5
  const inset = layout === 'row' ? 4 : 3

  const fill: CSSProperties = isSettled
    ? { width: 0 }
    : isOwed
      ? {
          left: '50%',
          borderRadius: `0 ${barRadius}px ${barRadius}px 0`,
          background: 'var(--ev-sage)',
          width: `${widthPct}%`,
        }
      : {
          right: '50%',
          borderRadius: `${barRadius}px 0 0 ${barRadius}px`,
          background: 'var(--ev-clay)',
          width: `${widthPct}%`,
        }

  const Bar = (
    <div
      style={{
        position: 'relative',
        height: barHeight,
        borderRadius: barRadius,
        background: 'var(--ev-track)',
        flex: layout === 'row' ? 1 : undefined,
      }}
    >
      {/* center line */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: -inset,
          bottom: -inset,
          width: 1.5,
          background: 'var(--ev-line-strong)',
          transform: 'translateX(-0.75px)',
        }}
      />
      {/* fill */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          height: barHeight,
          transition: 'width 0.9s var(--ev-ease-bar)',
          ...fill,
        }}
      />
      {/* settled "=" */}
      {isSettled && (
        <EqualsIcon
          size={layout === 'row' ? 22 : 20}
          strokeWidth={3}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            color: 'var(--ev-honey)',
            animation: `evPopCenter 0.45s ${popDelay}s both`,
          }}
        />
      )}
    </div>
  )

  const NameCell = (
    <div style={{ display: 'flex', alignItems: 'center', gap: layout === 'row' ? 11 : 9 }}>
      <Avatar id={member.id} name={member.name} size={layout === 'row' ? 30 : 26} />
      <span style={{ fontSize: layout === 'row' ? 15 : 14.5, fontWeight: 600, color: 'var(--ev-ink)' }}>
        {member.name}
        {member.you && <span style={{ color: 'var(--ev-ink-40)', fontWeight: 500 }}> you</span>}
      </span>
    </div>
  )

  const Amount = (
    <MoneyText tone={line.tone} label={line.label} size={layout === 'row' ? 14 : 13.5} weight={600}>
      {line.text}
    </MoneyText>
  )

  if (layout === 'row') {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 18, ...style }}>
        <div style={{ width: 170, flexShrink: 0 }}>{NameCell}</div>
        {Bar}
        <div style={{ width: 130, flexShrink: 0, textAlign: 'right' }}>{Amount}</div>
      </div>
    )
  }

  return (
    <div className={className} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        {NameCell}
        {Amount}
      </div>
      {Bar}
    </div>
  )
}
