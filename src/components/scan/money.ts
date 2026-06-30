/**
 * Money <-> input-string helpers for the editable receipt review. Everything in
 * state stays in integer minor units (CONTRACT D3); these only bridge to/from
 * the text fields the user edits.
 */

import { minorDigits } from '../../design'

/** Format an integer minor amount as a plain decimal string for an <input>. */
export function minorToInput(minor: number, currency: string): string {
  const digits = minorDigits(currency)
  return (minor / 10 ** digits).toFixed(digits)
}

/** Parse a free-typed money string back to integer minor units (tolerant). */
export function inputToMinor(input: string, currency: string): number {
  const digits = minorDigits(currency)
  // Keep digits, separators and a leading minus; treat comma as a decimal point.
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/,/g, '.')
  const val = Number.parseFloat(cleaned)
  if (!Number.isFinite(val)) return 0
  return Math.round(val * 10 ** digits)
}
