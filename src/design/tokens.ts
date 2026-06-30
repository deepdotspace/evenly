/**
 * Evenly — design tokens in TypeScript.
 *
 * The CSS custom properties in `tokens.css` are the runtime source of truth for
 * theming (and the only thing that flips in dark mode). This file mirrors the
 * raw palette for the few cases that need a value in JS — most importantly the
 * deterministic avatar-tint mapping — plus the money formatting helpers.
 */

import type { CSSProperties } from 'react'

/** Raw light-mode palette (hex), for reference and JS-time use. */
export const PALETTE = {
  paper: '#FBF7F0',
  ink: '#3A352F',
  surface: '#FFFDF8',
  rail: '#F4EEE4',
  tile: '#F4EEE3',
  tileWarm: '#F2E6D2',
  tileHoney: '#F6ECD6',
  badgeBg: '#F2E0D8',
  clay: '#E2725B',
  clayDeep: '#B5563F',
  sage: '#9CAF88',
  sageDeep: '#6E8159',
  honey: '#C79A4E',
} as const

/** CSS var references — use these in inline styles so values stay themeable. */
export const EV = {
  paper: 'var(--ev-paper)',
  surface: 'var(--ev-surface)',
  rail: 'var(--ev-rail)',
  tile: 'var(--ev-tile)',
  tileWarm: 'var(--ev-tile-warm)',
  tileHoney: 'var(--ev-tile-honey)',
  badgeBg: 'var(--ev-badge-bg)',
  ink: 'var(--ev-ink)',
  ink70: 'var(--ev-ink-70)',
  ink60: 'var(--ev-ink-60)',
  ink55: 'var(--ev-ink-55)',
  ink50: 'var(--ev-ink-50)',
  ink45: 'var(--ev-ink-45)',
  ink42: 'var(--ev-ink-42)',
  ink40: 'var(--ev-ink-40)',
  ink35: 'var(--ev-ink-35)',
  clay: 'var(--ev-clay)',
  clayDeep: 'var(--ev-clay-deep)',
  sage: 'var(--ev-sage)',
  sageDeep: 'var(--ev-sage-deep)',
  honey: 'var(--ev-honey)',
  line: 'var(--ev-line)',
  lineSoft: 'var(--ev-line-soft)',
  lineStrong: 'var(--ev-line-strong)',
  track: 'var(--ev-track)',
  trackStrong: 'var(--ev-track-strong)',
  fillGhost: 'var(--ev-fill-ghost)',
  borderGhost: 'var(--ev-border-ghost)',
  dash: 'var(--ev-dash)',
  fontDisplay: 'var(--ev-font-display)',
  fontUI: 'var(--ev-font-ui)',
} as const

/** Tabular, lining figures — apply to every money string so columns align. */
export const TABULAR: CSSProperties = {
  fontVariantNumeric: 'tabular-nums lining-nums',
}

/**
 * Avatar tint pairs (background + ink). The first four are the prototype's
 * exact members (Mara/Theo/Sofia/Diego); the rest extend the same soft, warm,
 * never-saturated family so larger groups still get distinct, harmonious faces.
 */
export const AVATAR_TINTS: { bg: string; ink: string }[] = [
  { bg: '#EBD9B4', ink: '#6E5B30' }, // honeyed tan
  { bg: '#C9D7BA', ink: '#4E5C3E' }, // sage
  { bg: '#EBC2B2', ink: '#8A4A37' }, // clay / peach
  { bg: '#DCC8AC', ink: '#6E5736' }, // sand
  { bg: '#D8C4D0', ink: '#6E4A60' }, // dusty mauve
  { bg: '#C4D2D2', ink: '#3E5656' }, // muted teal
  { bg: '#E8CBA0', ink: '#7A5320' }, // amber
  { bg: '#D3CDBE', ink: '#5A5443' }, // greige
  { bg: '#E6C9C0', ink: '#7E4A3E' }, // rosewood
  { bg: '#CBD3C0', ink: '#525C44' }, // olive
] as const

/** Stable string hash (FNV-1a, 32-bit) so a member id always maps to one tint. */
function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic tint for a member id (falls back to name, then index 0). */
export function tintForId(id: string | undefined | null): { bg: string; ink: string } {
  if (!id) return AVATAR_TINTS[0]
  return AVATAR_TINTS[hashString(id) % AVATAR_TINTS.length]
}

/** Derive up-to-2-letter initials from a display name. */
export function initialsOf(name: string | undefined | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** ISO-4217 minor-unit digits for the currencies we surface (default 2). */
const MINOR_DIGITS: Record<string, number> = {
  USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, CHF: 2, CNY: 2, INR: 2, MXN: 2, BRL: 2,
  JPY: 0, KRW: 0, VND: 0, CLP: 0,
  KWD: 3, BHD: 3, OMR: 3, TND: 3,
}

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2
}

/**
 * Format an integer minor-unit amount into a localized currency string.
 * `signed: false` (default) renders the absolute value — the +/- meaning is
 * carried by the label + color in `MoneyText`, matching the prototype
 * ("owed $42.50", not "+$42.50").
 */
export function formatMoney(
  amountMinor: number,
  currency = 'USD',
  opts: { signed?: boolean; locale?: string } = {},
): string {
  const { signed = false, locale = 'en-US' } = opts
  const digits = minorDigits(currency)
  const value = (signed ? amountMinor : Math.abs(amountMinor)) / 10 ** digits
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: signed ? 'always' : 'auto',
    }).format(value)
  } catch {
    // Unknown ISO code — fall back to a plain symbol-less number.
    return `${signed && value > 0 ? '+' : ''}${value.toFixed(digits)} ${currency.toUpperCase()}`
  }
}

/** A balance's tone, from its signed net (>0 owed to you, <0 you owe, 0 even). */
export type MoneyTone = 'owe' | 'owed' | 'even' | 'neutral'

export function toneForNet(netMinor: number, epsilonMinor = 0): MoneyTone {
  if (Math.abs(netMinor) <= epsilonMinor) return 'even'
  return netMinor > 0 ? 'owed' : 'owe'
}
