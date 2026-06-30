/**
 * Splitwise CSV import — pure parsing + ledger reconstruction (CONTRACT §3.13, §4, §7).
 *
 * This module is intentionally free of React / DOM so it is the SINGLE source of
 * truth shared by BOTH the import wizard (client preview) AND the `importExpenses`
 * server action (worker). Keeping the parse + reconstruct + dedupe-fingerprint in
 * one place means the preview the user confirms is exactly what the server writes.
 *
 * Splitwise's "export as spreadsheet" emits, per group:
 *   Date,Description,Category,Cost,Currency,<Person 1>,<Person 2>,...
 * Each person column holds that person's NET on the line (`paid − owed`); the
 * payer shows a positive figure, owers negative, and the columns sum to 0. Only
 * the net is exported — the original per-person shares are not — so any
 * balance-preserving reconstruction of (paidBy, owed) is faithful. We pick the
 * natural one: owers paid nothing and owe their |net|; payers cover the rest in
 * proportion to their net. This reproduces every balance exactly and collapses to
 * the obvious answer for the common single-payer case.
 */

import { largestRemainder, scale, type Shares, type SplitConfig } from '../../lib/split'
import type { ParseResult, ParsedRow, Reconstructed, RowError } from './types'

/* --------------------------------------------------------------- CSV tokenizer */

/**
 * Parse CSV text into rows of string cells. Handles quoted fields, embedded
 * commas / newlines, and `""` escaped quotes — Splitwise quotes any description
 * or category containing a comma (e.g. `"Food and drink"`).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  // Normalize a leading BOM some exporters prepend.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      // Swallow CRLF as one break; only commit a row that has content.
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  // Flush the trailing cell / row (no final newline).
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    if (row.some((c) => c.trim() !== '')) rows.push(row)
  }
  return rows
}

/* ------------------------------------------------------------------ date / text */

/**
 * A `YYYY-MM-DD` (Splitwise's format) → ms at LOCAL noon. Parsing date-only as
 * local (not `new Date('2024-01-15')`, which is UTC midnight and shifts a day in
 * negative-offset zones) keeps the stored/displayed date faithful (CONTRACT §7).
 * Falls back to `Date.parse` for any other shape, then clamps to local noon.
 */
export function csvDateToLocalMs(raw: string): number | null {
  const str = raw.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
    }
  }
  const t = Date.parse(str)
  if (Number.isFinite(t)) {
    const d = new Date(t)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).getTime()
  }
  return null
}

/**
 * A stable day key for dedupe. Uses UTC getters so the client (any timezone) and
 * the worker (UTC) derive the SAME key from a local-noon ms — local noon lands on
 * the intended calendar day under UTC for every normal offset (±12h).
 */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Trim + lowercase + collapse internal whitespace (dedupe-stable description). */
export function normalizeDescription(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Parse a money cell ("1,234.56", "$30.00", "-20") → integer minor units. */
function parseMoneyMinor(raw: string, currency: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * scale(currency))
}

/* ----------------------------------------------------------------- categories */

/** Map a Splitwise category label to the Evenly catalog id (§1.2); else `other`. */
export function mapCategory(raw: string): string {
  const c = raw.trim().toLowerCase()
  if (!c) return 'other'
  const has = (...keys: string[]) => keys.some((k) => c.includes(k))
  if (has('grocer')) return 'groceries'
  if (has('dining', 'restaurant', 'food and drink', 'dining out')) return 'dining'
  if (has('food', 'drink', 'liquor', 'coffee')) return 'food'
  if (has('rent', 'mortgage', 'household', 'furniture', 'home', 'maintenance')) return 'lodging'
  if (has('gas', 'fuel', 'petrol')) return 'fuel'
  if (has('car', 'taxi', 'bus', 'train', 'transport', 'parking', 'flight', 'plane', 'bicycle')) return 'transport'
  if (has('electric', 'water', 'utilit', 'internet', 'tv', 'trash', 'heat', 'phone', 'cleaning')) return 'utilities'
  if (has('entertain', 'movie', 'game', 'music', 'sport', 'ticket')) return 'entertainment'
  if (has('shopping', 'clothing', 'electronics', 'gift')) return 'shopping'
  if (has('medical', 'health', 'doctor', 'pharmac', 'insurance')) return 'health'
  if (has('fee', 'charge', 'tax', 'service')) return 'fees'
  return 'other'
}

