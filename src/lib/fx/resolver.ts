/**
 * FX resolution + conversion (CONTRACT §1.1, §2.8, R1).
 *
 * The `fxRates` cache stores one snapshot per `base` (we write `base:'USD'`) with
 * a `{ [code]: number }` major-unit rate map. A cross-rate is
 * `rate(from -> to) = rates[to] / rates[from]` (CONTRACT §1.13).
 *
 * Two resolver flavors:
 *  - `buildSafeFxResolver` returns `number | null` (null = pair unavailable) --
 *    used by the live dashboard rollup so a missing exotic pair degrades to
 *    "couldn't convert" instead of throwing (CONTRACT edge: FX unavailable).
 *  - `buildFxResolver` matches the engine's `FxResolver` (throws on missing) --
 *    used only as a fallback for rows that somehow lack a stored snapshot.
 *
 * The conversion math (`convertMinorAt`) is the single shared formula the engine
 * uses internally for per-row snapshots; re-exported here so the snapshot-based
 * selectors (insights) and the current-rate rollup (overall net) agree exactly.
 */

import { scale } from '../money/currency'
import type { FxResolver } from '../split'
import type { FxRatesData } from '../data/types'

export type SafeFxResolver = (from: string, to: string) => number | null

/**
 * Cross-rate between two currencies from the cached snapshots, or `null` when no
 * cached row can bridge the pair. Same-currency is always `1`.
 */
export function fxRateBetween(rows: FxRatesData[], from: string, to: string): number | null {
  if (from === to) return 1
  for (const row of rows) {
    const rates = row.rates ?? {}
    const rf = row.base === from ? 1 : rates[from]
    const rt = row.base === to ? 1 : rates[to]
    if (rf != null && rt != null && rf !== 0) return rt / rf
  }
  return null
}

/** A resolver returning `null` for unavailable pairs (dashboard / preview use). */
export function buildSafeFxResolver(rows: FxRatesData[]): SafeFxResolver {
  return (from, to) => fxRateBetween(rows, from, to)
}

/** A strict `FxResolver` (engine-compatible) that throws on an unavailable pair. */
export function buildFxResolver(rows: FxRatesData[]): FxResolver {
  return (from, to) => {
    const r = fxRateBetween(rows, from, to)
    if (r == null) throw new Error(`No FX rate available for ${from} -> ${to}`)
    return r
  }
}

/**
 * Convert a minor amount `m` in `from` currency to `to` currency's minor units
 * at major-per-major rate `r`. Mirrors the engine's internal `primaryMinor` so
 * snapshot-based and current-rate conversions round identically (CONTRACT §2.8).
 */
export function convertMinorAt(m: number, from: string, to: string, r: number): number {
  if (from === to) return m
  return Math.round((m / scale(from)) * r * scale(to))
}

/**
 * Convert a minor amount using the cache at CURRENT rates (CONTRACT R1). Returns
 * `null` when the pair is unavailable so the caller can mark it "not converted".
 */
export function convertMinorCurrent(
  m: number,
  from: string,
  to: string,
  rows: FxRatesData[],
): number | null {
  const r = fxRateBetween(rows, from, to)
  if (r == null) return null
  return convertMinorAt(m, from, to, r)
}
