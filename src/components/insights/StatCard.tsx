/**
 * StatCard + chart legend — the warm surfaces the insights numbers sit on.
 *
 * `StatCard`  — a labelled figure (group total, avg per person, etc.) on a soft
 *               paper card. `tone` tints the figure (owed = sage, owe = clay).
 * `DonutLegend` — the keyed list beside a donut: swatch, label, amount, percent.
 */

import type { CSSProperties, ReactNode } from 'react'
import { EV } from '../../design'
import type { DonutSegment } from './charts'

export interface StatCardProps {
  label: string
  /** The main figure (string already formatted, or a node). */
  value: ReactNode
  /** Small line under the figure (e.g. the largest expense's description). */
  caption?: ReactNode
  /** Tint the figure: owed = sage, owe = clay, even/honey, default ink. */
  tone?: 'ink' | 'owed' | 'owe' | 'even'
  icon?: ReactNode
  /** Render the figure in the Fraunces display face (hero figures). */
  display?: boolean
  /** Bigger figure for the lead "group total" card. */
  large?: boolean
  className?: string
  style?: CSSProperties
}

const TONE_COLOR: Record<NonNullable<StatCardProps['tone']>, string> = {
  ink: EV.ink,
  owed: EV.sageDeep,
  owe: EV.clayDeep,
  even: EV.honey,
}

export function StatCard({
  label,
  value,
  caption,
  tone = 'ink',
  icon,
  display = true,
  large = false,
  className,
  style,
}: StatCardProps) {
  return (
    <div
      className={className}
      style={{
        background: EV.surface,
        borderRadius: 16,
        boxShadow: 'var(--ev-shadow-soft)',
        padding: large ? '20px 22px' : '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        ...style,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: EV.ink42,
          }}
        >
          {label}
        </span>
        {icon && <span style={{ color: EV.ink35, flexShrink: 0 }}>{icon}</span>}
      </div>
      <div
        style={{
          fontFamily: display ? EV.fontDisplay : EV.fontUI,
          fontSize: large ? 'clamp(30px, 5vw, 38px)' : 'clamp(22px, 3.4vw, 27px)',
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: TONE_COLOR[tone],
          marginTop: large ? 8 : 6,
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums lining-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {caption != null && (
        <div style={{ fontSize: 12.5, color: EV.ink55, marginTop: 5, lineHeight: 1.4 }}>
          {caption}
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- donut legend */

export interface DonutLegendProps {
  segments: DonutSegment[]
  total: number
  /** Format a minor-unit amount to a money string. */
  format: (amountMinor: number) => string
  /** Optional leading node per row (e.g. an avatar). */
  leading?: (segment: DonutSegment) => ReactNode
  /** Max rows before the rest collapse into "+N more". */
  max?: number
}

export function DonutLegend({ segments, total, format, leading, max = 8 }: DonutLegendProps) {
  const shown = segments.slice(0, max)
  const rest = segments.slice(max)
  const restValue = rest.reduce((s, x) => s + x.value, 0)

  return (
    <div className="flex flex-col" style={{ gap: 11, minWidth: 0, flex: 1 }}>
      {shown.map((seg) => {
        const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
        return (
          <div key={seg.id} className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
            {leading ? (
              leading(seg)
            ) : (
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 4,
                  background: seg.color,
                  flexShrink: 0,
                }}
              />
            )}
            <span
              className="truncate"
              style={{ fontSize: 13.5, fontWeight: 500, color: EV.ink, flex: 1, minWidth: 0 }}
            >
              {seg.label}
            </span>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: EV.ink,
                fontVariantNumeric: 'tabular-nums lining-nums',
                flexShrink: 0,
              }}
            >
              {format(seg.value)}
            </span>
            <span
              style={{
                fontSize: 11.5,
                color: EV.ink45,
                width: 34,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums lining-nums',
                flexShrink: 0,
              }}
            >
              {pct}%
            </span>
          </div>
        )
      })}
      {rest.length > 0 && (
        <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
          <span style={{ width: 11, height: 11, borderRadius: 4, background: EV.track, flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 500, color: EV.ink55, flex: 1, minWidth: 0 }}>
            {`+${rest.length} more`}
          </span>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: EV.ink55,
              fontVariantNumeric: 'tabular-nums lining-nums',
              flexShrink: 0,
            }}
          >
            {format(restValue)}
          </span>
          <span style={{ width: 34 }} />
        </div>
      )}
    </div>
  )
}
