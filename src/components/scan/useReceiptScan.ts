/**
 * useReceiptScan -- the controller for the scan -> review -> assign -> save flow
 * (CONTRACT §3.6, §2.7, §2.11, D9).
 *
 * Holds the small state machine, the EDITABLE parsed receipt, the local claims
 * map, the payer, and the unclaimed policy; exposes derived figures (subtotal,
 * grand total, live reconcile, claimed/unclaimed) the views render. Side effects
 * are the R2 upload (passed in, scope:'app'), the `scanReceipt` vision call, and
 * the final `addExpense` write -- all through real SDK surface.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthToken } from 'deepspace'
import { reconcileScan, type SplitConfig } from '../../lib/split'
import type { ParsedReceipt, ParsedReceiptItem } from '../../lib/data/types'
import type { AssignMember, ClaimsMap, ScanPhase, UnclaimedPolicy } from './types'
import { inputToMinor } from './money'

/** The R2 upload fn shape from `useR2Files({ scope: 'app' })`. */
export type UploadFn = (
  file: File | Blob,
  name?: string,
) => Promise<{ success: boolean; key?: string; url?: string; error?: string }>

interface ScanReceiptResult {
  receiptId: string
  parsed: ParsedReceipt
  status: string
  reused?: boolean
}

interface UseReceiptScanArgs {
  groupId: string
  userId: string | null | undefined
  members: AssignMember[]
  primaryCurrency: string
  upload: UploadFn
}

