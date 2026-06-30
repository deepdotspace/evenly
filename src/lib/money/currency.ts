/**
 * Currency primitives (CONTRACT §1.1).
 *
 * Money is ALWAYS integer minor units of a stated ISO-4217 currency. The number
 * of minor-unit decimal places is currency-dependent: most are 2 (USD/EUR), some
 * are 0 (JPY/KRW), some are 3 (KWD/BHD/OMR). The split engine stays inside a
 * single currency and never needs `scale`; only FX conversion (§2.8) does.
 *
 * Formatting routes through `Intl.NumberFormat` so we never hardcode "2 decimals"
 * (CONTRACT §7).
 */

/**
 * Decimal places of a currency's minor unit. Anything not listed defaults to 2.
 * Source: ISO 4217 minor-unit table.
 */
export const MINOR_DIGITS: Record<string, number> = {
  // zero-decimal currencies (no minor unit)
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  MGA: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  // three-decimal currencies
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
}

/** Fallback when a currency code is unknown. */
export const DEFAULT_MINOR_DIGITS = 2

/** Decimal places for a currency code (default 2 if unknown). */
export function minorDigits(code: string): number {
  return MINOR_DIGITS[code] ?? DEFAULT_MINOR_DIGITS
}

/** `scale(code) = 10 ** MINOR_DIGITS[code]` -- minor units per major unit. */
export function scale(code: string): number {
  return 10 ** minorDigits(code)
}

/** Convert a major-unit amount (e.g. 19.99) to integer minor units (1999). */
export function toMinor(major: number, code: string): number {
  return Math.round(major * scale(code))
}

/** Convert integer minor units back to a major-unit number (1999 -> 19.99). */
export function fromMinor(minor: number, code: string): number {
  return minor / scale(code)
}

/**
 * Format an integer minor amount as a localized currency string.
 *
 * Uses `Intl.NumberFormat` with the currency's own minor-unit precision (from
 * `MINOR_DIGITS`, not a hardcoded 2). For an unknown / non-ISO code where Intl
 * throws, falls back to a plain localized number with the code appended.
 */
export function formatMoney(minor: number, code: string, locale?: string): string {
  const digits = minorDigits(code)
  const major = fromMinor(minor, code)
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major)
  } catch {
    const num = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major)
    return `${num} ${code}`
  }
}
