/**
 * The split-math engine (CONTRACT §2). Pure, deterministic, side-effect-free.
 *
 * Every figure is an integer in ONE currency's minor units. Every division
 * routes through `largestRemainder` (Hamilton's method) so outputs always sum to
 * the input EXACTLY -- no lost or invented pennies. The deterministic tie-break
 * is uniform everywhere: higher fractional remainder first, ties broken by
 * ascending `MemberId` (lexicographic). FX is out of scope for the split itself;
 * it touches only the balance-aggregation functions (§2.8/§2.9), which convert
 * each row to the group's primary currency via that row's STORED snapshot.
 */

import { scale } from '../money/currency'
import { SplitError } from './errors'
import type {
  Cents,
  Claims,
  ExpenseLedgerInput,
  ExpenseSharesInput,
  FxResolver,
  GroupInput,
  ItemizedAllocation,
  MemberId,
  OverheadMode,
  ParsedReceiptInput,
  ReceiptItemInput,
  ReconcileResult,
  SettlementLedgerInput,
  Shares,
  Signed,
  SimplifiedPayment,
  SplitConfig,
  UnclaimedPolicy,
} from './types'

export { SplitError } from './errors'

/* ------------------------------------------------------------------ helpers */

/** Ascending lexicographic compare of member ids (the default tie-break). */
function ascId(a: MemberId, b: MemberId): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** A `{ id: 1 }` weight map for an equal split among `ids`. */
function allOne(ids: MemberId[]): Record<MemberId, number> {
  const w: Record<MemberId, number> = {}
  for (const id of ids) w[id] = 1
  return w
}

/** Add every entry of `src` into `target` (mutates `target`). */
function addInto(target: Shares, src: Shares): void {
  for (const id of Object.keys(src)) target[id] = (target[id] ?? 0) + src[id]
}

/** Return a new map = `a + b` per member. */
function addMaps(a: Shares, b: Shares): Shares {
  const r: Shares = { ...a }
  addInto(r, b)
  return r
}

/** Sum the values of a map. */
function sumValues(m: Record<string, number>): number {
  let s = 0
  for (const v of Object.values(m)) s += v
  return s
}

/** Throw unless `shares` sums to exactly `expected` (the engine's core guard). */
function assertSum(shares: Shares, expected: Cents): void {
  const sum = sumValues(shares)
  if (sum !== expected) {
    throw new SplitError('SUM_MISMATCH', `shares sum ${sum} != expected ${expected}`, {
      sum,
      expected,
    })
  }
}

/* ----------------------------------------------------- §2.2 largestRemainder */

/**
 * Hamilton / largest-remainder apportionment. Distributes `total` across members
 * in proportion to non-negative integer `weights`, guaranteeing `Σ === total`.
 *
 * Tie-break: higher remainder first, then ascending `MemberId` (override via
 * `tieBreak`). Uses BigInt for the `total * weight` products so it is exact for
 * any safe-integer inputs.
 */
export function largestRemainder(
  total: Cents,
  weights: Record<MemberId, number>,
  tieBreak: (a: MemberId, b: MemberId) => number = ascId,
): Shares {
  if (!Number.isInteger(total) || total < 0) {
    throw new SplitError('INVALID_TOTAL', `total must be a non-negative integer (got ${total})`)
  }

  const ids = Object.keys(weights)
  const result: Shares = {}
  if (ids.length === 0) return result

  let W = 0
  for (const id of ids) {
    const w = weights[id]
    if (!Number.isInteger(w) || w < 0) {
      throw new SplitError('INVALID_WEIGHT', `weight for "${id}" must be a non-negative integer (got ${w})`)
    }
    W += w
  }

  // All-zero weights: caller is responsible for non-empty/non-zero (§2.2). Return
  // all-zero so the function stays total -- callers that must conserve `total`
  // (distributeOverhead, allocateItemized) guard against this case themselves.
  if (W === 0) {
    for (const id of ids) result[id] = 0
    return result
  }

  const Tb = BigInt(total)
  const Wb = BigInt(W)
  const rema: { id: MemberId; rem: bigint }[] = []
  let allocated = 0n

  for (const id of ids) {
    const prod = Tb * BigInt(weights[id])
    const floorShare = prod / Wb
    result[id] = Number(floorShare)
    allocated += floorShare
    rema.push({ id, rem: prod % Wb })
  }

  const leftover = Number(Tb - allocated) // an integer in [0, ids.length)

  rema.sort((a, b) => {
    if (a.rem !== b.rem) return a.rem > b.rem ? -1 : 1
    return tieBreak(a.id, b.id)
  })
  for (let k = 0; k < leftover; k++) result[rema[k].id] += 1

  return result
}

