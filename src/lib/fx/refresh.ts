/**
 * Worker-side daily FX cache refresh (CONTRACT §1.13). Fetches a free, no-key
 * rate API and upserts a single `base:'USD'` row into the `fxRates` collection.
 *
 * Primary source: open.er-api.com (returns USD + ~160 currencies, includes the
 * base itself as 1). Fallback: frankfurter.app (ECB set, excludes the base, so we
 * inject `USD: 1`). Both are keyless and CORS-open.
 *
 * Wired from the `fx-refresh` cron task (`src/cron.ts`). DeepSpace cron NEVER
 * fires until the CronRoom DO is warmed (SDK footgun #4) -- flagged for deploy in
 * docs/founder/sdk-issues.md. The FX resolver / snapshot helpers degrade
 * gracefully (manual-rate prompt) until the first successful refresh lands.
 *
 * `refreshFxRates` is decoupled from the SDK via a tiny deps interface so it runs
 * under either the cron `ctx.records` shape or a server action's `tools`, and is
 * unit-testable with an injected `fetchFn`.
 */

const ER_API_URL = 'https://open.er-api.com/v6/latest/USD'
const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?base=USD'

export interface ParsedRates {
  base: string
  rates: Record<string, number>
}

/** Parse an open.er-api.com `/v6/latest/USD` response. */
export function parseErApiResponse(json: unknown): ParsedRates | null {
  const j = json as { result?: string; base_code?: string; rates?: Record<string, number> }
  if (!j || j.result !== 'success' || !j.rates || typeof j.rates !== 'object') return null
  const rates = sanitizeRates(j.rates)
  if (Object.keys(rates).length === 0) return null
  return { base: j.base_code ?? 'USD', rates }
}

/** Parse a frankfurter.app `/latest?base=USD` response (base excluded -> add it). */
export function parseFrankfurterResponse(json: unknown): ParsedRates | null {
  const j = json as { base?: string; rates?: Record<string, number> }
  if (!j || !j.rates || typeof j.rates !== 'object') return null
  const base = j.base ?? 'USD'
  const rates = sanitizeRates({ ...j.rates, [base]: 1 })
  if (Object.keys(rates).length === 0) return null
  return { base, rates }
}

function sanitizeRates(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [code, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[code] = v
  }
  return out
}

/** Fetch the USD rate map, trying the primary source then the fallback. */
export async function fetchUsdRates(fetchFn: typeof fetch = fetch): Promise<ParsedRates | null> {
  try {
    const res = await fetchFn(ER_API_URL)
    if (res.ok) {
      const parsed = parseErApiResponse(await res.json())
      if (parsed) return parsed
    }
  } catch {
    // fall through to the fallback source
  }
  try {
    const res = await fetchFn(FRANKFURTER_URL)
    if (res.ok) {
      const parsed = parseFrankfurterResponse(await res.json())
      if (parsed) return parsed
    }
  } catch {
    // both sources unavailable -- the cache simply stays stale this cycle
  }
  return null
}

/** Minimal record surface satisfied by both cron `ctx.records` and `tools`. */
export interface FxRefreshDeps {
  query: (collection: string, opts?: { where?: Record<string, unknown>; limit?: number }) => Promise<Array<{ recordId: string }>>
  create: (collection: string, data: Record<string, unknown>) => Promise<unknown>
  update: (collection: string, recordId: string, data: Record<string, unknown>) => Promise<unknown>
  fetchFn?: typeof fetch
  nowMs?: number
}

export interface FxRefreshResult {
  updated: boolean
  count: number
}

/**
 * Fetch fresh rates and upsert the single `base:'USD'` cache row (query-then-
 * update; never trust a deterministic recordId -- SDK footgun #7). A failed fetch
 * is a no-op (returns `{ updated:false }`), leaving the prior cache in place.
 */
export async function refreshFxRates(deps: FxRefreshDeps): Promise<FxRefreshResult> {
  const parsed = await fetchUsdRates(deps.fetchFn ?? fetch)
  if (!parsed) return { updated: false, count: 0 }

  const data = {
    base: parsed.base,
    rates: parsed.rates,
    fetchedAtMs: deps.nowMs ?? Date.now(),
  }

  const existing = await deps.query('fxRates', { where: { base: parsed.base }, limit: 1 })
  const row = existing?.[0]
  if (row) await deps.update('fxRates', row.recordId, data)
  else await deps.create('fxRates', data)

  return { updated: true, count: Object.keys(parsed.rates).length }
}
