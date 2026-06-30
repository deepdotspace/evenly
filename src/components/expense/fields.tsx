/**
 * Small, warm form primitives shared by the expense sections. Styled with the
 * Evenly tokens so the editor reads as one surface, never a scaffold form.
 */

import type { CSSProperties, ReactNode } from 'react'
import { Avatar, EV } from '../../design'

export const fieldLabel: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: EV.ink55,
  marginBottom: 7,
  display: 'block',
}

export const inputStyle: CSSProperties = {
  width: '100%',
  fontSize: 15,
  fontWeight: 500,
  color: EV.ink,
  background: EV.paper,
  border: `1px solid ${EV.borderGhost}`,
  borderRadius: 12,
  padding: '12px 14px',
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  style,
}: {
  label?: ReactNode
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={style}>
      {label != null && (
        <label style={fieldLabel} htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint != null && <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 6, lineHeight: 1.45 }}>{hint}</p>}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  id,
  autoFocus,
  onEnter,
  style,
  inputMode,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  autoFocus?: boolean
  onEnter?: () => void
  style?: CSSProperties
  inputMode?: 'text' | 'decimal' | 'numeric'
  ariaLabel?: string
}) {
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className="ev-input"
      style={{ ...inputStyle, ...style }}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onEnter ? (e) => e.key === 'Enter' && onEnter() : undefined}
    />
  )
}

/** A currency-aware money input with the code as a quiet prefix. */
export function MoneyInput({
  value,
  onChange,
  currency,
  placeholder = '0.00',
  signed = false,
  ariaLabel,
  style,
}: {
  value: string
  onChange: (v: string) => void
  currency: string
  placeholder?: string
  signed?: boolean
  ariaLabel?: string
  style?: CSSProperties
}) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <span
        style={{
          position: 'absolute',
          left: 13,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 11.5,
          fontWeight: 600,
          color: EV.ink40,
          letterSpacing: '0.03em',
          pointerEvents: 'none',
        }}
      >
        {currency}
      </span>
      <input
        aria-label={ariaLabel}
        className="ev-input"
        inputMode="decimal"
        style={{
          ...inputStyle,
          paddingLeft: 48,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums lining-nums',
        }}
        value={value}
        placeholder={signed ? '+/− 0.00' : placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function Select({
  value,
  onChange,
  children,
  id,
  ariaLabel,
  style,
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  id?: string
  ariaLabel?: string
  style?: CSSProperties
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      className="ev-input"
      style={{ ...inputStyle, cursor: 'pointer', ...style }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  )
}

/** A selectable member pill (Avatar + name) — participants + multi-payer rows. */
export function MemberToggle({
  id,
  name,
  active,
  onClick,
  trailing,
}: {
  id: string
  name: string
  active: boolean
  onClick?: () => void
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="ev-pressable"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px 6px 6px',
        borderRadius: 999,
        border: active ? `1.5px solid ${EV.clay}` : `1.5px solid ${EV.borderGhost}`,
        background: active ? EV.tileWarm : 'transparent',
        color: active ? EV.ink : EV.ink55,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <Avatar id={id} name={name} size={24} />
      <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {trailing}
    </button>
  )
}

/** A small chip button used to add an overhead / line / option. */
export function GhostChip({
  children,
  onClick,
  icon,
}: {
  children: ReactNode
  onClick?: () => void
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ev-pressable"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 13px',
        borderRadius: 999,
        border: `1px dashed ${EV.dash}`,
        background: 'transparent',
        color: EV.ink55,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {icon}
      {children}
    </button>
  )
}