/* ------------------------------------------------------ §2.3 computeBaseSplit */

/**
 * Split `total` by the chosen base type (equal / exact / percent / shares / treat).
 * `treat` splits equally among `participants`, which the editor has already set to
 * EXCLUDE the payer, so the payer's share is implicitly 0.
 */
export function computeBaseSplit(total: Cents, config: SplitConfig): Shares {
  switch (config.baseType) {
    case 'equal':
    case 'treat': {
      const ps = config.participants
      if (!ps || ps.length === 0) {
        throw new SplitError('NO_PARTICIPANTS', 'cannot split among 0 participants')
      }
      return largestRemainder(total, allOne(ps))
    }
    case 'shares': {
      const w = config.weights
      if (!w || Object.keys(w).length === 0) {
        throw new SplitError('NO_WEIGHTS', 'shares split requires non-empty weights')
      }
      return largestRemainder(total, w)
    }
    case 'percent': {
      const p = config.percents
      if (!p || Object.keys(p).length === 0) {
        throw new SplitError('NO_PERCENTS', 'percent split requires non-empty percents')
      }
      const sum = sumValues(p)
      if (sum !== 100) {
        throw new SplitError('PERCENT_SUM', `percents must sum to 100 (got ${sum})`, { sum })
      }
      return largestRemainder(total, p)
    }
    case 'exact': {
      const e = config.exactAmounts
      if (!e || Object.keys(e).length === 0) {
        throw new SplitError('NO_EXACT', 'exact split requires non-empty exactAmounts')
      }
      const sum = sumValues(e)
      if (sum !== total) {
        throw new SplitError('EXACT_SUM', `exact amounts must sum to ${total} (got ${sum})`, {
          total,
          sum,
          remaining: total - sum,
        })
      }
      return { ...e }
    }
    default:
      throw new SplitError('BAD_BASE_TYPE', `unknown baseType "${String(config.baseType)}"`)
  }
}

/* ----------------------------------------------------- §2.4 applyAdjustments */

/**
 * Compose signed per-person adjustments with any base split. The adjustments are
 * carved OUT of the total first (so the base splits the remainder), then added
 * back -- keeping `Σ === total`. Rejects adjustments that exceed the total.
 */
export function applyAdjustments(
  total: Cents,
  config: SplitConfig,
  baseFn: (total: Cents, config: SplitConfig) => Shares = computeBaseSplit,
): Shares {
  const adj = config.adjustments ?? {}
  for (const [id, v] of Object.entries(adj)) {
    if (!Number.isInteger(v)) {
      throw new SplitError('INVALID_ADJUSTMENT', `adjustment for "${id}" must be an integer (got ${v})`)
    }
  }
  const adjTotal = sumValues(adj)
  const remainder = total - adjTotal
  if (remainder < 0) {
    throw new SplitError('ADJ_EXCEEDS_TOTAL', `adjustments (${adjTotal}) exceed total (${total})`, {
      total,
      adjTotal,
      remainder,
    })
  }

  const base = baseFn(remainder, config)
  const result: Shares = { ...base }
  for (const [id, v] of Object.entries(adj)) result[id] = (result[id] ?? 0) + v
  return result
}

/* --------------------------------------------------- §2.5 distributeOverhead */

/**
 * Distribute one overhead `amount` across members. `proportional` weights by the
 * given per-member `weights` (the subtotals); `even` splits equally. A negative
 * `amount` (a discount) is split on its magnitude then negated, so the result is
 * a signed per-member contribution. Degenerate proportional case (all weights
 * zero) falls back to even so the amount is never silently dropped.
 */
