/**
 * Fab — the expand-on-interaction floating action button. Collapsed it is a clay
 * round button; on click it rotates to an "x" and fans its actions up above it
 * (the prototype's "scan / add expense" entry point). Defaults to fixed
 * bottom-right; pass `inline` to position it within a relative parent (preview).
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PlusIcon } from '../icons'

export interface FabAction {
  icon: ReactNode
  label: string
  onClick?: () => void
}

export interface FabProps {
  actions: FabAction[]
  /** Main button icon when collapsed. */
  icon?: ReactNode
  /** Position within a relative parent instead of fixed to the viewport. */
  inline?: boolean
  className?: string
  style?: CSSProperties
}

export function Fab({ actions, icon, inline = false, className, style }: FabProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div
      ref={ref}
      className={['ev-fab', className].filter(Boolean).join(' ')}
      data-open={open}
      style={{
        position: inline ? 'absolute' : 'fixed',
        right: 22,
        bottom: 'max(22px, env(safe-area-inset-bottom, 22px))',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 12,
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
        {actions.map((a, i) => (
          <button
            key={a.label}
            type="button"
            className="ev-fab-action ev-pressable"
            onClick={() => {
              a.onClick?.()
              setOpen(false)
            }}
            style={{
              transitionDelay: open ? `${i * 0.04}s` : '0s',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: 'none',
              cursor: 'pointer',
              background: 'var(--ev-surface)',
              color: 'var(--ev-ink)',
              boxShadow: 'var(--ev-shadow-card)',
              borderRadius: 14,
              padding: '10px 14px 10px 12px',
              fontFamily: 'var(--ev-font-ui)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span style={{ display: 'flex', color: 'var(--ev-clay-deep)' }}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="ev-fab-main"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: 'var(--ev-clay)',
          color: 'var(--ev-paper)',
          boxShadow: 'var(--ev-shadow-btn)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon ?? <PlusIcon size={24} strokeWidth={2.4} />}
      </button>
    </div>
  )
}
