/**
 * Button — the clay primary (with its exact two-layer shadow) and the warm
 * ghost secondary. Sizes map to the prototype's button paddings; `lg` carries
 * the heavier CTA glow used on "Mark all settled".
 */

import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'
export type ButtonSize = 'sm' | 'md' | 'lg'

const PAD: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '12px 18px', fontSize: 14, borderRadius: 13 },
  md: { padding: 15, fontSize: 14.5, borderRadius: 15 },
  lg: { padding: 16, fontSize: 15.5, borderRadius: 15 },
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth = false, icon, iconRight, children, style, className, type, ...rest },
  ref,
) {
  const base: CSSProperties = {
    display: fullWidth ? 'flex' : 'inline-flex',
    width: fullWidth ? '100%' : undefined,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: 'none',
    fontWeight: 600,
    lineHeight: 1.1,
    ...PAD[size],
  }

  const variantStyle: CSSProperties =
    variant === 'primary'
      ? {
          background: 'var(--ev-clay)',
          color: 'var(--ev-paper)',
          boxShadow: size === 'lg' ? 'var(--ev-shadow-btn-lg)' : 'var(--ev-shadow-btn)',
        }
      : variant === 'secondary'
        ? {
            background: 'var(--ev-fill-ghost)',
            color: 'var(--ev-ink)',
            border: '1px solid var(--ev-border-ghost)',
          }
        : {
            background: 'transparent',
            color: 'var(--ev-ink-55)',
          }

  const cls = ['ev-btn', variant === 'primary' ? 'ev-btn-primary' : 'ev-btn-ghost', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button ref={ref} type={type ?? 'button'} className={cls} style={{ ...base, ...variantStyle, ...style }} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  )
})