export function distributeOverhead(
  amount: Signed,
  weights: Record<MemberId, Cents>,
  mode: OverheadMode = 'proportional',
): Shares {
  const ids = Object.keys(weights)
  if (ids.length === 0) return {}

  const magnitude = Math.abs(amount)
  let shares: Shares
  if (mode === 'even') {
    shares = largestRemainder(magnitude, allOne(ids))
  } else {
    // Proportional weights are per-member base shares. A large per-person credit
    // (negative adjustment) can push a member's base below zero; that member then
    // carries no positive weight for this overhead, so clamp to >= 0. If every
    // weight clamps to 0, fall back to an even split so the amount is never dropped.
    let clampedSum = 0
    const clamped: Record<MemberId, Cents> = {}
    for (const id of ids) {
      const w = weights[id] > 0 ? weights[id] : 0
      clamped[id] = w
      clampedSum += w
    }
    shares = clampedSum === 0 ? largestRemainder(magnitude, allOne(ids)) : largestRemainder(magnitude, clamped)
  }

  if (amount < 0) {
    for (const id of Object.keys(shares)) shares[id] = -shares[id]
  }
  return shares
}

/* ----------------------------------------------------- §2.7 allocateItemized */

/**
 * Allocate receipt line items to their claimers, then fold the unclaimed pool
 * into subtotals per `unclaimedPolicy`. Each item's `lineTotalMinor` already
 * includes its modifiers. Returns the per-member subtotals plus the unclaimed
 * pool total (for the mandatory "N unclaimed items" banner).
 *
 * `opts.participants` is required for `'even'` and the proportional fallback;
 * `opts.payerId` is required for `'payer'`. For `'manual'`, the pool is left
 * unassigned and the caller must block save while it is > 0.
 */
export function allocateItemized(
  items: ReceiptItemInput[],
  claims: Claims,
  unclaimedPolicy: UnclaimedPolicy = 'even',
  opts: { participants?: MemberId[]; payerId?: MemberId } = {},
): ItemizedAllocation {
  const subtotals: Shares = {}
  // Seed every participant at 0 so members who claimed nothing still appear.
  if (opts.participants) for (const id of opts.participants) subtotals[id] = 0

  let pool = 0
  const unclaimedItemIds: string[] = []

  for (const item of items) {
    const claimers = claims[item.id] ?? []
    if (claimers.length > 0) {
      const split = largestRemainder(item.lineTotalMinor, allOne(claimers))
      addInto(subtotals, split)
    } else {
      pool += item.lineTotalMinor
      unclaimedItemIds.push(item.id)
    }
  }

  if (pool > 0) {
    switch (unclaimedPolicy) {
      case 'even': {
        const ids = opts.participants ?? Object.keys(subtotals)
        if (ids.length === 0) {
          throw new SplitError('NO_PARTICIPANTS', 'cannot distribute the unclaimed pool among 0 participants')
        }
        addInto(subtotals, largestRemainder(pool, allOne(ids)))
        break
      }
      case 'proportional': {
        const claimedW = { ...subtotals }
        if (sumValues(claimedW) === 0) {
          // Nothing claimed yet: fall back to even so the pool is not dropped.
          const ids = opts.participants ?? Object.keys(subtotals)
          if (ids.length === 0) {
            throw new SplitError('NO_PARTICIPANTS', 'cannot distribute the unclaimed pool among 0 participants')
          }
          addInto(subtotals, largestRemainder(pool, allOne(ids)))
        } else {
          addInto(subtotals, largestRemainder(pool, claimedW))
        }
        break
      }
      case 'payer': {
        if (!opts.payerId) {
          throw new SplitError('NO_PAYER', "unclaimedPolicy 'payer' requires a payerId")
        }
        subtotals[opts.payerId] = (subtotals[opts.payerId] ?? 0) + pool
        break
      }
      case 'manual':
        // Leave the pool unassigned; the caller blocks save while it is > 0.
        break
    }
  }

  return { subtotals, unclaimed: pool, unclaimedItemIds }
}

/* ------------------------------------------------- overhead composition core */

/**
 * Distribute every overhead over the given per-member `base` weights and add each
 * onto a running total. Tax lines are applied first so a `postTax` tip can weight
 * by base + tax share. Discounts are negative overhead. Each line is distributed
 * separately (then summed), so `even` and `proportional` lines can coexist.
 */
