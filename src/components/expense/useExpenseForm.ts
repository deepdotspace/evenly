/**
 * useExpenseForm — the add/edit expense brain (CONTRACT §3.5, §2).
 *
 * Holds every input as editable UI state, maps it deterministically onto the
 * engine's `SplitConfig` + `paidBy` (§2.1), and runs the REAL
 * `computeExpenseShares` (§2.6) on every keystroke for a live preview that is
 * byte-identical to what the server will recompute on save. The same derivation
 * decides whether save is unlocked (Σ paidBy === Σ splits === amountMinor).
 *
 * SplitType -> engine mapping:
 *   equal/exact/percent/shares  -> scope 'simple' (or 'withOverhead' when overheads exist), baseType = the type
 *   treat                       -> baseType 'treat', payer excluded from participants, single payer
 *   byitem                      -> scope 'itemized', from manual line items or a linked receipt
 * Overheads (tax/tip/fee/discount) flip scope simple -> withOverhead and make
 * the Amount field the SUBTOTAL; the grand total = subtotal + Σtax+tip+fees − Σdiscount.
 */

import { useMemo, useState } from 'react'
import {
  computeExpenseShares,
  SplitError,
  scale,
  type BaseType,
  type Claims,
  type MemberId,
  type Overhead,
  type OverheadKind,
  type OverheadMode,
  type Shares,
  type SplitConfig,
  type SplitScope,
  type TipBase,
} from '../../lib/split'
import { formatMoney } from '../../design'
import type { SafeFxResolver } from '../../lib/fx'
import { convertMinorAt } from '../../lib/fx'
import type { ExpenseData, ParsedReceipt } from '../../lib/data/types'
import {
  derivePayerId,
  dateInputToMs,
  minorToStr,
  msToDateInput,
  newLineId,
  numOr,
  sumShares,
  toMinorSafe,
  toSignedMinor,
  type RosterMember,
  type SplitType,
} from './shared'

/* ------------------------------------------------------------------- types */

export interface OverheadRow {
  key: string
  kind: OverheadKind
  amountStr: string
  mode: OverheadMode
  base: TipBase
}

export interface LineItemRow {
  id: string
  name: string
  amountStr: string
}

/** An expense + its (possibly absent) `note` column (CONTRACT §1.7). */
export type ExpenseDataWithNote = ExpenseData & { note?: string | null }

export interface ExpenseFormInit {
  primary: string
  roster: RosterMember[]
  youId: string
  /** Edit mode: the existing expense to seed from. */
  existing?: { id: string; data: ExpenseDataWithNote } | null
  /** Itemized seed from a scanned receipt (sets by-item). */
  receiptSeed?: { id: string; parsed: ParsedReceipt; claims: Claims } | null
  /** Remembered group default to pre-seed a fresh expense. */
  defaultSplit?: SplitConfig | null
  /** Live FX resolver for the foreign-amount preview. */
  resolver: SafeFxResolver
  fetchedAtMs: number | null
}

const OVERHEAD_LABEL: Record<OverheadKind, string> = {
  tax: 'Tax',
  tip: 'Tip',
  fee: 'Fee',
  discount: 'Discount',
}

/* --------------------------------------------------------------- the hook */

