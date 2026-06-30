/**
 * FX hooks (CONTRACT §1.13, §2.8, R1). Read the public `fxRates` cache and expose
 * a ready-to-use resolver for live foreign-amount previews and the cross-group
 * dashboard rollup. `fxRates` is the only `read:true` collection, so this works
 * for anonymous (landing demo) and signed-in users alike.
 */

import { useMemo } from 'react'
import { useQuery, type RecordData } from 'deepspace'
import { buildSafeFxResolver, type SafeFxResolver } from '../lib/fx'
import type { FxRatesData } from '../lib/data/types'

export interface FxRatesState {
  rows: FxRatesData[]
  status: 'loading' | 'ready' | 'error'
  error?: string
  /** Freshness of the newest cached snapshot (ms), or null if none. */
  fetchedAtMs: number | null
}

/** Raw FX cache rows + freshness. */
export function useFxRates(): FxRatesState {
  const q = useQuery<FxRatesData>('fxRates', { limit: 5 })
  const rows = useMemo(() => q.records.map((r: RecordData<FxRatesData>) => r.data), [q.records])
  const fetchedAtMs = useMemo(
    () => rows.reduce<number | null>((m, r) => Math.max(m ?? 0, r.fetchedAtMs ?? 0) || null, null),
    [rows],
  )
  return { rows, status: q.status, error: q.error, fetchedAtMs }
}

export interface FxResolverState {
  /** Cross-rate lookup; returns `null` for an unavailable pair. */
  resolver: SafeFxResolver
  status: 'loading' | 'ready' | 'error'
  ready: boolean
  fetchedAtMs: number | null
}

/** A memoized safe FX resolver built from the cache (for previews + rollup). */
export function useFxResolver(): FxResolverState {
  const { rows, status, fetchedAtMs } = useFxRates()
  const resolver = useMemo(() => buildSafeFxResolver(rows), [rows])
  return { resolver, status, ready: status === 'ready', fetchedAtMs }
}
