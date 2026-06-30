/**
 * Logo / EqualsMark — the brand. A clay rounded tile holding the equals mark,
 * with the "Evenly" wordmark in Fraunces. The equals sign is the product, so it
 * is its own export too (used on settled states, settle CTAs, etc.).
 */

import type { CSSProperties } from 'react'
import { EqualsIcon } from '../icons'

export type LogoSize = 'sm' | 'md' | 'lg'

const SIZES: Record<LogoSize, { tile: number; radius: number; mark: number; markStroke: number; word: number }> = {
  sm: { tile: 26, radius: 8, mark: 14, markStroke: 2.8, word: 17 },
  md: { tile: 30, radius: 9, mark: 16, markStroke: 2.8, word: 19 },
  lg: { tile: 42, radius: 13, mark: 22, markStroke: 2.6, word: 34 },
}

export interface EqualsMarkProps {
  /** Tile edge length in px. */
  size?: number
  radius?: number
  /** Tile background; defaults to clay. */
  bg?: string
  /** Mark color; defaults to paper. */
  markColor?: string
  markSize?: number
  markStroke?: number
  shadow?: boolean
  style?: CSSProperties
  className?: string
}

/** The clay tile with the equals mark (no wordmark). */
export function EqualsMark({
  size = 30,
  radius,
  bg = 'var(--ev-clay)',
  markColor = 'var(--ev-paper)',
  markSize,
  markStroke = 2.8,
  shadow = false,
  style,
  className,
}: EqualsMarkProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.31),
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: shadow ? 'var(--ev-shadow-logo)' : undefined,
        ...style,
      }}
    >
      <EqualsIcon size={markSize ?? Math.round(size * 0.52)} strokeWidth={markStroke} style={{ color: markColor }} />
    </div>
  )
}

export interface LogoProps {
  size?: LogoSize
  /** Hide the "Evenly" wordmark, showing only the mark. */
  markOnly?: boolean
  /** Drop the clay glow under the tile (defaults on for `lg`). */
  shadow?: boolean
  className?: string
  style?: CSSProperties
}

export function Logo({ size = 'md', markOnly = false, shadow, className, style }: LogoProps) {
  const s = SIZES[size]
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: size === 'lg' ? 14 : size === 'md' ? 10 : 9, ...style }}>
      <EqualsMark
        size={s.tile}
        radius={s.radius}
        markSize={s.mark}
        markStroke={s.markStroke}
        shadow={shadow ?? size === 'lg'}
      />
      {!markOnly && (
        <span
          style={{
            fontFamily: 'var(--ev-font-display)',
            fontWeight: 600,
            fontSize: s.word,
            letterSpacing: size === 'lg' ? '-0.02em' : '-0.01em',
            color: 'var(--ev-ink)',
            lineHeight: 1,
          }}
        >
          Evenly
        </span>
      )}
    </div>
  )
}
