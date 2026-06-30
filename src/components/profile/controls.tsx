/**
 * Small form primitives for the settings screen, in the warm Evenly language.
 * Kept local to the profile surface -- a labelled text field, a select, and a
 * toggle row -- so the page reads as one coherent editorial form, not a grid of
 * generic UI-kit controls.
 */

import type { CSSProperties, ReactNode } from 'react'
import { EV } from '../../design'

export const CURRENCIES: ReadonlyArray<readonly [string, string]> = [
  ['USD', 'US Dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'British Pound'],
  ['JPY', 'Japanese Yen'],
  ['CAD', 'Canadian Dollar'],
  ['AUD', 'Australian Dollar'],
  ['INR', 'Indian Rupee'],
  ['MXN', 'Mexican Peso'],
  ['BRL', 'Brazilian Real'],
  ['CHF', 'Swiss Franc'],
  ['CNY', 'Chinese Yuan'],
  ['KRW', 'Korean Won'],
  ['SGD', 'Singapore Dollar'],
  ['HKD', 'Hong Kong Dollar'],
  ['NZD', 'New Zealand Dollar'],
  ['SEK', 'Swedish Krona'],
  ['NOK', 'Norwegian Krone'],
  ['DKK', 'Danish Krone'],
  ['ZAR', 'South African Rand'],
  ['AED', 'UAE Dirham'],
  ['THB', 'Thai Baht'],
  ['PHP', 'Philippine Peso'],
  ['IDR', 'Indonesian Rupiah'],
  ['MYR', 'Malaysian Ringgit'],
]

export const fieldLabelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: EV.ink55,
  marginBottom: 7,
  display: 'block',
}

const inputStyle: CSSProperties = {
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
  prefix,
  value,
  placeholder,
  onChange,
  id,
  inputMode,
  autoComplete,
}: {
  label: string
  hint?: ReactNode
  /** A fixed leading token rendered inside the field (e.g. "@" or "$"). */
  prefix?: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
  id?: string
  inputMode?: 'text' | 'email' | 'url'
  autoComplete?: string
}) {
  return (
    <div>
      {label && (
        <label style={fieldLabelStyle} htmlFor={id}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 14,
              fontSize: 15,
              fontWeight: 600,
              color: EV.ink40,
              pointerEvents: 'none',
            }}
          >
            {prefix}
          </span>
        )}
        <input
          id={id}
          className="ev-input"
          style={{ ...inputStyle, paddingLeft: prefix ? 30 : 14 }}
          value={value}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {hint && (
        <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 6, lineHeight: 1.5 }}>{hint}</p>
      )}
    </div>
  )
}

export function SelectField({
  label,
  hint,
  value,
  onChange,
  id,
  children,
}: {
  label: string
  hint?: ReactNode
  value: string
  onChange: (v: string) => void
  id?: string
  children: ReactNode
}) {
  return (
    <div>
      <label style={fieldLabelStyle} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="ev-input"
        style={{ ...inputStyle, cursor: 'pointer' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      {hint && (
        <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 6, lineHeight: 1.5 }}>{hint}</p>
      )}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="ev-pressable"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: 'transparent',
        padding: '4px 0',
        cursor: 'pointer',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: EV.ink }}>
          {label}
        </span>
        {description && (
          <span style={{ display: 'block', fontSize: 12.5, color: EV.ink50, marginTop: 1, lineHeight: 1.45 }}>
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 44,
          height: 26,
          borderRadius: 999,
          padding: 3,
          background: checked ? EV.clay : EV.trackStrong,
          transition: 'background 160ms ease',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: EV.surface,
            boxShadow: '0 1px 2px rgba(58,53,47,0.28)',
            transform: checked ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </span>
    </button>
  )
}
