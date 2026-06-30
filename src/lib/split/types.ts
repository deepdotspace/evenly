/**
 * Split-engine types (CONTRACT §2.0, §2.1).
 *
 * All money is integer minor units of ONE currency; the engine never crosses
 * currencies (FX lives in the balance-aggregation layer, §2.8). Input shapes for
 * the balance functions are kept minimal/structural so the data layer can satisfy
 * them from the DeepSpace record envelopes without adapting.
 */

/** A member identity: a real userId or `"guest:<uuid>"`. */
export type MemberId = string

/** A non-negative integer in one currency's minor units. */
export type Cents = number

/** A signed integer (balances can be negative). */
export type Signed = number

/** An owed/share map; values sum to the input total exactly. */
export type Shares = Record<MemberId, Cents>

export type BaseType = 'equal' | 'exact' | 'percent' | 'shares' | 'treat'

export type SplitScope = 'simple' | 'withOverhead' | 'itemized'

export type OverheadKind = 'tax' | 'tip' | 'fee' | 'discount'

export type OverheadMode = 'proportional' | 'even'

export type TipBase = 'preTax' | 'postTax'

export type UnclaimedPolicy = 'even' | 'proportional' | 'manual' | 'payer'

/** One tax / tip / fee / discount line on an expense (§2.1, §2.5). */
export interface Overhead {
  kind: OverheadKind
  label?: string
  amountMinor: Cents
  /** Defaults to `'proportional'`. */
  mode?: OverheadMode
  /** Only meaningful for `kind:'tip'`; defaults to `'preTax'`. */
  base?: TipBase
}

/** The editor's source of truth, stored on the expense (§2.1). */
export interface SplitConfig {
  scope: SplitScope
  baseType: BaseType
  /** Who shares (a subset of group members). */
  participants: MemberId[]
  /** `false` for "treat / I'm paying". */
  payerIsParticipant?: boolean
  /** When `baseType==='exact'` -- already-exact per-member amounts. */
  exactAmounts?: Shares
  /** When `baseType==='percent'` -- per-member percents that must sum to 100. */
  percents?: Record<MemberId, number>
  /** When `baseType==='shares'` (or `equal` = all 1) -- per-member weights. */
  weights?: Record<MemberId, number>
  /** Signed per-person +/- carve-outs (optional, composes with any base). */
  adjustments?: Record<MemberId, Signed>
  /** When `withOverhead`/`itemized` -- the pre-overhead subtotal. */
  subtotalMinor?: Cents
  /** When `withOverhead`/`itemized` -- the tax/tip/fee/discount lines. */
  overheads?: Overhead[]
  /** When `itemized` -- the linked receipt id. */
  receiptId?: string
  /** When `itemized` -- how to handle unclaimed items; defaults to `'even'`. */
  unclaimedPolicy?: UnclaimedPolicy
}

/** A receipt line item the itemized split references (§1.9, §2.7). */
export interface ReceiptItemInput {
  id: string
  /** Already includes any modifiers (do not double-count). */
  lineTotalMinor: Cents
}

/** `{ [itemId]: memberId[] }` -- who claimed each item (§1.9). */
export type Claims = Record<string, MemberId[]>

/** Input to `computeExpenseShares` -- an expense or an in-progress draft (§2.6). */
export interface ExpenseSharesInput {
  amountMinor: Cents
  splitConfig: SplitConfig
  /** Needed for `baseType:'treat'` exclusion and `unclaimedPolicy:'payer'`. */
  payerId?: MemberId
  /** Required when `splitConfig.scope === 'itemized'`. */
  receipt?: { items: ReceiptItemInput[]; claims: Claims }
}

/** Minimal structural shape of an expense the balance functions read (§1.7). */
export interface ExpenseLedgerInput {
  currency: string
  /** Stored snapshot; `1.0` when same currency, `null` only pre-save. */
  fxRate: number | null
  paidBy: Shares
  splits: Shares
  /** Soft-delete marker; deleted rows are excluded from balances. */
  deletedAt?: number | null
}

/** Minimal structural shape of a settlement the balance functions read (§1.8). */
export interface SettlementLedgerInput {
  fromUserId: MemberId
  toUserId: MemberId
  currency: string
  fxRate: number | null
  amountMinor: Cents
  deletedAt?: number | null
}

/** The group fields the balance functions need (§1.5). */
export interface GroupInput {
  primaryCurrency: string
}

/**
 * Resolves a same-currency-or-FX rate when a row lacks a stored snapshot.
 * `from`/`to` are ISO-4217 codes; returns major-per-major rate. Optional --
 * the per-row stored `fxRate` is the authoritative source (§2.8).
 */
export type FxResolver = (from: string, to: string) => number

/** Minimal structural shape of a parsed receipt for reconciliation (§1.9, §2.11). */
export interface ParsedReceiptInput {
  items: { lineTotalMinor: Cents }[]
  taxMinor?: Cents
  tipMinor?: Cents
  feesMinor?: Cents
  discountMinor?: Cents
  printedTotalMinor: Cents
  confidence?: 'high' | 'medium' | 'low'
}

/** A single simplified settle-up payment (§2.10). */
export interface SimplifiedPayment {
  from: MemberId
  to: MemberId
  amount: Cents
}

/** The result of allocating receipt items to claimers (§2.7). */
export interface ItemizedAllocation {
  /** Per-member subtotal including the distributed unclaimed pool (except `manual`). */
  subtotals: Shares
  /** Total of unclaimed items (the banner amount). 0 when everything is claimed. */
  unclaimed: Cents
  /** Ids of the items that went unclaimed (for "N unclaimed items"). */
  unclaimedItemIds: string[]
}

/** The result of reconciling a scanned receipt against its printed total (§2.11). */
export interface ReconcileResult {
  ok: boolean
  computedTotal: Cents
  diffMinor: Signed
  /** `|diff| <= 2` and nonzero -- absorb silently as rounding (note it). */
  absorbAsRounding: boolean
  /** `|diff| > 2` or low confidence -- force the review path. */
  requiresReview: boolean
}
