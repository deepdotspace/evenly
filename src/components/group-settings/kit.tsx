/**
 * Small shared building blocks for the group-settings surface — a warm card, a
 * field label, the input/select control style, and a section header. Kept local
 * so each section file stays focused; visuals match the rest of Evenly.
 */

import type { CSSProperties, ReactNode } from 'react'
import { EV } from '../../design'

export const fieldLabel: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: EV.ink55,
  marginBottom: 8,
  display: 'block',
}

export const controlStyle: CSSProperties = {
  width: '100%',
  appearance: 'none',
  WebkitAppearance: 'none',
  fontFamily: EV.fontUI,
  fontSize: 15,
  fontWeight: 500,
  color: EV.ink,
  background: EV.paper,
  border: `1px solid ${EV.borderGhost}`,
  borderRadius: 12,
  padding: '12px 14px',
}

export function Card({
  title,
  subtitle,
  right,
  children,
  style,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <section
      style={{
        background: EV.surface,
        borderRadius: 20,
        boxShadow: 'var(--ev-shadow-soft)',
        padding: 'clamp(18px, 3vw, 24px)',
        ...style,
      }}
    >
      {(title || right) && (
        <div className="flex items-start justify-between gap-3" style={{ marginBottom: subtitle ? 4 : 16 }}>
          <div>
            {title && (
              <h2
                style={{
                  fontFamily: EV.fontDisplay,
                  fontSize: 19,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  color: EV.ink,
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ fontSize: 13, color: EV.ink55, marginTop: 3, lineHeight: 1.45 }}>{subtitle}</p>
            )}
          </div>
          {right}
        </div>
      )}
      {subtitle && !right ? <div style={{ height: 16 }} /> : null}
      {children}
    </section>
  )
}

/** A small soft danger/notice banner (read-only notice, balance warnings). */
export function Notice({
  tone = 'neutral',
  children,
  style,
}: {
  tone?: 'neutral' | 'warn' | 'danger'
  children: ReactNode
  style?: CSSProperties
}) {
  const palette =
    tone === 'danger'
      ? { bg: EV.badgeBg, fg: EV.clayDeep }
      : tone === 'warn'
        ? { bg: EV.tileHoney, fg: EV.honey }
        : { bg: EV.fillGhost, fg: EV.ink55 }
  return (
    <div
      role="note"
      style={{
        fontSize: 13,
        lineHeight: 1.5,
        color: palette.fg,
        background: palette.bg,
        borderRadius: 12,
        padding: '11px 13px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
