/**
 * BottomSheet / Modal — one overlay primitive with two presentations: a
 * phone-first sheet that slides up from the bottom, and a centered desktop
 * modal. Backdrop click + Escape close; body scroll is locked while open.
 * No focus-trap dependency — kept intentionally light, with sensible a11y roles.
 */

import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { CloseIcon } from '../icons'

export interface SheetProps {
  open: boolean
  onClose?: () => void
  variant?: 'sheet' | 'modal'
  title?: ReactNode
  /** Hide the default header (title + close). */
  hideHeader?: boolean
  /** Max width for the modal variant. */
  width?: number
  children?: ReactNode
  /** Footer pinned under the scroll area. */
  footer?: ReactNode
  className?: string
  style?: CSSProperties
}

export function Sheet({
  open,
  onClose,
  variant = 'sheet',
  title,
  hideHeader = false,
  width = 460,
  children,
  footer,
  className,
  style,
}: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const isSheet = variant === 'sheet'

  const panelBase: CSSProperties = {
    position: 'relative',
    background: 'var(--ev-surface)',
    color: 'var(--ev-ink)',
    boxShadow: 'var(--ev-shadow-card)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: isSheet ? '88vh' : '86vh',
  }

  const panel: CSSProperties = isSheet
    ? { ...panelBase, width: '100%', maxWidth: 520, borderRadius: '22px 22px 0 0', paddingBottom: 'env(safe-area-inset-bottom, 8px)' }
    : { ...panelBase, width: '100%', maxWidth: width, borderRadius: 20 }

  return (
    <div
      className="ev-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: isSheet ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isSheet ? 0 : 24,
        background: 'rgba(40, 30, 20, 0.34)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={[isSheet ? 'ev-sheet' : 'ev-modal', className].filter(Boolean).join(' ')}
        style={{ ...panel, ...style }}
      >
        {isSheet && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--ev-border-ghost)' }} />
          </div>
        )}

        {!hideHeader && (title || onClose) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: isSheet ? '14px 22px 10px' : '20px 22px 8px',
            }}
          >
            <div style={{ fontFamily: 'var(--ev-font-display)', fontSize: 21, fontWeight: 500, letterSpacing: '-0.01em' }}>
              {title}
            </div>
            {onClose && (
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="ev-pressable"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'var(--ev-fill-ghost)',
                  color: 'var(--ev-ink-55)',
                }}
              >
                <CloseIcon size={18} />
              </button>
            )}
          </div>
        )}

        <div style={{ overflowY: 'auto', padding: '4px 22px 22px' }}>{children}</div>

        {footer && (
          <div style={{ padding: '14px 22px 20px', borderTop: '1px solid var(--ev-line)' }}>{footer}</div>
        )}
      </div>
    </div>
  )
}
