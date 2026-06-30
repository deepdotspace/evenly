/**
 * MoneyText — tabular, sign-aware money. Tone drives the color exactly as the
 * prototype: owe = clay, owed = sage, even = honey, neutral = ink. The sign is
 * carried by an optional label ("owed", "owes", "even"), not a +/-, matching the
 * "owed $42.50" rows — pass `signed` if you want an explicit +/- figure instead.
 */

import type { CSSProperties, ReactNode } from 'react'
import { formatMoney, type MoneyTone } from '../tokens'

const TONE_COLOR: Record<MoneyTone, string> = {
  owe: 'var(--ev-clay-deep)',
  owed: 'var(--ev-sage-deep)',
  even: 'var(--ev-honey)',
  neutral: 'var(--ev-ink)',
}

export interface MoneyTextProps {
  /** Integer minor units. Ignored if `children` is provided. */
  amountMinor?: number
  currency?: string
  tone?: MoneyTone
  /** Leading word, e.g. "owed" / "owes". Rendered in the tone color. */
  label?: string
  /** Render an explicit signed figure (+/-) instead of an absolute value. */
  signed?: boolean
  /** Override the formatted string entirely. */
  children?: ReactNode
  /** Font weight (default 600). */
  weight?: number
  size?: number | string
  /** Use the Fraunces display face (for big hero figures). */
  display?: boolean
  className?: string
  style?: CSSProperties
}

export function MoneyText({
  amountMinor,
  currency = 'USD',
  tone = 'neutral',
  label,
  signed = false,
  children,
  weight = 600,
  size,
  display = false,
  className,
  style,
}: MoneyTextProps) {
  const text =
    children ??
    (typeof amountMinor === 'number' ? formatMoney(amountMinor, currency, { signed }) : '')

  return (
    <span
      className={className}
      style={{
        fontFamily: display ? 'var(--ev-font-display)' : 'var(--ev-font-ui)',
        fontVariantNumeric: 'tabular-nums lining-nums',
        fontWeight: weight,
        fontSize: size,
        color: TONE_COLOR[tone],
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label ? <span>{label} </span> : null}
      {text}
    </span>
  )
}
