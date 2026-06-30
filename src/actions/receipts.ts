/**
 * Receipt-scan action (CONTRACT §1.9, §3.6, §2.11, D9). Uploads happen client-side
 * to R2 (`scope:'app'`, via `/api/files/upload`); this action takes the resulting
 * public `imageUrl`, runs Anthropic vision to extract the itemized JSON, reconciles
 * it against the printed total, and writes the `receipts` row for human review.
 *
 * Model is pinned to `claude-sonnet-4-6` -- the catalog default 404s (sdk-issues).
 * Idempotent: re-scanning a receipt that already parsed returns the stored result
 * instead of re-billing the owner. Parse output is ALWAYS shown for human edit and
 * never trusted blindly (D9) -- low confidence / total mismatch forces review.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { reconcileScan, type Cents } from '../lib/split'
import type { Confidence, ParsedReceipt, ParsedReceiptItem, ReceiptData, ReceiptStatus } from '../lib/data/types'
import { fail, isMember, loadGroup, loadRecord, logActivity, ok } from './helpers'

const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT =
  'You are a precise receipt-parsing engine. Extract the receipt into STRICT JSON only. ' +
  'No prose, no markdown fences. All money values are INTEGER minor units of the receipt currency ' +
  '(cents for 2-decimal currencies, whole units for 0-decimal like JPY). Each line item total ' +
  'already INCLUDES its modifiers; never emit a modifier as its own line. If a field is unknown use ' +
  'null (or 0 for a numeric overhead that is absent). Set confidence to "low" if the image is blurry, ' +
  'cropped, or not a receipt.'

const USER_PROMPT =
  'Parse this receipt into exactly this JSON shape:\n' +
  '{"merchant":string|null,"datetime":ISO8601|null,"currency":ISO4217,' +
  '"items":[{"id":"i1","name":string,"qty":number,"unitPriceMinor":int,"lineTotalMinor":int,' +
  '"modifiers":[{"name":string,"amountMinor":int}]}],' +
  '"taxMinor":int,"tipMinor":int,"feesMinor":int,"discountMinor":int,' +
  '"subtotalMinor":int,"printedTotalMinor":int,"confidence":"high"|"medium"|"low"}\n' +
  'Number the items i1, i2, i3... Return ONLY the JSON object.'

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>
  stop_reason?: string
}

/** Pull the first text block out of an Anthropic Messages response. */
function extractText(resp: AnthropicResponse): string {
  return (resp.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
}

/** Tolerant JSON extraction (strips code fences / surrounding prose). */
function parseJson(text: string): unknown | null {
  if (!text) return null
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0
}

/** Coerce the raw model JSON into a well-formed ParsedReceipt (ids guaranteed). */
function normalizeParsed(raw: unknown, fallbackCurrency: string): ParsedReceipt | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const rawItems = Array.isArray(r.items) ? r.items : []
  const items: ParsedReceiptItem[] = rawItems.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>
    const mods = Array.isArray(o.modifiers)
      ? o.modifiers.map((m) => ({ name: String((m as Record<string, unknown>)?.name ?? ''), amountMinor: num((m as Record<string, unknown>)?.amountMinor) }))
      : undefined
    return {
      id: typeof o.id === 'string' && o.id ? o.id : `i${i + 1}`,
      name: String(o.name ?? `Item ${i + 1}`),
      qty: num(o.qty) || 1,
      unitPriceMinor: num(o.unitPriceMinor),
      lineTotalMinor: num(o.lineTotalMinor),
      ...(mods && mods.length ? { modifiers: mods } : {}),
    }
  })
  const confidence: Confidence = r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low' ? r.confidence : 'medium'
  return {
    merchant: typeof r.merchant === 'string' ? r.merchant : null,
    datetime: typeof r.datetime === 'string' ? r.datetime : null,
    currency: typeof r.currency === 'string' && r.currency ? r.currency : fallbackCurrency,
    items,
    taxMinor: num(r.taxMinor),
    tipMinor: num(r.tipMinor),
    feesMinor: num(r.feesMinor),
    discountMinor: num(r.discountMinor),
    subtotalMinor: num(r.subtotalMinor),
    printedTotalMinor: num(r.printedTotalMinor),
    confidence,
  }
}

/** Chunked base64 of an ArrayBuffer (avoids stack overflow on large images). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/**
 * Validate that a receipt `imageUrl` is one of OUR OWN uploaded files over https,
 * before it is fed to the vision call (URL source) or fetched server-side (base64
 * fallback). Closes the SSRF + owner-billed-LLM-abuse vector (an attacker passing
 * an arbitrary or internal URL) and, together with the receipts write-lock, the
 * stored-XSS source (a `javascript:` imageUrl). The legitimate upload flow always
 * yields `<app-origin>/api/files/<key>` (worker.ts rewrites the file URL to the
 * app origin), so PROD accepts exactly that shape: https + the canonical
 * `<APP_NAME>.app.space` host + an `/api/files/` path.
 *
 * The relaxation for a localhost fixture is gated on `ALLOW_DEBUG_ROUTES` — the
 * SDK's dev/test signal (the CLI sets it on `deepspace dev`/`test`, never on a
 * production secret) — NOT on the URL's own host, so an attacker cannot reach the
 * loose branch in production by passing a `localhost` URL.
 *
 * NOTE: the prod host allowlist is the canonical `<APP_NAME>.app.space`; a custom
 * domain would need its host added here.
 */
