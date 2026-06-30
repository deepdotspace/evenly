/**
 * SectionLabel — the uppercase, wide-tracked, faint kicker above each block
 * ("WHERE EVERYONE STANDS", "ACTIVITY"). Optional right slot for an inline
 * legend (the owes/owed key in the prototype).
 */

import type { CSSProperties, ReactNode } from 'react'

export interface SectionLabelProps {
  children: ReactNode
  /** Right-aligned content (legend, count, action). */
  right?: ReactNode
  size?: number
  className?: string
  style?: CSSProperties
}

export function SectionLabel({ children, right, size = 11.5, className, style }: SectionLabelProps) {
  const label = (
    <span
      style={{
        fontFamily: 'var(--ev-font-ui)',
        fontSize: size,
        fontWeight: 600,
        letterSpacing: '0.12em',
        color: 'var(--ev-ink-42)',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  )

  if (!right) return <div className={className} style={style}>{label}</div>

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        ...style,
      }}
    >
      {label}
      {right}
    </div>
  )
}

/** The owes / owed swatch legend used in the balance-ladder header. */
export function OwesOwedLegend() {
  return (
    <span style={{ fontSize: 11, color: 'var(--ev-ink-35)', display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--ev-clay)' }} />
      owes
      <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--ev-sage)', marginLeft: 6 }} />
      owed
    </span>
  )
}