export function useExpenseForm(init: ExpenseFormInit) {
  const { primary, roster, youId, existing, receiptSeed, defaultSplit, resolver, fetchedAtMs } = init
  const rosterIds = useMemo(() => roster.map((r) => r.id), [roster])

  // Seed once: the route keys this component on the record/group, so a fresh
  // record always remounts rather than mutating an already-edited form.
  const seed = useMemo(() => buildSeed(init), [])

  /* ---- core fields ---- */
  const [description, setDescription] = useState(seed.description)
  const [category, setCategory] = useState(seed.category)
  const [currency, setCurrency] = useState(seed.currency)
  const [amountStr, setAmountStr] = useState(seed.amountStr)
  const [dateStr, setDateStr] = useState(seed.dateStr)
  const [note, setNote] = useState(seed.note)

  /* ---- split ---- */
  const [splitType, setSplitTypeRaw] = useState<SplitType>(seed.splitType)
  const [participantIds, setParticipantIds] = useState<MemberId[]>(seed.participantIds)
  const [exactStr, setExactStr] = useState<Record<string, string>>(seed.exactStr)
  const [percentStr, setPercentStr] = useState<Record<string, string>>(seed.percentStr)
  const [weightStr, setWeightStr] = useState<Record<string, string>>(seed.weightStr)
  const [adjustEnabled, setAdjustEnabled] = useState(seed.adjustEnabled)
  const [adjustStr, setAdjustStr] = useState<Record<string, string>>(seed.adjustStr)

  /* ---- payer ---- */
  const [multiPayer, setMultiPayer] = useState(seed.multiPayer)
  const [singlePayerId, setSinglePayerId] = useState(seed.singlePayerId)
  const [multiPayerStr, setMultiPayerStr] = useState<Record<string, string>>(seed.multiPayerStr)

  /* ---- overhead ---- */
  const [overheads, setOverheads] = useState<OverheadRow[]>(seed.overheads)

  /* ---- itemized ---- */
  const [lineItems, setLineItems] = useState<LineItemRow[]>(seed.lineItems)
  const [claims, setClaims] = useState<Claims>(seed.claims)
  const [unclaimedPolicy, setUnclaimedPolicy] = useState(seed.unclaimedPolicy)
  const receiptId = seed.receiptId

  /* ---- foreign currency ---- */
  const [manualRateStr, setManualRateStr] = useState('')

  /* ---- options ---- */
  const [rememberDefault, setRememberDefault] = useState(false)

  /* ---------------------------------------------------------- derivations */

  // Treat forces a single payer who is NOT a participant.
  const effectivePayerMode = splitType === 'treat' ? 'single' : multiPayer ? 'multi' : 'single'

  const subtotalMinor = useMemo(() => {
    if (splitType === 'byitem') {
      return lineItems.reduce((s, li) => s + toMinorSafe(li.amountStr, currency), 0)
    }
    return toMinorSafe(amountStr, currency)
  }, [splitType, lineItems, amountStr, currency])

  const overheadNet = useMemo(
    () =>
      overheads.reduce((s, o) => {
        const amt = toMinorSafe(o.amountStr, currency)
        return s + (o.kind === 'discount' ? -amt : amt)
      }, 0),
    [overheads, currency],
  )

  const amountMinor = subtotalMinor + overheadNet
  const hasOverhead = overheads.some((o) => toMinorSafe(o.amountStr, currency) > 0)
  const scope: SplitScope = splitType === 'byitem' ? 'itemized' : hasOverhead ? 'withOverhead' : 'simple'

  // Participants the engine actually splits among (treat drops the payer).
  const effectiveParticipants = useMemo(() => {
    if (splitType === 'treat') return participantIds.filter((id) => id !== singlePayerId)
    return participantIds
  }, [splitType, participantIds, singlePayerId])

  const paidBy: Shares = useMemo(() => {
    if (amountMinor <= 0) return {}
    if (effectivePayerMode === 'single') return { [singlePayerId]: amountMinor }
    const out: Shares = {}
    for (const r of roster) {
      const v = toMinorSafe(multiPayerStr[r.id] ?? '', currency)
      if (v > 0) out[r.id] = v
    }
    return out
  }, [amountMinor, effectivePayerMode, singlePayerId, roster, multiPayerStr, currency])

  const payerId = effectivePayerMode === 'single' ? singlePayerId : derivePayerId(paidBy)

  const overheadList: Overhead[] = useMemo(
    () =>
      overheads
        .map((o) => ({
          kind: o.kind,
          label: OVERHEAD_LABEL[o.kind],
          amountMinor: toMinorSafe(o.amountStr, currency),
          mode: o.mode,
          ...(o.kind === 'tip' ? { base: o.base } : {}),
        }))
        .filter((o) => o.amountMinor > 0),
    [overheads, currency],
  )

  const receiptItems = useMemo(
    () => lineItems.map((li) => ({ id: li.id, lineTotalMinor: toMinorSafe(li.amountStr, currency) })),
    [lineItems, currency],
  )

  const splitConfig: SplitConfig = useMemo(() => {
    const baseType: BaseType =
      splitType === 'byitem' ? 'equal' : (splitType as BaseType)
    const cfg: SplitConfig = {
      scope,
      baseType,
      participants: effectiveParticipants,
      payerIsParticipant: splitType !== 'treat',
    }

    if (splitType === 'exact') {
      cfg.exactAmounts = mapOver(effectiveParticipants, (id) => toMinorSafe(exactStr[id] ?? '', currency))
    } else if (splitType === 'percent') {
      cfg.percents = mapOver(effectiveParticipants, (id) => numOr(percentStr[id] ?? ''))
    } else if (splitType === 'shares') {
      cfg.weights = mapOver(effectiveParticipants, (id) => Math.max(0, Math.round(numOr(weightStr[id] ?? '', 1))))
    }

    if (adjustEnabled && (splitType === 'equal' || splitType === 'shares' || splitType === 'percent')) {
      const adj: Record<string, number> = {}
      for (const id of effectiveParticipants) {
        const v = toSignedMinor(adjustStr[id] ?? '', currency)
        if (v !== 0) adj[id] = v
      }
      if (Object.keys(adj).length) cfg.adjustments = adj
    }

    if (scope === 'withOverhead' || scope === 'itemized') {
      cfg.subtotalMinor = subtotalMinor
      cfg.overheads = overheadList
    }
    if (scope === 'itemized') {
      cfg.unclaimedPolicy = unclaimedPolicy
      if (receiptId) cfg.receiptId = receiptId
    }
    return cfg
  }, [
    splitType,
    scope,
    effectiveParticipants,
    exactStr,
    percentStr,
    weightStr,
    adjustEnabled,
    adjustStr,
    currency,
    subtotalMinor,
    overheadList,
    unclaimedPolicy,
    receiptId,
  ])

  const receiptInput = useMemo(
    () => (scope === 'itemized' ? { items: receiptItems, claims } : undefined),
    [scope, receiptItems, claims],
  )

  /* ---- the live preview (the real engine) ---- */
  const preview = useMemo<{ shares?: Shares; error?: string }>(() => {
    if (amountMinor < 0) {
      return { error: 'Discounts are larger than the amount.' }
    }
    if (amountMinor === 0) return {}
    try {
      const shares = computeExpenseShares({
        amountMinor,
        splitConfig,
        payerId,
        receipt: receiptInput,
      })
      return { shares }
    } catch (e) {
      return { error: humanizeSplitError(e, currency) }
    }
  }, [amountMinor, splitConfig, payerId, receiptInput, currency])

  /* ---- reconciliation + FX ---- */
  const paidBySum = sumShares(paidBy)
  const paidByValid = amountMinor > 0 && paidBySum === amountMinor

  const foreign = currency !== primary
  const liveRate = foreign ? resolver(currency, primary) : 1
  const manualRate = numOr(manualRateStr)
  const usingManual = foreign && liveRate == null && manualRate > 0
  const effectiveRate = foreign ? (liveRate ?? (manualRate > 0 ? manualRate : null)) : 1
  const fxReady = !foreign || effectiveRate != null
  const convertedMinor =
    foreign && effectiveRate != null ? convertMinorAt(amountMinor, currency, primary, effectiveRate) : null

  const descriptionOk = description.trim().length > 0
  const canSave = descriptionOk && amountMinor > 0 && !!preview.shares && paidByValid && fxReady

  /** A single human reason save is blocked (for the reconcile bar), or null. */
  const blockReason: string | null = useMemo(() => {
    if (!descriptionOk) return 'Add a description'
    if (amountMinor <= 0) return splitType === 'byitem' ? 'Add at least one item' : 'Enter an amount'
    if (preview.error) return preview.error
    if (!paidByValid) {
      const diff = amountMinor - paidBySum
      return diff > 0
        ? `Payers cover ${formatMoney(paidBySum, currency)} of ${formatMoney(amountMinor, currency)}, ${formatMoney(diff, currency)} unaccounted`
        : `Payers cover ${formatMoney(paidBySum, currency)}, ${formatMoney(-diff, currency)} over the total`
    }
    if (!fxReady) return 'Add an exchange rate for this currency'
    return null
  }, [descriptionOk, amountMinor, splitType, preview.error, paidByValid, paidBySum, currency, fxReady])

  /* ------------------------------------------------------- mutators / build */

  function setSplitType(t: SplitType) {
    setSplitTypeRaw(t)
    // Seed sensible per-type defaults so the preview is valid immediately.
    if (t === 'shares') {
      setWeightStr((prev) => fillDefaults(prev, participantIds, '1'))
    }
    if (t === 'byitem' && lineItems.length === 0) {
      setLineItems([{ id: newLineId(), name: '', amountStr: '' }])
    }
    if (t === 'treat') setMultiPayer(false)
  }

  function toggleParticipant(id: MemberId) {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...rosterIds].filter((x) => prev.includes(x) || x === id),
    )
  }

  function toggleClaim(itemId: string, memberId: MemberId) {
    setClaims((prev) => {
      const cur = prev[itemId] ?? []
      const next = cur.includes(memberId) ? cur.filter((m) => m !== memberId) : [...cur, memberId]
      return { ...prev, [itemId]: next }
    })
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, { id: newLineId(), name: '', amountStr: '' }])
  }
  function updateLineItem(id: string, patch: Partial<LineItemRow>) {
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, ...patch } : li)))
  }
  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((li) => li.id !== id))
    setClaims((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function addOverhead(kind: OverheadKind) {
    setOverheads((prev) => [...prev, { key: newLineId(), kind, amountStr: '', mode: 'proportional', base: 'preTax' }])
  }
  function updateOverhead(key: string, patch: Partial<OverheadRow>) {
    setOverheads((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)))
  }
  function removeOverhead(key: string) {
    setOverheads((prev) => prev.filter((o) => o.key !== key))
  }

  /** The `ExpenseDraft` payload for addExpense / editExpense.patch. */
  function buildDraft() {
    return {
      description: description.trim(),
      category,
      currency,
      amountMinor,
      paidBy,
      splitConfig,
      expenseAtMs: dateInputToMs(dateStr),
      receiptId: receiptId ?? null,
      receipt: scope === 'itemized' ? { items: receiptItems, claims } : undefined,
      manualRate: usingManual ? manualRate : undefined,
      note: note.trim() || null,
    }
  }

  return {
    // identity / context
    primary,
    roster,
    youId,
    isEdit: !!existing,
    // core fields
    description,
    setDescription,
    category,
    setCategory,
    currency,
    setCurrency,
    amountStr,
    setAmountStr,
    dateStr,
    setDateStr,
    note,
    setNote,
    // split
    splitType,
    setSplitType,
    participantIds,
    setParticipantIds,
    toggleParticipant,
    effectiveParticipants,
    exactStr,
    setExactStr,
    percentStr,
    setPercentStr,
    weightStr,
    setWeightStr,
    adjustEnabled,
    setAdjustEnabled,
    adjustStr,
    setAdjustStr,
    // payer
    multiPayer,
    setMultiPayer,
    singlePayerId,
    setSinglePayerId,
    multiPayerStr,
    setMultiPayerStr,
    effectivePayerMode,
    paidBy,
    paidBySum,
    paidByValid,
    // overhead
    overheads,
    addOverhead,
    updateOverhead,
    removeOverhead,
    // itemized
    lineItems,
    addLineItem,
    updateLineItem,
    removeLineItem,
    claims,
    toggleClaim,
    unclaimedPolicy,
    setUnclaimedPolicy,
    receiptId,
    // derived
    subtotalMinor,
    overheadNet,
    amountMinor,
    scope,
    splitConfig,
    preview,
    // fx
    foreign,
    liveRate,
    effectiveRate,
    usingManual,
    fxReady,
    convertedMinor,
    manualRateStr,
    setManualRateStr,
    fetchedAtMs,
    // options
    rememberDefault,
    setRememberDefault,
    // status
    canSave,
    blockReason,
    // build
    buildDraft,
  }
}

