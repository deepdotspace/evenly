/**
 * IconTile — the small rounded square that holds a category / activity icon
 * (the 38px tiles in the feed, the 64px settled tile). Tone picks the warm
 * surface and a sensible stroke color.
 */

import type { CSSProperties, ReactNode } from 'react'

export type TileTone = 'neutral' | 'warm' | 'honey' | 'clay' | 'sage'

const TONE: Record<TileTone, { bg: string; color: string }> = {
  neutral: { bg: 'var(--ev-tile)', color: 'var(--ev-ink-60)' },
  warm: { bg: 'var(--ev-tile-warm)', color: 'var(--ev-clay-deep)' },
  honey: { bg: 'var(--ev-tile-honey)', color: 'var(--ev-honey)' },
  clay: { bg: 'var(--ev-tile-warm)', color: 'var(--ev-clay-deep)' },
  sage: { bg: 'rgba(156, 175, 136, 0.18)', color: 'var(--ev-sage-deep)' },
}

export interface IconTileProps {
  children: ReactNode
  size?: number
  radius?: number
  tone?: TileTone
  /** Override the background. */
  bg?: string
  /** Override the icon color. */
  color?: string
  className?: string
  style?: CSSProperties
}

export function IconTile({ children, size = 38, radius, tone = 'neutral', bg, color, className, style }: IconTileProps) {
  const t = TONE[tone]
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.29),
        background: bg ?? t.bg,
        color: color ?? t.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