function applyOverheads(base: Shares, config: SplitConfig): Shares {
  const overheads = config.overheads ?? []
  const total: Shares = { ...base }
  const taxShare: Shares = {}

  for (const o of overheads) {
    if (o.kind !== 'tax') continue
    const s = distributeOverhead(o.amountMinor, base, o.mode ?? 'proportional')
    addInto(total, s)
    addInto(taxShare, s)
  }

  for (const o of overheads) {
    if (o.kind !== 'tip') continue
    const weights = o.base === 'postTax' ? addMaps(base, taxShare) : base
    addInto(total, distributeOverhead(o.amountMinor, weights, o.mode ?? 'proportional'))
  }

  for (const o of overheads) {
    if (o.kind === 'fee') {
      addInto(total, distributeOverhead(o.amountMinor, base, o.mode ?? 'proportional'))
    } else if (o.kind === 'discount') {
      addInto(total, distributeOverhead(-o.amountMinor, base, o.mode ?? 'proportional'))
    }
  }

  return total
}

/* -------------------------------------------------- §2.6 computeExpenseShares */

/**
 * Top-level composition. Returns the resolved owed `splits`, always satisfying
 * `Σ shares === amountMinor` (asserted) -- this is the ledger truth balances
 * derive from. Routes by `scope`:
 *  - `simple`:       split the one figure directly (with adjustments).
 *  - `withOverhead`: base-split the subtotal, then distribute tax/tip/fees/discount.
 *  - `itemized`:     allocate receipt items, then distribute overheads over them.
 */
export function computeExpenseShares(input: ExpenseSharesInput): Shares {
  const { amountMinor, splitConfig: config } = input
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new SplitError('INVALID_AMOUNT', `amountMinor must be a non-negative integer (got ${amountMinor})`)
  }

  let shares: Shares
  switch (config.scope) {
    case 'simple': {
      shares = applyAdjustments(amountMinor, config, computeBaseSplit)
      break
    }
    case 'withOverhead': {
      shares = computeWithOverhead(amountMinor, config)
      break
    }
    case 'itemized': {
      shares = computeItemized(amountMinor, config, input)
      break
    }
    default:
      throw new SplitError('BAD_SCOPE', `unknown scope "${String(config.scope)}"`)
  }

  assertSum(shares, amountMinor)
  return shares
}

function computeWithOverhead(amountMinor: Cents, config: SplitConfig): Shares {
  if (config.subtotalMinor == null) {
    throw new SplitError('NO_SUBTOTAL', 'withOverhead scope requires subtotalMinor')
  }

  // Per-person adjustments are carved out of the subtotal (like the simple case),
  // then added back, so the base sums to the subtotal before overheads apply.
  const adj = config.adjustments ?? {}
  const adjTotal = sumValues(adj)
  const baseTotal = config.subtotalMinor - adjTotal
  if (baseTotal < 0) {
    throw new SplitError('ADJ_EXCEEDS_TOTAL', `adjustments (${adjTotal}) exceed subtotal (${config.subtotalMinor})`, {
      subtotal: config.subtotalMinor,
      adjTotal,
    })
  }

  const base = computeBaseSplit(baseTotal, config)
  for (const [id, v] of Object.entries(adj)) base[id] = (base[id] ?? 0) + v

  return applyOverheads(base, config)
}

function computeItemized(amountMinor: Cents, config: SplitConfig, input: ExpenseSharesInput): Shares {
  if (!input.receipt) {
    throw new SplitError('NO_RECEIPT', 'itemized scope requires receipt items + claims')
  }
  const policy = config.unclaimedPolicy ?? 'even'
  const { subtotals, unclaimed } = allocateItemized(input.receipt.items, input.receipt.claims, policy, {
    participants: config.participants,
    payerId: input.payerId,
  })
  if (policy === 'manual' && unclaimed > 0) {
    throw new SplitError('UNCLAIMED_REMAINING', `${unclaimed} minor units unclaimed; assign before saving`, {
      unclaimed,
    })
  }

  return applyOverheads(subtotals, config)
}

/* ---------------------------------------------------------- FX / conversion */

/**
 * Convert a minor amount `m` in currency `currency` to the `primary` currency's
 * minor units using stored rate `r` (major-per-major). Same-currency is identity
 * (exact, no float). Mirrors CONTRACT §2.8.
 */
function primaryMinor(m: Cents, currency: string, r: number, primary: string): Cents {
  if (currency === primary) return m
  return Math.round((m / scale(currency)) * r * scale(primary))
}