export type ExpenseFormState = ReturnType<typeof useExpenseForm>

/* --------------------------------------------------------------- seeding */

interface Seed {
  description: string
  category: string
  currency: string
  amountStr: string
  dateStr: string
  note: string
  splitType: SplitType
  participantIds: MemberId[]
  exactStr: Record<string, string>
  percentStr: Record<string, string>
  weightStr: Record<string, string>
  adjustEnabled: boolean
  adjustStr: Record<string, string>
  multiPayer: boolean
  singlePayerId: string
  multiPayerStr: Record<string, string>
  overheads: OverheadRow[]
  lineItems: LineItemRow[]
  claims: Claims
  unclaimedPolicy: NonNullable<SplitConfig['unclaimedPolicy']>
  receiptId: string | null
}

function buildSeed(init: ExpenseFormInit): Seed {
  const { primary, roster, youId, existing, receiptSeed, defaultSplit } = init
  const allIds = roster.map((r) => r.id)
  const defaultPayer = roster.find((r) => r.id === youId)?.id ?? allIds[0] ?? youId

  const blank: Seed = {
    description: '',
    category: 'other',
    currency: primary,
    amountStr: '',
    dateStr: msToDateInput(undefined),
    note: '',
    splitType: 'equal',
    participantIds: allIds,
    exactStr: {},
    percentStr: {},
    weightStr: fillDefaults({}, allIds, '1'),
    adjustEnabled: false,
    adjustStr: {},
    multiPayer: false,
    singlePayerId: defaultPayer,
    multiPayerStr: {},
    overheads: [],
    lineItems: [],
    claims: {},
    unclaimedPolicy: 'even',
    receiptId: null,
  }

  // --- itemized seed from a scanned receipt ---
  if (receiptSeed && !existing) {
    const cur = receiptSeed.parsed.currency || primary
    return {
      ...blank,
      currency: cur,
      splitType: 'byitem',
      receiptId: receiptSeed.id,
      lineItems: receiptSeed.parsed.items.map((it) => ({
        id: it.id,
        name: it.name,
        amountStr: minorToStr(it.lineTotalMinor, cur),
      })),
      claims: receiptSeed.claims ?? {},
      overheads: overheadsFromParsed(receiptSeed.parsed, cur),
      description: receiptSeed.parsed.merchant ?? '',
    }
  }

  // --- edit: reverse-map an existing expense ---
  if (existing) {
    return seedFromExisting(existing.data, roster, defaultPayer, receiptSeed, blank)
  }

  // --- fresh, with a remembered group default ---
  if (defaultSplit) {
    return { ...blank, ...seedFromConfig(defaultSplit, primary, allIds) }
  }

  return blank
}

