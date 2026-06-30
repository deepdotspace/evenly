/**
 * FX module (CONTRACT §1.1, §1.13, §2.8, R1). Snapshot-at-entry, cache resolver,
 * current-rate conversion, and the worker-side daily refresh.
 */

export {
  fxRateBetween,
  buildSafeFxResolver,
  buildFxResolver,
  convertMinorAt,
  convertMinorCurrent,
  type SafeFxResolver,
} from './resolver'

export { snapshotFxRate, type FxSnapshot } from './snapshot'

export {
  refreshFxRates,
  fetchUsdRates,
  parseErApiResponse,
  parseFrankfurterResponse,
  type ParsedRates,
  type FxRefreshDeps,
  type FxRefreshResult,
} from './refresh'

export type { FxRatesData } from '../data/types'
