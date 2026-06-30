/**
 * Snapshot-at-entry helper (CONTRACT §1.1 D4). Every expense/settlement captures
 * the FX rate of its `currency` against the group's `primaryCurrency` AT ENTRY, so
 * past balances never move when rates later change. The create/edit server actions
 * call this with the current `fxRates` cache rows; the result is written onto the
 * row as `fxRate` / `fxAsOf`.
 *
 * Returns `null` only when the pair is unavailable AND no manual rate was supplied
 * -- the caller then prompts for a manual rate (never blocks creation; CONTRACT
 * edge "FX rate unavailable / unsupported currency").
 */

import type { FxRatesData } from '../data/types'
import { fxRateBetween } from './resolver'

export interface FxSnapshot {
  /** Value of 1 major unit of `currency` in major units of `primaryCurrency`. */
  fxRate: number
  /** Capture time (ms). */
  fxAsOf: number
  /** True when the rate came from a user-entered manual override. */
  manual: boolean
}

export function snapshotFxRate(opts: {
  currency: string
  primaryCurrency: string
  rows: FxRatesData[]
  /** A user-entered fallback when the cache lacks the pair. */
  manualRate?: number | null
  nowMs?: number
}): FxSnapshot | null {
  const now = opts.nowMs ?? Date.now()
  if (opts.currency === opts.primaryCurrency) {
    return { fxRate: 1, fxAsOf: now, manual: false }
  }
  const cached = fxRateBetween(opts.rows, opts.currency, opts.primaryCurrency)
  if (cached != null) return { fxRate: cached, fxAsOf: now, manual: false }
  if (opts.manualRate != null && opts.manualRate > 0) {
    return { fxRate: opts.manualRate, fxAsOf: now, manual: true }
  }
  return null
}
