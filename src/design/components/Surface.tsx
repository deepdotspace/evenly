/**
 * Surface / Card — the warm paper surfaces. Variants match the prototype's
 * elevation language: `flat` (rail card), `card` (soft elevated), `dock`
 * (the floating action dock), `receipt` (deep thermal-paper lift).
 */

import type { CSSProperties, ReactNode, HTMLAttributes } from 'react'

export type SurfaceVariant = 'flat' | 'card' | 'dock' | 'receipt' | 'plain'

const VARIANT: Record<SurfaceVariant, CSSProperties> = {
  plain: { background: 'var(--ev-paper)' },
  flat: { background: 'var(--ev-surface)', boxShadow: 'var(--ev-shadow-soft)' },
  card: { background: 'var(--ev-surface)', boxShadow: 'var(--ev-shadow-soft)' },
  dock: { background: 'var(--ev-surface)', boxShadow: 'var(--ev-shadow-card)' },
  receipt: { background: 'var(--ev-surface)', boxShadow: 'var(--ev-shadow-receipt)' },
}

const RADIUS: Record<SurfaceVariant, number> = {
  plain: 0,
  flat: 11,
  card: 16,
  dock: 18,
  receipt: 16,
}

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant
  radius?: number
  padding?: number | string
  children?: ReactNode
}

export function Surface({ variant = 'card', radius, padding, children, style, ...rest }: SurfaceProps) {
  return (
    <div
      style={{
        borderRadius: radius ?? RADIUS[variant],
        padding,
        color: 'var(--ev-ink)',
        ...VARIANT[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
