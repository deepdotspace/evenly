import { describe, expect, it } from 'vitest'
import { convertMinorAt, fxRateBetween, buildSafeFxResolver } from './resolver'
import { snapshotFxRate } from './snapshot'
import { parseErApiResponse, parseFrankfurterResponse, refreshFxRates } from './refresh'
import type { FxRatesData } from '../data/types'

const rows: FxRatesData[] = [{ base: 'USD', rates: { USD: 1, EUR: 0.9, GBP: 0.8, JPY: 150 }, fetchedAtMs: 1000 }]

describe('fxRateBetween (CONTRACT §1.13)', () => {
  it('returns 1 for same currency', () => {
    expect(fxRateBetween(rows, 'USD', 'USD')).toBe(1)
  })
  it('cross-rates via the base map', () => {
    expect(fxRateBetween(rows, 'USD', 'EUR')).toBeCloseTo(0.9)
    expect(fxRateBetween(rows, 'EUR', 'USD')).toBeCloseTo(1 / 0.9)
    expect(fxRateBetween(rows, 'EUR', 'GBP')).toBeCloseTo(0.8 / 0.9)
  })
  it('returns null for an unavailable pair', () => {
    expect(fxRateBetween(rows, 'EUR', 'XYZ')).toBeNull()
  })
})

describe('convertMinorAt (CONTRACT §2.8 scale-aware)', () => {
  it('converts within 2-decimal currencies', () => {
    expect(convertMinorAt(1000, 'USD', 'EUR', 0.9)).toBe(900)
  })
  it('handles a 0-decimal target currency (JPY)', () => {
    // $10.00 -> ¥1500 at 150 JPY per USD
    expect(convertMinorAt(1000, 'USD', 'JPY', 150)).toBe(1500)
  })
  it('is identity for same currency', () => {
    expect(convertMinorAt(1234, 'USD', 'USD', 999)).toBe(1234)
  })
})

describe('buildSafeFxResolver', () => {
  it('exposes a null-on-miss resolver', () => {
    const r = buildSafeFxResolver(rows)
    expect(r('USD', 'EUR')).toBeCloseTo(0.9)
    expect(r('AAA', 'BBB')).toBeNull()
  })
})

describe('snapshotFxRate (CONTRACT D4, §1.1)', () => {
  it('is 1.0 for same-currency, not manual', () => {
    const s = snapshotFxRate({ currency: 'USD', primaryCurrency: 'USD', rows })
    expect(s).toMatchObject({ fxRate: 1, manual: false })
  })
  it('reads the cache for a cross pair', () => {
    const s = snapshotFxRate({ currency: 'EUR', primaryCurrency: 'USD', rows })
    expect(s?.fxRate).toBeCloseTo(1 / 0.9)
    expect(s?.manual).toBe(false)
  })
  it('falls back to a manual rate when the cache lacks the pair', () => {
    const s = snapshotFxRate({ currency: 'XYZ', primaryCurrency: 'USD', rows, manualRate: 3.5 })
    expect(s).toMatchObject({ fxRate: 3.5, manual: true })
  })
  it('returns null when neither cache nor manual rate is available', () => {
    expect(snapshotFxRate({ currency: 'XYZ', primaryCurrency: 'USD', rows })).toBeNull()
  })
})

describe('rate-API parsers', () => {
  it('parses an open.er-api.com success response', () => {
    const parsed = parseErApiResponse({ result: 'success', base_code: 'USD', rates: { USD: 1, EUR: 0.92 } })
    expect(parsed).toEqual({ base: 'USD', rates: { USD: 1, EUR: 0.92 } })
  })
  it('rejects a failed er-api response', () => {
    expect(parseErApiResponse({ result: 'error' })).toBeNull()
  })
  it('parses frankfurter and injects the base as 1', () => {
    const parsed = parseFrankfurterResponse({ base: 'USD', rates: { EUR: 0.91 } })
    expect(parsed).toEqual({ base: 'USD', rates: { EUR: 0.91, USD: 1 } })
  })
})

describe('refreshFxRates upsert (CONTRACT §1.13, footgun #7)', () => {
  function fakeFetch(ok: boolean): typeof fetch {
    return (async () =>
      ({
        ok,
        json: async () => ({ result: 'success', base_code: 'USD', rates: { USD: 1, EUR: 0.9 } }),
      }) as unknown as Response) as unknown as typeof fetch
  }

  it('creates a row when none exists, then updates it', async () => {
    const store: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const deps = {
      query: async () => store,
      create: async (_c: string, data: Record<string, unknown>) => {
        store.push({ recordId: 'fx1', data })
        return { recordId: 'fx1' }
      },
      update: async (_c: string, recordId: string, data: Record<string, unknown>) => {
        const row = store.find((r) => r.recordId === recordId)!
        row.data = data
        return { recordId }
      },
      fetchFn: fakeFetch(true),
      nowMs: 5000,
    }

    const first = await refreshFxRates(deps)
    expect(first.updated).toBe(true)
    expect(first.count).toBe(2)
    expect(store).toHaveLength(1)

    // Second run finds the existing row and updates in place (no duplicate).
    const second = await refreshFxRates({ ...deps, query: async () => store, nowMs: 6000 })
    expect(second.updated).toBe(true)
    expect(store).toHaveLength(1)
    expect(store[0].data.fetchedAtMs).toBe(6000)
  })

  it('is a no-op when both rate sources are unavailable', async () => {
    const deps = {
      query: async () => [],
      create: async () => ({ recordId: 'x' }),
      update: async () => ({ recordId: 'x' }),
      fetchFn: fakeFetch(false),
    }
    const result = await refreshFxRates(deps)
    expect(result).toEqual({ updated: false, count: 0 })
  })
})