/* ----------------------------------------------------------- header detection */

const KNOWN_HEADERS = new Set(['date', 'description', 'category', 'cost', 'currency'])

interface HeaderLayout {
  date: number
  description: number
  category: number
  cost: number
  currency: number
  people: { name: string; index: number }[]
}

function detectHeader(header: string[]): HeaderLayout | null {
  const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name)
  const date = idx('date')
  const cost = idx('cost')
  const currency = idx('currency')
  // A Splitwise export always carries Date + Cost + Currency.
  if (date < 0 || cost < 0) return null
  const people: { name: string; index: number }[] = []
  header.forEach((h, i) => {
    const name = h.trim()
    if (!name) return
    if (KNOWN_HEADERS.has(name.toLowerCase())) return
    people.push({ name, index: i })
  })
  return { date, description: idx('description'), category: idx('category'), cost, currency, people }
}

/* ------------------------------------------------------------- main parse pass */

/** Parse a Splitwise CSV export into rows + people + per-row errors (§3.13). */
export function parseSplitwiseCsv(text: string): ParseResult {
  const empty: ParseResult = { people: [], rows: [], errors: [], currencies: [], recognized: false }
  const table = parseCsv(text)
  if (table.length === 0) return empty

  const layout = detectHeader(table[0])
  if (!layout) return empty

  const people = layout.people.map((p) => p.name)
  const rows: ParsedRow[] = []
  const errors: RowError[] = []
  const currencySet = new Set<string>()

  for (let r = 1; r < table.length; r++) {
    const cells = table[r]
    const line = r + 1
    const cell = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : '')

    const dateRaw = cell(layout.date)
    const description = cell(layout.description) || 'Imported expense'
    const costRaw = cell(layout.cost)

    // Splitwise appends a "Total balance" footer row; the label lands in the date
    // or description column depending on the export. Skip it quietly either way.
    if (/total balance/i.test(dateRaw) || /total balance/i.test(description)) continue
    if (!dateRaw && !costRaw) continue

    const currency = (cell(layout.currency) || 'USD').toUpperCase()
    const dateMs = csvDateToLocalMs(dateRaw)
    if (dateMs == null) {
      errors.push({ line, raw: cells.join(','), reason: `Unreadable date "${dateRaw}"` })
      continue
    }
    const amountMinor = parseMoneyMinor(costRaw, currency)
    if (amountMinor == null) {
      errors.push({ line, raw: cells.join(','), reason: `Unreadable cost "${costRaw}"` })
      continue
    }

    // Per-person nets.
    const nets: Record<string, number> = {}
    let netSum = 0
    let badCell = false
    for (const p of layout.people) {
      const v = parseMoneyMinor(cell(p.index), currency)
      if (v == null) {
        badCell = true
        break
      }
      nets[p.name] = v
      netSum += v
    }
    if (badCell) {
      errors.push({ line, raw: cells.join(','), reason: 'Unreadable per-person amount' })
      continue
    }

    const category = mapCategory(cell(layout.category))
    const isPayment = /payment/i.test(cell(layout.category)) || /^payment$/i.test(description)

    if (isPayment) {
      // Settle-ups are not expenses; carry them so the preview can report them.
      rows.push({ line, kind: 'payment', dateMs, description, category, currency, amountMinor, nets })
      continue
    }

    if (amountMinor <= 0) {
      errors.push({ line, raw: cells.join(','), reason: 'Expense cost must be greater than zero' })
      continue
    }

    // Nudge a tiny rounding residual (currencies, exotic exports) onto the
    // largest-magnitude entry so the nets sum to exactly zero before reconstruct.
    let warning: string | undefined
    if (netSum !== 0) {
      let target: string | null = null
      let max = -1
      for (const [name, v] of Object.entries(nets)) {
        if (Math.abs(v) > max) {
          max = Math.abs(v)
          target = name
        }
      }
      if (target) nets[target] -= netSum
      if (Math.abs(netSum) > 2) warning = 'Per-person amounts did not balance; adjusted to fit the total.'
    }

    // Total positive net cannot exceed the cost in a consistent row.
    const positive = Object.values(nets).reduce((a, v) => a + (v > 0 ? v : 0), 0)
    if (positive > amountMinor) {
      errors.push({ line, raw: cells.join(','), reason: 'Row totals are inconsistent (paid exceeds cost)' })
      continue
    }

    currencySet.add(currency)
    rows.push({ line, kind: 'expense', dateMs, description, category, currency, amountMinor, nets, warning })
  }

  return { people, rows, errors, currencies: [...currencySet], recognized: true }
}