async function callAction<T>(
  action: string,
  body: unknown,
): Promise<{ success: boolean; data?: T; error?: string }> {
  const token = await getAuthToken()
  const res = await fetch(`/api/actions/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return (await res.json()) as { success: boolean; data?: T; error?: string }
}

/** An empty editable receipt for the manual-entry fallback (D9 failed path). */
function blankParsed(currency: string): ParsedReceipt {
  return {
    merchant: null,
    datetime: null,
    currency,
    items: [{ id: 'i1', name: '', qty: 1, unitPriceMinor: 0, lineTotalMinor: 0 }],
    taxMinor: 0,
    tipMinor: 0,
    feesMinor: 0,
    discountMinor: 0,
    subtotalMinor: 0,
    printedTotalMinor: 0,
    confidence: 'low',
  }
}

export interface ReceiptScanController {
  phase: ScanPhase
  manual: boolean
  busy: boolean
  saving: boolean
  error: string | null

  imageUrl: string | null
  localPreview: string | null
  parsed: ParsedReceipt | null
  editorOpen: boolean

  payerId: string
  policy: UnclaimedPolicy
  claims: ClaimsMap

  // derived
  itemsSubtotalMinor: number
  overheadMinor: number
  grandTotalMinor: number
  diffMinor: number
  reconcileOk: boolean
  needsReview: boolean
  claimedMinor: number
  unclaimedMinor: number
  unclaimedCount: number
  canProceedToAssign: boolean
  canSave: boolean

  // actions
  start: (file: File) => Promise<void>
  retake: () => void
  setEditorOpen: (v: boolean) => void
  setMerchant: (v: string) => void
  setCurrency: (v: string) => void
  setItemName: (id: string, v: string) => void
  setItemTotal: (id: string, v: string) => void
  addItem: () => void
  removeItem: (id: string) => void
  setOverhead: (kind: 'tax' | 'tip' | 'fees' | 'discount', v: string) => void
  setPrintedTotal: (v: string) => void
  setPayer: (id: string) => void
  setPolicy: (p: UnclaimedPolicy) => void
  toggleClaim: (itemId: string, memberId: string) => void
  goAssign: () => void
  goReview: () => void
  save: () => Promise<void>
}

export function useReceiptScan({
  groupId,
  userId,
  members,
  primaryCurrency,
  upload,
}: UseReceiptScanArgs): ReceiptScanController {
  const navigate = useNavigate()

  const [phase, setPhase] = useState<ScanPhase>('capture')
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const [payerId, setPayerId] = useState<string>('')
  const [policy, setPolicy] = useState<UnclaimedPolicy>('even')
  const [claims, setClaims] = useState<ClaimsMap>({})

  const itemSeq = useRef(2)
  const previewRef = useRef<string | null>(null)

  // Default the payer to the current user once members resolve.
  const resolvedPayer = useMemo(() => {
    if (payerId && members.some((m) => m.id === payerId)) return payerId
    if (userId && members.some((m) => m.id === userId)) return userId
    return members[0]?.id ?? ''
  }, [payerId, members, userId])

  /* --------------------------------------------------------------- derived */

  const itemsSubtotalMinor = useMemo(
    () => (parsed ? parsed.items.reduce((a, it) => a + (it.lineTotalMinor || 0), 0) : 0),
    [parsed],
  )

  const overheadMinor = useMemo(
    () =>
      parsed
        ? parsed.taxMinor + parsed.tipMinor + parsed.feesMinor - parsed.discountMinor
        : 0,
    [parsed],
  )

  const grandTotalMinor = itemsSubtotalMinor + overheadMinor

  const recon = useMemo(() => {
    if (!parsed) return { ok: true, diffMinor: 0, requiresReview: false }
    return reconcileScan({
      items: parsed.items.map((it) => ({ lineTotalMinor: it.lineTotalMinor })),
      taxMinor: parsed.taxMinor,
      tipMinor: parsed.tipMinor,
      feesMinor: parsed.feesMinor,
      discountMinor: parsed.discountMinor,
      printedTotalMinor: parsed.printedTotalMinor,
      confidence: parsed.confidence,
    })
  }, [parsed])

  // In manual mode there is no printed total to reconcile against.
  const diffMinor = manual ? 0 : recon.diffMinor
  const reconcileOk = manual ? true : Math.abs(recon.diffMinor) <= 2
  const needsReview = manual ? false : recon.requiresReview

  const claimedMinor = useMemo(() => {
    if (!parsed) return 0
    return parsed.items.reduce(
      (a, it) => a + ((claims[it.id]?.length ?? 0) > 0 ? it.lineTotalMinor || 0 : 0),
      0,
    )
  }, [parsed, claims])

  const unclaimedItemIds = useMemo(() => {
    if (!parsed) return [] as string[]
    return parsed.items.filter((it) => (claims[it.id]?.length ?? 0) === 0).map((it) => it.id)
  }, [parsed, claims])

  const unclaimedMinor = Math.max(0, itemsSubtotalMinor - claimedMinor)
  const unclaimedCount = unclaimedItemIds.length

  const canProceedToAssign = Boolean(
    parsed && itemsSubtotalMinor > 0 && (manual ? grandTotalMinor > 0 : reconcileOk),
  )
  const canSave = Boolean(
    parsed &&
      grandTotalMinor > 0 &&
      resolvedPayer &&
      (unclaimedMinor === 0 || policy !== 'manual'),
  )

  /* ----------------------------------------------------------- mutations */

  const patchParsed = useCallback((fn: (p: ParsedReceipt) => ParsedReceipt) => {
    setParsed((prev) => (prev ? fn(prev) : prev))
  }, [])

  const setMerchant = useCallback(
    (v: string) => patchParsed((p) => ({ ...p, merchant: v })),
    [patchParsed],
  )
  const setCurrency = useCallback(
    (v: string) => patchParsed((p) => ({ ...p, currency: v.toUpperCase() })),
    [patchParsed],
  )
  const setItemName = useCallback(
    (id: string, v: string) =>
      patchParsed((p) => ({
        ...p,
        items: p.items.map((it) => (it.id === id ? { ...it, name: v } : it)),
      })),
    [patchParsed],
  )
  const setItemTotal = useCallback(
    (id: string, v: string) =>
      patchParsed((p) => ({
        ...p,
        items: p.items.map((it) =>
          it.id === id ? { ...it, lineTotalMinor: inputToMinor(v, p.currency) } : it,
        ),
      })),
    [patchParsed],
  )
  const addItem = useCallback(() => {
    const id = `i${itemSeq.current++}`
    patchParsed((p) => ({
      ...p,
      items: [...p.items, { id, name: '', qty: 1, unitPriceMinor: 0, lineTotalMinor: 0 }],
    }))
  }, [patchParsed])
  const removeItem = useCallback(
    (id: string) => {
      patchParsed((p) => ({ ...p, items: p.items.filter((it) => it.id !== id) }))
      setClaims((c) => {
        const next = { ...c }
        delete next[id]
        return next
      })
    },
    [patchParsed],
  )
  const setOverhead = useCallback(
    (kind: 'tax' | 'tip' | 'fees' | 'discount', v: string) =>
      patchParsed((p) => {
        const minor = inputToMinor(v, p.currency)
        const key = (
          { tax: 'taxMinor', tip: 'tipMinor', fees: 'feesMinor', discount: 'discountMinor' } as const
        )[kind]
        return { ...p, [key]: minor }
      }),
    [patchParsed],
  )
  const setPrintedTotal = useCallback(
    (v: string) => patchParsed((p) => ({ ...p, printedTotalMinor: inputToMinor(v, p.currency) })),
    [patchParsed],
  )

  const toggleClaim = useCallback((itemId: string, memberId: string) => {
    setClaims((c) => {
      const cur = c[itemId] ?? []
      const next = cur.includes(memberId)
        ? cur.filter((m) => m !== memberId)
        : [...cur, memberId]
      return { ...c, [itemId]: next }
    })
  }, [])

  /* ------------------------------------------------------------- flow */

  const revokePreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
  }, [])

  const start = useCallback(
    async (file: File) => {
      setError(null)
      setManual(false)
      setBusy(true)
      revokePreview()
      const preview = URL.createObjectURL(file)
      previewRef.current = preview
      setLocalPreview(preview)
      setPhase('scanning')

      // 1. Upload the image to R2 at scope:'app' (public URL, usable as vision input).
      const safeName = file.name?.replace(/[^\w.-]/g, '_') || 'receipt.jpg'
      const up = await upload(file, `receipts/${groupId}/${Date.now()}-${safeName}`)
      if (!up.success || !up.url) {
        setBusy(false)
        setError(up.error ?? 'Could not upload the photo. Check your connection and try again.')
        // Keep the image; offer manual entry rather than a dead end.
        setManual(true)
        setParsed(blankParsed(primaryCurrency))
        setEditorOpen(true)
        setPhase('failed')
        return
      }
      setImageUrl(up.url)

      // 2. Vision parse via the scanReceipt action (claude-sonnet-4-6, URL then base64).
      const res = await callAction<ScanReceiptResult>('scanReceipt', {
        groupId,
        imageUrl: up.url,
        r2Key: up.key,
      })
      setBusy(false)

      if (!res.success || !res.data?.parsed) {
        // Couldn't read it -- keep the image, drop into manual itemized entry (D9).
        setError(res.error ?? null)
        setManual(true)
        setReceiptId(res.data?.receiptId ?? null)
        setParsed(blankParsed(primaryCurrency))
        setEditorOpen(true)
        setPhase('failed')
        return
      }

      const p = res.data.parsed
      itemSeq.current = p.items.length + 1
      setReceiptId(res.data.receiptId)
      setParsed(p)
      setClaims({})
      // Low confidence or a printed-total mismatch forces the review path (D9, §2.11).
      const r = reconcileScan({
        items: p.items.map((it) => ({ lineTotalMinor: it.lineTotalMinor })),
        taxMinor: p.taxMinor,
        tipMinor: p.tipMinor,
        feesMinor: p.feesMinor,
        discountMinor: p.discountMinor,
        printedTotalMinor: p.printedTotalMinor,
        confidence: p.confidence,
      })
      setEditorOpen(r.requiresReview)
      setPhase('review')
    },
    [groupId, primaryCurrency, revokePreview, upload],
  )

  const retake = useCallback(() => {
    revokePreview()
    setLocalPreview(null)
    setImageUrl(null)
    setReceiptId(null)
    setParsed(null)
    setClaims({})
    setManual(false)
    setError(null)
    setEditorOpen(false)
    setPhase('capture')
  }, [revokePreview])

  const goAssign = useCallback(() => {
    setError(null)
    setPhase('assign')
  }, [])
  const goReview = useCallback(() => {
    setError(null)
    setPhase(manual ? 'failed' : 'review')
  }, [manual])

  const save = useCallback(async () => {
    if (!parsed || !canSave || saving) return
    setSaving(true)
    setError(null)

    const overheads: NonNullable<SplitConfig['overheads']> = []
    if (parsed.taxMinor > 0)
      overheads.push({ kind: 'tax', label: 'Tax', amountMinor: parsed.taxMinor, mode: 'proportional' })
    if (parsed.tipMinor > 0)
      overheads.push({ kind: 'tip', label: 'Tip', amountMinor: parsed.tipMinor, mode: 'proportional', base: 'preTax' })
    if (parsed.feesMinor > 0)
      overheads.push({ kind: 'fee', label: 'Fees', amountMinor: parsed.feesMinor, mode: 'proportional' })
    if (parsed.discountMinor > 0)
      overheads.push({ kind: 'discount', label: 'Discount', amountMinor: parsed.discountMinor, mode: 'proportional' })

    const participants = members.map((m) => m.id)
    const splitConfig: SplitConfig = {
      scope: 'itemized',
      baseType: 'equal',
      participants,
      payerIsParticipant: participants.includes(resolvedPayer),
      subtotalMinor: itemsSubtotalMinor,
      overheads,
      unclaimedPolicy: policy,
      ...(receiptId ? { receiptId } : {}),
    }

    const draft = {
      description: parsed.merchant?.trim() || 'Receipt',
      category: 'dining',
      currency: parsed.currency,
      amountMinor: grandTotalMinor,
      paidBy: { [resolvedPayer]: grandTotalMinor },
      splitConfig,
      expenseAtMs: parsed.datetime ? Date.parse(parsed.datetime) || Date.now() : Date.now(),
      ...(receiptId ? { receiptId } : {}),
      receipt: {
        items: parsed.items.map((it) => ({ id: it.id, lineTotalMinor: it.lineTotalMinor })),
        claims,
      },
    }

    const res = await callAction<{ expenseId: string }>('addExpense', { groupId, draft })
    if (res.success) {
      revokePreview()
      navigate(`/app/g/${groupId}`)
    } else {
      setSaving(false)
      setError(res.error ?? 'Could not add the expense. Please try again.')
    }
  }, [
    parsed,
    canSave,
    saving,
    members,
    resolvedPayer,
    itemsSubtotalMinor,
    grandTotalMinor,
    policy,
    receiptId,
    claims,
    groupId,
    navigate,
    revokePreview,
  ])

  return {
    phase,
    manual,
    busy,
    saving,
    error,
    imageUrl,
    localPreview,
    parsed,
    editorOpen,
    payerId: resolvedPayer,
    policy,
    claims,
    itemsSubtotalMinor,
    overheadMinor,
    grandTotalMinor,
    diffMinor,
    reconcileOk,
    needsReview,
    claimedMinor,
    unclaimedMinor,
    unclaimedCount,
    canProceedToAssign,
    canSave,
    start,
    retake,
    setEditorOpen,
    setMerchant,
    setCurrency,
    setItemName,
    setItemTotal,
    addItem,
    removeItem,
    setOverhead,
    setPrintedTotal,
    setPayer: setPayerId,
    setPolicy,
    toggleClaim,
    goAssign,
    goReview,
    save,
  }
}
