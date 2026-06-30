/**
 * Public surface of the Evenly split-math engine (CONTRACT §2) and the currency
 * primitives it builds on (§1.1). Import everything money + split from here.
 */

// Split engine (§2)
export {
  SplitError,
  largestRemainder,
  computeBaseSplit,
  applyAdjustments,
  distributeOverhead,
  allocateItemized,
  computeExpenseShares,
  netBalances,
  pairwiseBalances,
  simplifyDebts,
  reconcileScan,
} from './engine'

// Currency helpers (§1.1)
export {
  MINOR_DIGITS,
  DEFAULT_MINOR_DIGITS,
  minorDigits,
  scale,
  toMinor,
  fromMinor,
  formatMoney,
} from '../money/currency'

// Types
export type {
  MemberId,
  Cents,
  Signed,
  Shares,
  BaseType,
  SplitScope,
  OverheadKind,
  OverheadMode,
  TipBase,
  UnclaimedPolicy,
  Overhead,
  SplitConfig,
  ReceiptItemInput,
  Claims,
  ExpenseSharesInput,
  ExpenseLedgerInput,
  SettlementLedgerInput,
  GroupInput,
  FxResolver,
  ParsedReceiptInput,
  SimplifiedPayment,
  ItemizedAllocation,
  ReconcileResult,
} from './types'
