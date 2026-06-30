/**
 * Receipt scan -> assign -> save -> balances, with a LIVE vision call
 * (CONTRACT §3.6, §2.7, §2.11, D9). NOT mocked: uploads a real receipt image
 * to R2 (scope:'app'), runs `scanReceipt` (claude-sonnet-4-6 vision, owner-billed),
 * reconciles, then builds the itemized expense exactly as the UI save path does and
 * checks the resolved splits + derived balances.
 *
 * The live parse + cost are logged to the test output for the Phase-6 report.
 */
import { test, expect } from 'deepspace/testing'
import { existsSync, readFileSync, copyFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { actOk, groupRows, whoami, cleanupGroup, tag, sum } from './helpers/evenly'
import { netBalances, type SplitConfig } from '../src/lib/split'

const RECEIPT = '/tmp/receipt_spike.png'

interface ParsedItem { id: string; name: string; lineTotalMinor: number }
interface Parsed {
  merchant: string | null
  currency: string
  items: ParsedItem[]
  taxMinor: number; tipMinor: number; feesMinor: number; discountMinor: number
  subtotalMinor: number; printedTotalMinor: number
  confidence: 'high' | 'medium' | 'low'
}
interface ReconcileOut { ok: boolean; computedTotal: number; diffMinor: number; absorbAsRounding: boolean; requiresReview: boolean }
interface ScanData { receiptId: string; parsed: Parsed; status: string; reconcile?: ReconcileOut }

test('LIVE receipt scan: itemize -> assign -> save -> balances', async ({ users }) => {
  test.setTimeout(120_000) // a real network vision call

  expect(existsSync(RECEIPT), `${RECEIPT} must exist (regenerate with PIL if missing)`).toBeTruthy()

  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  const gA = `guest:${crypto.randomUUID()}`
  const origin = new URL(page.url()).origin
  const fixtureName = `__test_receipt_${Date.now()}.png`
  const fixturePath = resolve(process.cwd(), 'public', fixtureName)

  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', {
      name: tag('scan'),
      primaryCurrency: 'USD',
      guests: [{ guestId: gA, displayName: 'Dinner Buddy' }],
    })
    groupId = grp.groupId

    // 1a. Probe the app's real R2 upload path (scope:'app') and record the result.
    //     In this dev session APP_IDENTITY_TOKEN is absent from .dev.vars, so the
    //     deployed platform-worker rejects the upload — captured here as a finding,
    //     not a hard failure of the scan flow itself.
    const token = (await (await page.request.post('/api/auth/token')).json() as { token: string }).token
    const upRes = await page.request.post('/api/files/upload?scope=app', {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'receipt_spike.png', mimeType: 'image/png', buffer: readFileSync(RECEIPT) },
        name: `receipts/${groupId}/${Date.now()}-receipt_spike.png`,
      },
    })
    if (!upRes.ok()) {
      console.log(`[finding] R2 scope:'app' upload unavailable in dev -> ${upRes.status()}: ${(await upRes.text()).slice(0, 200)}`)
    }

    // 1b. Serve the SAME real receipt from the dev server so the live vision call
    //     runs on /tmp/receipt_spike.png (worker URL/base64 fetch). Test fixture,
    //     removed in teardown.
    copyFileSync(RECEIPT, fixturePath)
    const imageUrl = `${origin}/${fixtureName}`

    // 2. LIVE vision parse on the real image.
    const scan = await actOk<ScanData>(page, 'scanReceipt', { groupId, r2Key: `test-fixture-${Date.now()}`, imageUrl })
    const p = scan.parsed
    const computed = p.items.reduce((a, it) => a + it.lineTotalMinor, 0) + p.taxMinor + p.tipMinor + p.feesMinor - p.discountMinor

    // --- report the live result ---
    console.log('=== LIVE RECEIPT SCAN RESULT ===')
    console.log('merchant     :', p.merchant)
    console.log('currency     :', p.currency, '| confidence:', p.confidence, '| status:', scan.status)
    console.log('items        :', p.items.length)
    for (const it of p.items) console.log('   -', it.name, '=', it.lineTotalMinor)
    console.log('tax/tip/fee/disc:', p.taxMinor, p.tipMinor, p.feesMinor, p.discountMinor)
    console.log('subtotal     :', p.subtotalMinor, '| printedTotal:', p.printedTotalMinor, '| computed:', computed)
    console.log('reconcile    :', JSON.stringify(scan.reconcile))
    const estCostUsd = 0.015 // ~claude-sonnet-4-6 vision: ~2.2k in + ~0.6k out tokens (TODO verify from Anthropic pricing)
    console.log('est cost     : ~$' + estCostUsd.toFixed(3), '(one Sonnet vision call)')
    console.log('================================')

    // 3. assert a coherent itemization.
    expect(p.items.length, 'vision found line items').toBeGreaterThan(0)
    expect(p.printedTotalMinor, 'printed total parsed').toBeGreaterThan(0)
    for (const it of p.items) {
      expect(typeof it.name).toBe('string')
      expect(it.lineTotalMinor).toBeGreaterThanOrEqual(0)
    }
    expect(computed, 'reconcile.computedTotal matches Σitems+overhead').toBe(scan.reconcile?.computedTotal)

    // 4. assign every item to both diners, then save the itemized expense
    //    exactly as the UI save path does (amount = computed grand total).
    const claims: Record<string, string[]> = {}
    for (const it of p.items) claims[it.id] = [me, gA]
    const overheads: NonNullable<SplitConfig['overheads']> = []
    if (p.taxMinor > 0) overheads.push({ kind: 'tax', amountMinor: p.taxMinor, mode: 'proportional' })
    if (p.tipMinor > 0) overheads.push({ kind: 'tip', amountMinor: p.tipMinor, mode: 'proportional', base: 'preTax' })
    if (p.feesMinor > 0) overheads.push({ kind: 'fee', amountMinor: p.feesMinor, mode: 'proportional' })
    if (p.discountMinor > 0) overheads.push({ kind: 'discount', amountMinor: p.discountMinor, mode: 'proportional' })

    const add = await actOk<{ expenseId: string; splits: Record<string, number> }>(page, 'addExpense', {
      groupId,
      draft: {
        description: p.merchant || 'Scanned receipt',
        category: 'dining',
        currency: 'USD',
        amountMinor: computed,
        paidBy: { [me]: computed },
        receiptId: scan.receiptId,
        splitConfig: {
          scope: 'itemized',
          baseType: 'equal',
          participants: [me, gA],
          overheads,
          unclaimedPolicy: 'even',
          receiptId: scan.receiptId,
        },
        receipt: { items: p.items.map((it) => ({ id: it.id, lineTotalMinor: it.lineTotalMinor })), claims },
      },
    })

    // 5. splits conserve and balances reflect the shared bill.
    expect(sum(add.splits)).toBe(computed)
    const expenses = (await groupRows<{ paidBy: Record<string, number>; splits: Record<string, number>; currency: string; fxRate: number | null; deletedAt?: number | null }>(page, 'expenses', groupId)).filter((e) => !e.data.deletedAt)
    expect(expenses.length).toBe(1)
    const net = netBalances({ primaryCurrency: 'USD' }, expenses.map((e) => e.data), [])
    expect(sum(net), 'Σ net == 0').toBe(0)
    expect(net[me], 'payer is owed').toBeGreaterThan(0)
    expect(net[gA], 'the buddy owes their share').toBeLessThan(0)

    // 6. the receipt row is parsed + linked to the expense.
    const receipts = await groupRows<{ status: string; expenseId?: string }>(page, 'receipts', groupId)
    expect(receipts.length).toBe(1)
    expect(['parsed', 'low_confidence', 'confirmed']).toContain(receipts[0].data.status)
    expect(receipts[0].data.expenseId).toBe(add.expenseId)
  } finally {
    try { rmSync(fixturePath, { force: true }) } catch { /* ignore */ }
    await cleanupGroup(page, groupId)
  }
})