/* --------------------------------------------------------- ledger reconstruction */

const allOne = (ids: string[]): Record<string, number> => {
  const w: Record<string, number> = {}
  for (const id of ids) w[id] = 1
  return w
}

/**
 * Reconstruct (paidBy, owed) from member-id-keyed nets so balances match exactly.
 * Returns `null` for an inconsistent row (positive net exceeds the total).
 *
 * Owers (net < 0) paid nothing and owe `|net|`. Payers (net > 0) split the
 * remaining `cost − Σ|negatives|` of the bill in proportion to their net, and
 * paid that share plus their net. People at net 0 are square on this line and are
 * left out. When every net is 0 the line is reconstructed as an equal split.
 */
export function reconstruct(nets: Record<string, number>, amountMinor: number): Reconstructed | null {
  const ids = Object.keys(nets)
  const owed: Shares = {}
  const paidBy: Shares = {}

  const positiveTotal = ids.reduce((a, id) => a + (nets[id] > 0 ? nets[id] : 0), 0)
  if (positiveTotal > amountMinor) return null

  if (positiveTotal === 0) {
    // Everyone is square on this line: present it as a clean equal split.
    const eq = largestRemainder(amountMinor, allOne(ids))
    for (const id of ids) {
      owed[id] = eq[id]
      paidBy[id] = eq[id]
    }
  } else {
    const payerIds = ids.filter((id) => nets[id] > 0)
    const payerShareTotal = amountMinor - positiveTotal // what the payers collectively owe
    const payerOwed = largestRemainder(payerShareTotal, (() => {
      const w: Record<string, number> = {}
      for (const id of payerIds) w[id] = nets[id]
      return w
    })())

    for (const id of ids) {
      const net = nets[id]
      if (net < 0) {
        owed[id] = -net
        // paidBy omitted (they paid nothing toward the bill).
      } else if (net > 0) {
        const share = payerOwed[id] ?? 0
        if (share > 0) owed[id] = share
        paidBy[id] = share + net
      }
      // net === 0: square — excluded from both maps.
    }
  }

  // Drop zero entries so the split config stays tidy.
  for (const id of Object.keys(owed)) if (owed[id] === 0) delete owed[id]
  for (const id of Object.keys(paidBy)) if (paidBy[id] === 0) delete paidBy[id]

  const participants = Object.keys(owed)
  if (participants.length === 0 || Object.keys(paidBy).length === 0) return null

  const payerId = derivePayer(paidBy)
  const splitConfig: SplitConfig = {
    scope: 'simple',
    baseType: 'exact',
    participants,
    payerIsParticipant: payerId != null && owed[payerId] != null,
    exactAmounts: owed,
  }
  return { amountMinor, paidBy, splitConfig }
}

/* ------------------------------------------------------------------ fingerprint */

/** The single dominant payer (largest `paidBy` entry). */
export function derivePayer(paidBy: Shares): string | undefined {
  let best: string | undefined
  let max = -Infinity
  for (const [id, v] of Object.entries(paidBy)) {
    if (v > max) {
      max = v
      best = id
    }
  }
  return best
}

/**
 * Dedupe fingerprint (CONTRACT §4): a stable key over the date, amount, normalized
 * description, and payer. Two rows with the same fingerprint are exact duplicates.
 */
export function fingerprint(args: {
  dateMs: number
  amountMinor: number
  description: string
  payerId?: string
}): string {
  return [
    dayKey(args.dateMs),
    args.amountMinor,
    normalizeDescription(args.description),
    args.payerId ?? '',
  ].join('|')
}