function seedFromExisting(
  data: ExpenseDataWithNote,
  roster: RosterMember[],
  defaultPayer: string,
  receiptSeed: ExpenseFormInit['receiptSeed'],
  blank: Seed,
): Seed {
  const cur = data.currency
  const cfg = data.splitConfig
  const payerKeys = Object.keys(data.paidBy ?? {})
  const multi = payerKeys.length > 1

  const base: Seed = {
    ...blank,
    description: data.description,
    category: data.category || 'other',
    currency: cur,
    dateStr: msToDateInput(data.expenseAtMs),
    note: data.note ?? '',
    multiPayer: multi,
    singlePayerId: payerKeys[0] ?? defaultPayer,
    multiPayerStr: multi
      ? Object.fromEntries(payerKeys.map((id) => [id, minorToStr(data.paidBy[id], cur)]))
      : {},
    receiptId: data.receiptId ?? null,
  }

  // Itemized with a recoverable receipt -> full edit. Otherwise fall back to
  // exact amounts from the stored splits (line items aren't re-derivable).
  if (cfg.scope === 'itemized') {
    if (receiptSeed) {
      return {
        ...base,
        splitType: 'byitem',
        currency: receiptSeed.parsed.currency || cur,
        lineItems: receiptSeed.parsed.items.map((it) => ({
          id: it.id,
          name: it.name,
          amountStr: minorToStr(it.lineTotalMinor, cur),
        })),
        claims: receiptSeed.claims ?? {},
        overheads: (cfg.overheads ?? []).map(overheadRow(cur)),
        unclaimedPolicy: cfg.unclaimedPolicy ?? 'even',
        participantIds: cfg.participants ?? base.participantIds,
      }
    }
    return {
      ...base,
      splitType: 'exact',
      participantIds: Object.keys(data.splits),
      exactStr: Object.fromEntries(Object.entries(data.splits).map(([id, v]) => [id, minorToStr(v, cur)])),
    }
  }

  return { ...base, ...seedFromConfig(cfg, cur, base.participantIds), ...preservePayer(base) }
}

