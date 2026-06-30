/**
 * PillTabs — a warm segmented control. The active pill lifts onto a surface card
 * with a soft shadow; the rest stay quiet. Used for view switches (feed / chart,
 * simplify on/off, friends / groups). Also exports `PaymentPills` — the
 * Venmo / PayPal / Cash App row from the settle screen.
 */

import type { CSSProperties, ReactNode } from 'react'

export interface TabItem {
  id: string
  label: ReactNode
}

export interface PillTabsProps {
  tabs: TabItem[]
  value: string
  onChange?: (id: string) => void
  /** Stretch each tab to fill the row. */
  fill?: boolean
  className?: string
  style?: CSSProperties
}

export function PillTabs({ tabs, value, onChange, fill = false, className, style }: PillTabsProps) {
  return (
    <div
      role="tablist"
      className={className}
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        borderRadius: 14,
        background: 'var(--ev-fill-ghost)',
        width: fill ? '100%' : undefined,
        ...style,
      }}
    >
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            className="ev-tab"
            onClick={() => onChange?.(t.id)}
            style={{
              flex: fill ? 1 : undefined,
              border: 'none',
              cursor: 'pointer',
              padding: '8px 16px',
              borderRadius: 10,
              fontFamily: 'var(--ev-font-ui)',
              fontSize: 13.5,
              fontWeight: 600,
              background: active ? 'var(--ev-surface)' : 'transparent',
              color: active ? 'var(--ev-ink)' : 'var(--ev-ink-50)',
              boxShadow: active ? 'var(--ev-shadow-soft)' : 'none',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/** The settle-up payment method row (Venmo / PayPal / Cash App). */
export function PaymentPills({
  methods,
  onPick,
  style,
}: {
  methods: string[]
  onPick?: (method: string) => void
  style?: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', gap: 8, ...style }}>
      {methods.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onPick?.(m)}
          className="ev-btn ev-btn-ghost"
          style={{
            flex: 1,
            textAlign: 'center',
            padding: 11,
            borderRadius: 12,
            border: 'none',
            background: 'var(--ev-fill-ghost)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ev-ink)',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
