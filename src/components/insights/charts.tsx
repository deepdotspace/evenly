/**
 * Insights charts — hand-drawn inline SVG, no chart-library dependency.
 *
 * `Donut`  — a proportional ring (category / per-person breakdowns) with a center
 *            figure. Segments are exact (stroke-dasharray over one circle), so the
 *            ring always reads the same numbers the stat cards show.
 * `WeeklyBars` — spending-over-time bars. Measures its container so the SVG is
 *            crisp and undistorted at any width (no preserveAspectRatio stretch).
 *
 * Money formatting + the warm palette are passed in by the caller; these stay
 * pure presentation.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EV } from '../../design'

/* ----------------------------------------------------------------- container width */

/** Track an element's content width (for crisp, undistorted responsive SVG). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/* ------------------------------------------------------------------------- donut */

export interface DonutSegment {
  id: string
  label: string
  value: number
  color: string
}

export interface DonutProps {
  segments: DonutSegment[]
  /** Square px size of the ring. */
  size?: number
  /** Ring thickness in px. */
  thickness?: number
  /** Big center figure (e.g. the total). */
  centerValue?: ReactNode
  /** Small caption under the center figure. */
  centerLabel?: ReactNode
}

export function Donut({
  segments,
  size = 168,
  thickness = 22,
  centerValue,
  centerLabel,
}: DonutProps) {
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const cx = size / 2

  // Build the dash offsets in order; a single positive segment renders as a full
  // ring (the dash math degenerates cleanly to one continuous stroke).
  let acc = 0

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={EV.track}
          strokeWidth={thickness}
        />
        {/* rotate -90deg so the ring starts at 12 o'clock */}
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          {total > 0 &&
            segments
              .filter((seg) => seg.value > 0)
              .map((seg) => {
                const frac = seg.value / total
                const len = frac * c
                const dash = `${len} ${c - len}`
                const offset = -acc * c
                acc += frac
                return (
                  <circle
                    key={seg.id}
                    cx={cx}
                    cy={cx}
                    r={r}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={thickness}
                    strokeDasharray={dash}
                    strokeDashoffset={offset}
                    strokeLinecap="butt"
                  />
                )
              })}
        </g>
      </svg>
      {(centerValue != null || centerLabel != null) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
            padding: thickness,
          }}
        >
          {centerValue != null && (
            <div
              style={{
                fontFamily: EV.fontDisplay,
                fontSize: 20,
                fontWeight: 500,
                color: EV.ink,
                letterSpacing: '-0.01em',
                lineHeight: 1.05,
                fontVariantNumeric: 'tabular-nums lining-nums',
              }}
            >
              {centerValue}
            </div>
          )}
          {centerLabel != null && (
            <div style={{ fontSize: 11, color: EV.ink45, marginTop: 3, fontWeight: 500 }}>
              {centerLabel}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- weekly bars */

export interface WeeklyBar {
  id: string
  /** Short axis label, e.g. "Jun 2". */
  label: string
  value: number
  /** Formatted money string for the tooltip / top label. */
  display: string
}

export interface WeeklyBarsProps {
  bars: WeeklyBar[]
  height?: number
}

export function WeeklyBars({ bars, height = 180 }: WeeklyBarsProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const max = bars.reduce((m, b) => Math.max(m, b.value), 0)

  // Geometry. Labels live in a fixed gutter beneath the plot.
  const labelH = 22
  const valueH = 16 // headroom for the value label on the tallest bar
  const plotH = height - labelH - valueH
  const n = Math.max(1, bars.length)
  const slot = width / n
  // Bars stay readable: clamp width, cap the gap so few weeks do not get huge.
  const barW = Math.max(8, Math.min(44, slot * 0.56))
  const radius = Math.min(7, barW / 2)

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Weekly spending"
        >
          {/* baseline */}
          <line
            x1={0}
            y1={valueH + plotH}
            x2={width}
            y2={valueH + plotH}
            stroke={EV.line}
            strokeWidth={1}
          />
          {bars.map((b, i) => {
            const cx = slot * i + slot / 2
            const h = max > 0 ? Math.max(b.value > 0 ? 3 : 0, (b.value / max) * plotH) : 0
            const x = cx - barW / 2
            const y = valueH + plotH - h
            const tallest = b.value === max && max > 0
            return (
              <g key={b.id}>
                {/* faint track for the full plot height */}
                <rect
                  x={x}
                  y={valueH}
                  width={barW}
                  height={plotH}
                  rx={radius}
                  fill={EV.fillGhost}
                />
                {h > 0 && (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={radius}
                    fill={EV.clay}
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'bottom',
                      animation: 'evRise 0.5s var(--ev-ease-bar) both',
                      animationDelay: `${i * 35}ms`,
                    }}
                  />
                )}
                {tallest && (
                  <text
                    x={cx}
                    y={y - 6}
                    textAnchor="middle"
                    style={{
                      fontFamily: EV.fontUI,
                      fontSize: 11,
                      fontWeight: 700,
                      fill: EV.clayDeep,
                      fontVariantNumeric: 'tabular-nums lining-nums',
                    }}
                  >
                    {b.display}
                  </text>
                )}
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  style={{ fontFamily: EV.fontUI, fontSize: 10.5, fontWeight: 600, fill: EV.ink45 }}
                >
                  {b.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