/** Keep the payer fields computed in `base` (seedFromConfig doesn't touch them). */
function preservePayer(base: Seed) {
  return { multiPayer: base.multiPayer, singlePayerId: base.singlePayerId, multiPayerStr: base.multiPayerStr }
}

/** Reverse-map a simple / withOverhead splitConfig into editor state. */
function seedFromConfig(cfg: SplitConfig, cur: string, allIds: MemberId[]): Partial<Seed> {
  const parts = cfg.participants?.length ? cfg.participants : allIds
  const splitType: SplitType = cfg.baseType === 'treat' ? 'treat' : (cfg.baseType as SplitType)
  const out: Partial<Seed> = {
    splitType,
    participantIds: parts,
    currency: cur,
  }
  if (cfg.subtotalMinor != null) out.amountStr = minorToStr(cfg.subtotalMinor, cur)
  if (cfg.exactAmounts) out.exactStr = Object.fromEntries(Object.entries(cfg.exactAmounts).map(([id, v]) => [id, minorToStr(v, cur)]))
  if (cfg.percents) out.percentStr = Object.fromEntries(Object.entries(cfg.percents).map(([id, v]) => [id, String(v)]))
  if (cfg.weights) out.weightStr = Object.fromEntries(Object.entries(cfg.weights).map(([id, v]) => [id, String(v)]))
  if (cfg.adjustments && Object.keys(cfg.adjustments).length) {
    out.adjustEnabled = true
    out.adjustStr = Object.fromEntries(
      Object.entries(cfg.adjustments).map(([id, v]) => [id, (v / scale(cur)).toString()]),
    )
  }
  if (cfg.overheads?.length) out.overheads = cfg.overheads.map(overheadRow(cur))
  return out
}