function validateReceiptImageUrl(rawUrl: string, env: Env): string | null {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return 'not a valid URL'
  }
  if (u.username || u.password) return 'must not contain credentials'

  const devMode = env.ALLOW_DEBUG_ROUTES === 'true'
  const isLocalHost = u.hostname === 'localhost' || u.hostname === '127.0.0.1'

  // Scheme: https always; http only for a localhost fixture in dev/test.
  if (u.protocol !== 'https:' && !(devMode && isLocalHost && u.protocol === 'http:')) {
    return 'must be served over https'
  }
  // Dev/test: a fixture served from the local dev server (any path) is fine.
  if (devMode && isLocalHost) return null

  // Production: our own canonical host + the uploaded-files path only.
  if (u.hostname !== `${env.APP_NAME}.app.space`) return 'must be hosted on this app'
  if (!u.pathname.startsWith('/api/files/')) return 'must be an uploaded receipt file'
  return null
}

type Tools = Parameters<ActionHandler<Env>>[0]['tools']

/** One vision attempt with a given image content block. */
async function callVision(tools: Tools, imageBlock: unknown): Promise<{ resp: AnthropicResponse } | { error: string }> {
  const res = await tools.integration<AnthropicResponse>('anthropic/chat-completion', {
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: USER_PROMPT }, imageBlock] }],
  })
  if (!res.success) return { error: res.error }
  return { resp: res.data }
}

/** Run vision: URL image source first, base64 fallback if that errors. */
async function runVision(tools: Tools, imageUrl: string): Promise<{ text: string } | { error: string }> {
  const urlAttempt = await callVision(tools, { type: 'image', source: { type: 'url', url: imageUrl } })
  if ('resp' in urlAttempt) {
    const text = extractText(urlAttempt.resp)
    if (text) return { text }
  }
  // Fallback: fetch the bytes and send base64 (older Anthropic versions / proxy).
  try {
    const img = await fetch(imageUrl)
    if (img.ok) {
      const mediaType = img.headers.get('content-type') ?? 'image/jpeg'
      const b64 = toBase64(await img.arrayBuffer())
      const b64Attempt = await callVision(tools, { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } })
      if ('resp' in b64Attempt) {
        const text = extractText(b64Attempt.resp)
        if (text) return { text }
      } else {
        return { error: b64Attempt.error }
      }
    }
  } catch (e) {
    return { error: `vision fetch failed: ${(e as Error).message}` }
  }
  return { error: 'error' in urlAttempt ? urlAttempt.error : 'empty vision response' }
}

export const scanReceipt: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const groupId = params.groupId as string
  let receiptId = params.receiptId as string | undefined
  let imageUrl = params.imageUrl as string | undefined
  let r2Key = params.r2Key as string | undefined
  let resolvedGroupId = groupId

  // Resume an existing receipt, or create a fresh one to scan.
  if (receiptId) {
    const existing = await loadRecord<ReceiptData>(tools, 'receipts', receiptId)
    if (!existing.ok) return fail(existing.error)
    const e = existing.record.data
    resolvedGroupId = e.groupId
    imageUrl = e.imageUrl
    r2Key = e.r2Key
    // Idempotent: a finished scan returns its stored result (no re-bill).
    if (e.parsed && (e.status === 'parsed' || e.status === 'low_confidence' || e.status === 'confirmed')) {
      return ok({ receiptId, parsed: e.parsed, status: e.status, reused: true })
    }
  }

  if (!resolvedGroupId) return fail('groupId is required')
  if (!imageUrl) return fail('imageUrl is required')

  // SSRF / XSS guard: only our own uploaded files over https reach the vision call
  // or the server-side fetch. Runs before the receipt row is created and before any
  // outbound request (covers both new scans and resumes).
  const urlError = validateReceiptImageUrl(imageUrl, env)
  if (urlError) return fail(`Invalid receipt image URL: ${urlError}`)

  const g = await loadGroup(tools, resolvedGroupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')
  const memberIds = g.record.data.memberIds

  if (!receiptId) {
    if (!r2Key) return fail('r2Key is required for a new scan')
    const created = await tools.create('receipts', {
      groupId: resolvedGroupId,
      memberIds,
      r2Key,
      imageUrl,
      status: 'parsing' as ReceiptStatus,
      parsed: null,
      claims: {},
      model: MODEL,
    })
    if (!created.success) return created
    receiptId = created.data.recordId
  }

  const vision = await runVision(tools, imageUrl)
  if ('error' in vision) {
    await tools.update('receipts', receiptId, { status: 'failed', model: MODEL })
    return fail(`Receipt scan failed: ${vision.error}`)
  }

  const parsed = normalizeParsed(parseJson(vision.text), g.record.data.primaryCurrency)
  if (!parsed || (parsed.items.length === 0 && parsed.printedTotalMinor === 0)) {
    await tools.update('receipts', receiptId, { status: 'failed', model: MODEL })
    return fail('Could not read this receipt -- add items manually')
  }

  const reconcile = reconcileScan({
    items: parsed.items.map((it) => ({ lineTotalMinor: it.lineTotalMinor as Cents })),
    taxMinor: parsed.taxMinor,
    tipMinor: parsed.tipMinor,
    feesMinor: parsed.feesMinor,
    discountMinor: parsed.discountMinor,
    printedTotalMinor: parsed.printedTotalMinor,
    confidence: parsed.confidence,
  })

  const status: ReceiptStatus =
    parsed.confidence === 'low' || reconcile.requiresReview ? 'low_confidence' : 'parsed'

  await tools.update('receipts', receiptId, {
    status,
    parsed,
    model: MODEL,
    confidence: parsed.confidence,
  })

  await logActivity(tools, {
    groupId: resolvedGroupId,
    memberIds,
    type: 'receipt.scanned',
    actorId: userId,
    targetId: receiptId,
    payload: { summary: `Scanned a receipt${parsed.merchant ? ` from ${parsed.merchant}` : ''}` },
  })

  return ok({ receiptId, parsed, status, reconcile })
}

export const receiptActions: Record<string, ActionHandler<Env>> = {
  scanReceipt,
}