/** Resolve the rate for a row: prefer its stored snapshot, fall back to resolver. */
function resolveRate(
  fxRate: number | null,
  currency: string,
  primary: string,
  fxResolver?: FxResolver,
): number {
  if (fxRate != null) return fxRate
  if (currency === primary) return 1
  if (fxResolver) return fxResolver(currency, primary)
  throw new SplitError('NO_FX_RATE', `missing fxRate snapshot for ${currency}->${primary}`)
}

/* ----------------------------------------------------------- §2.8 netBalances */

/**
 * Signed net per member in the group's primary currency. `> 0` is owed, `< 0`
 * owes. Each non-deleted expense credits payers (`paidBy`) and debits owers
 * (`splits`); each non-deleted settlement moves the debtor toward zero and
 * reduces the creditor. All amounts convert via each row's STORED snapshot
 * (never today's rate). `Σ net` is ~0 (per-row FX rounding can leave a tiny
 * residual -- surface it as "rounding", never a phantom debt).
 */
export function netBalances(
  group: GroupInput,
  expenses: ExpenseLedgerInput[],
  settlements: SettlementLedgerInput[],
  fxResolver?: FxResolver,
): Record<MemberId, Signed> {
  const net: Record<MemberId, Signed> = {}
  const primary = group.primaryCurrency
  const add = (id: MemberId, v: number): void => {
    net[id] = (net[id] ?? 0) + v
  }

  for (const e of expenses) {
    if (e.deletedAt) continue
    const rate = resolveRate(e.fxRate, e.currency, primary, fxResolver)
    for (const [id, paid] of Object.entries(e.paidBy)) {
      add(id, primaryMinor(paid, e.currency, rate, primary))
    }
    for (const [id, owed] of Object.entries(e.splits)) {
      add(id, -primaryMinor(owed, e.currency, rate, primary))
    }
  }

  for (const s of settlements) {
    if (s.deletedAt) continue
    const rate = resolveRate(s.fxRate, s.currency, primary, fxResolver)
    const amt = primaryMinor(s.amountMinor, s.currency, rate, primary)
    add(s.fromUserId, amt)
    add(s.toUserId, -amt)
  }

  return net
}

/* ------------------------------------------------------- §2.9 pairwiseBalances */

/**
 * Raw "who owes whom" net per pair, in the group's primary currency. For each
 * expense, each ower's share is split across the payers in proportion to `paidBy`
 * (via largestRemainder, so it reconciles). A negative share (a per-person credit
 * or an even-mode discount) is split on its magnitude with the direction reversed,
 * so the ower is owed back rather than owing. Settlements net the pair directly.
 * The returned map stores only the net debtor -> creditor amount per pair:
 * `result[debtor][creditor] = amount` (positive). This is the truth shown when
 * "simplify" is off; the per-pair payer-distribution rounding can differ from
 * `netBalances` by a minor unit per person, which is expected.
 */