function overheadRow(cur: string) {
  return (o: Overhead): OverheadRow => ({
    key: newLineId(),
    kind: o.kind,
    amountStr: minorToStr(o.amountMinor, cur),
    mode: o.mode ?? 'proportional',
    base: o.base ?? 'preTax',
  })
}

function overheadsFromParsed(p: ParsedReceipt, cur: string): OverheadRow[] {
  const rows: OverheadRow[] = []
  const add = (kind: OverheadKind, v: number) => {
    if (v > 0) rows.push({ key: newLineId(), kind, amountStr: minorToStr(v, cur), mode: 'proportional', base: 'preTax' })
  }
  add('tax', p.taxMinor)
  add('tip', p.tipMinor)
  add('fee', p.feesMinor)
  add('discount', p.discountMinor)
  return rows
}

/* --------------------------------------------------------------- helpers */

function mapOver<T>(ids: MemberId[], fn: (id: MemberId) => T): Record<MemberId, T> {
  const out: Record<MemberId, T> = {}
  for (const id of ids) out[id] = fn(id)
  return out
}

function fillDefaults(prev: Record<string, string>, ids: MemberId[], val: string): Record<string, string> {
  const out = { ...prev }
  for (const id of ids) if (out[id] == null || out[id] === '') out[id] = val
  return out
}

/** Map a SplitError to a calm, human, currency-aware sentence (CONTRACT §3.5). */
export function humanizeSplitError(e: unknown, currency: string): string {
  if (!(e instanceof SplitError)) return (e as Error)?.message ?? 'Something is off with this split.'
  const d = e.details ?? {}
  switch (e.code) {
    case 'EXACT_SUM': {
      const remaining = Number(d.remaining ?? 0)
      return remaining > 0
        ? `Exact amounts are ${formatMoney(remaining, currency)} short of the total.`
        : `Exact amounts are ${formatMoney(-remaining, currency)} over the total.`
    }
    case 'PERCENT_SUM':
      return `Percentages add up to ${Number(d.sum ?? 0)}%. They need to total 100%.`
    case 'ADJ_EXCEEDS_TOTAL':
      return 'The adjustments are larger than the amount to split.'
    case 'NO_PARTICIPANTS':
      return 'Pick at least one person to split with.'
    case 'NO_WEIGHTS':
      return 'Give at least one person a share.'
    case 'NO_PERCENTS':
      return 'Enter each percentage.'
    case 'NO_EXACT':
      return "Enter each person's exact amount."
    case 'UNCLAIMED_REMAINING':
      return `${formatMoney(Number(d.unclaimed ?? 0), currency)} of items aren't assigned yet.`
    case 'INVALID_AMOUNT':
      return 'Enter a valid amount.'
    default:
      return e.message
  }
}
