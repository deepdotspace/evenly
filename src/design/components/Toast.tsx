/**
 * Toast — a warm, low-key notification with a tone-colored icon. The provider
 * holds a queue capped at 4 (oldest dropped first), each auto-dismissing after a
 * timeout. Stacks bottom-center. Self-contained: drop `<ToastProvider>` anywhere
 * and call `useToast().push(...)`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CheckIcon, AlertIcon, InfoIcon, EqualsIcon } from '../icons'

export type ToastTone = 'success' | 'error' | 'info' | 'even'

export interface ToastInput {
  title: ReactNode
  description?: ReactNode
  tone?: ToastTone
  /** ms before auto-dismiss; 0 = sticky. Default 4000. */
  duration?: number
}

export interface ToastItem extends ToastInput {
  id: number
}

interface ToastContextValue {
  push: (t: ToastInput) => number
  dismiss: (id: number) => void
}

/** The hook surface: the raw `push`/`dismiss` plus tone-named convenience methods. */
export interface ToastApi extends ToastContextValue {
  success: (title: ReactNode, description?: ReactNode) => number
  error: (title: ReactNode, description?: ReactNode) => number
  info: (title: ReactNode, description?: ReactNode) => number
  warning: (title: ReactNode, description?: ReactNode) => number
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX = 4

const TONE: Record<ToastTone, { color: string; bg: string; icon: ReactNode }> = {
  success: { color: 'var(--ev-sage-deep)', bg: 'rgba(156,175,136,0.18)', icon: <CheckIcon size={16} strokeWidth={2.6} /> },
  error: { color: 'var(--ev-clay-deep)', bg: 'var(--ev-badge-bg)', icon: <AlertIcon size={16} /> },
  info: { color: 'var(--ev-ink-60)', bg: 'var(--ev-tile)', icon: <InfoIcon size={16} /> },
  even: { color: 'var(--ev-honey)', bg: 'var(--ev-tile-honey)', icon: <EqualsIcon size={16} strokeWidth={2.8} /> },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id))
    const handle = timers.current.get(id)
    if (handle) {
      clearTimeout(handle)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (input: ToastInput) => {
      const id = ++idRef.current
      const item: ToastItem = { tone: 'info', duration: 4000, ...input, id }
      setItems((cur) => {
        const next = [...cur, item]
        return next.length > MAX ? next.slice(next.length - MAX) : next
      })
      if (item.duration && item.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), item.duration),
        )
      }
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((h) => clearTimeout(h))
      map.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <Toaster items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return {
    ...ctx,
    success: (title, description) => ctx.push({ tone: 'success', title, description }),
    error: (title, description) => ctx.push({ tone: 'error', title, description }),
    info: (title, description) => ctx.push({ tone: 'info', title, description }),
    // No dedicated warning tone in the warm palette; surface it as an error.
    warning: (title, description) => ctx.push({ tone: 'error', title, description }),
  }
}

/** The visual stack. Exported so a preview can render toasts without a provider. */
export function Toaster({ items, onDismiss }: { items: ToastItem[]; onDismiss?: (id: number) => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: 'min(380px, calc(100vw - 32px))',
        pointerEvents: 'none',
      }}
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

/** A single toast — also usable standalone (e.g. in the design preview). */
export function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss?: (id: number) => void }) {
  const tone = TONE[item.tone ?? 'info']
  return (
    <div
      className="ev-toast"
      role="status"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        background: 'var(--ev-surface)',
        borderRadius: 14,
        padding: '13px 15px',
        boxShadow: 'var(--ev-shadow-card)',
        border: '1px solid var(--ev-line)',
        cursor: onDismiss ? 'pointer' : 'default',
      }}
      onClick={() => onDismiss?.(item.id)}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: tone.bg,
          color: tone.color,
        }}
      >
        {tone.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ev-ink)', lineHeight: 1.3 }}>{item.title}</div>
        {item.description != null && (
          <div style={{ fontSize: 12.5, color: 'var(--ev-ink-55)', marginTop: 2, lineHeight: 1.4 }}>{item.description}</div>
        )}
      </div>
    </div>
  )
}