export function pairwiseBalances(
  group: GroupInput,
  expenses: ExpenseLedgerInput[],
  settlements: SettlementLedgerInput[],
  fxResolver?: FxResolver,
): Record<MemberId, Record<MemberId, Signed>> {
  const primary = group.primaryCurrency
  // gross[debtor][creditor] = how much debtor owes creditor (pre-netting).
  const gross: Record<MemberId, Record<MemberId, number>> = {}
  const ids = new Set<MemberId>()
  const owe = (from: MemberId, to: MemberId, amt: number): void => {
    ids.add(from)
    ids.add(to)
    if (from === to || amt === 0) return
    ;(gross[from] ??= {})[to] = (gross[from][to] ?? 0) + amt
  }

  for (const e of expenses) {
    if (e.deletedAt) continue
    const rate = resolveRate(e.fxRate, e.currency, primary, fxResolver)
    const paidP: Shares = {}
    for (const [id, v] of Object.entries(e.paidBy)) {
      paidP[id] = primaryMinor(v, e.currency, rate, primary)
      ids.add(id)
    }
    const totalPaid = sumValues(paidP)
    if (totalPaid === 0) continue

    for (const [ower, owedRaw] of Object.entries(e.splits)) {
      ids.add(ower)
      const owed = primaryMinor(owedRaw, e.currency, rate, primary)
      if (owed === 0) continue
      // A member's owed share can legitimately be NEGATIVE -- a per-person credit
      // (the +/- adjustment field) or an even-mode discount over an unequal base
      // both produce shares like {A:-50}. Such a member is owed money back, not
      // owing it. Split the magnitude across payers (largestRemainder keeps its
      // non-negative contract), then flip the debtor/creditor direction when the
      // share is negative -- mirroring distributeOverhead's signed handling. This
      // keeps the raw "who owes whom" graph faithful and still nets to the same
      // per-member totals as netBalances (self-portions are dropped but cancel).
      const portions = largestRemainder(Math.abs(owed), paidP)
      for (const [payer, amt] of Object.entries(portions)) {
        if (owed > 0) owe(ower, payer, amt)
        else owe(payer, ower, amt)
      }
    }
  }

  for (const s of settlements) {
    if (s.deletedAt) continue
    const rate = resolveRate(s.fxRate, s.currency, primary, fxResolver)
    const amt = primaryMinor(s.amountMinor, s.currency, rate, primary)
    // The debtor (from) paying the creditor (to) cancels what from owes to.
    owe(s.toUserId, s.fromUserId, amt)
  }

  const sorted = [...ids].sort(ascId)
  const result: Record<MemberId, Record<MemberId, Signed>> = {}
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]
      const b = sorted[j]
      const net = (gross[a]?.[b] ?? 0) - (gross[b]?.[a] ?? 0)
      if (net > 0) (result[a] ??= {})[b] = net
      else if (net < 0) (result[b] ??= {})[a] = -net
    }
  }
  return result
}

/* ---------------------------------------------------------- §2.10 simplifyDebts */

/**
 * Greedy debt minimization over a single-currency net: repeatedly settle the
 * largest creditor against the largest debtor. Emits at most `n - 1` payments.
 * Deterministic: ties broken by ascending `MemberId`. Any residual from FX
 * rounding (Σ net != 0) is simply left unsettled (it is "rounding", not a debt).
 */
export function simplifyDebts(net: Record<MemberId, Signed>): SimplifiedPayment[] {
  const creditors: { id: MemberId; amt: number }[] = []
  const debtors: { id: MemberId; amt: number }[] = []
  for (const [id, bal] of Object.entries(net)) {
    if (bal > 0) creditors.push({ id, amt: bal })
    else if (bal < 0) debtors.push({ id, amt: -bal })
  }

  const pickMax = (arr: { id: MemberId; amt: number }[]): number => {
    let best = 0
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].amt > arr[best].amt || (arr[i].amt === arr[best].amt && arr[i].id < arr[best].id)) {
        best = i
      }
    }
    return best
  }

  const result: SimplifiedPayment[] = []
  while (creditors.length > 0 && debtors.length > 0) {
    const ci = pickMax(creditors)
    const di = pickMax(debtors)
    const c = creditors[ci]
    const d = debtors[di]
    const m = Math.min(c.amt, d.amt)
    result.push({ from: d.id, to: c.id, amount: m })
    c.amt -= m
    d.amt -= m
    if (c.amt === 0) creditors.splice(ci, 1)
    if (d.amt === 0) debtors.splice(di, 1)
  }
  return result
}

/* ----------------------------------------------------------- §2.11 reconcileScan */

/**
 * Reconcile a parsed receipt's line items + overheads against its printed total.
 * `|diff| <= 2` is absorbed as rounding (still noted); `|diff| > 2` or low
 * confidence forces the human review path before the expense can be saved.
 */
export function reconcileScan(parsed: ParsedReceiptInput): ReconcileResult {
  const itemsSum = (parsed.items ?? []).reduce((a, it) => a + it.lineTotalMinor, 0)
  const computedTotal =
    itemsSum +
    (parsed.taxMinor ?? 0) +
    (parsed.tipMinor ?? 0) +
    (parsed.feesMinor ?? 0) -
    (parsed.discountMinor ?? 0)
  const diffMinor = parsed.printedTotalMinor - computedTotal
  const ok = diffMinor === 0
  return {
    ok,
    computedTotal,
    diffMinor,
    absorbAsRounding: !ok && Math.abs(diffMinor) <= 2,
    requiresReview: Math.abs(diffMinor) > 2 || parsed.confidence === 'low',
  }
}
