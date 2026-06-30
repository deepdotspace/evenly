/**
 * Statement -> CSV (CONTRACT §3.4 export, §4 mixed-currency export, §7).
 *
 * Renders the shared `Statement` model into a spreadsheet-friendly CSV:
 *   1. a header block (group, primary currency, generated time, the FX note),
 *   2. the LEDGER table — one row per expense + settlement, with the original
 *      amount + currency AND the converted primary value, the payer(s), and one
 *      column per member for that row's owed share,
 *   3. the TOTALS block (in the primary currency),
 *   4. the BALANCES block — each member's net in the primary currency.
 *
 * Money is written as plain major-unit decimals (e.g. `42.50`) so a spreadsheet
 * can sum them; the Currency column states each row's unit. RFC-4180 escaping:
 * any cell containing a comma, quote, or newline is wrapped in double quotes with
 * embedded quotes doubled. A leading BOM makes Excel open UTF-8 cleanly.
 */

import { fromMinor, minorDigits } from '../../lib/money/currency'
import { balanceIsSettled, type Statement } from './statement'

/**
 * Quote a cell per RFC-4180, and neutralize spreadsheet formula injection. A text
 * cell that opens with `= + - @` (or a tab/CR) is evaluated as a formula by Excel /
 * Sheets, so a crafted description or member name could exfiltrate data on open. We
 * prefix such cells with a single quote -- but NOT legitimate numeric cells (incl.
 * negatives like `-42.50`), which must stay summable.
 */
function esc(value: string | number): string {
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Join a record of string cells into one CSV line. */
function row(cells: (string | number)[]): string {
  return cells.map(esc).join(',')
}

/** A signed major-unit decimal string at the currency's own precision (e.g. `-42.50`). */
function major(minor: number, currency: string): string {
  return fromMinor(minor, currency).toFixed(minorDigits(currency))
}

/** An unsigned major-unit decimal, or '' for an absent share cell. */
function shareCell(minor: number | undefined, currency: string): string {
  if (minor == null || minor === 0) return minor === 0 ? major(0, currency) : ''
  return major(minor, currency)
}

/** Human balance status for the summary block. */
function statusWord(netMinor: number): string {
  if (balanceIsSettled(netMinor)) return 'settled up'
  return netMinor > 0 ? 'is owed' : 'owes'
}

/**
 * Serialize a statement to CSV text (the exact bytes the download writes). Pure
 * and deterministic — the same statement always produces the same file.
 */
export function statementToCsv(s: Statement): string {
  const P = s.primaryCurrency
  const lines: string[] = []
  const generated = new Date(s.generatedAtMs).toLocaleString()

  // 1) Header block ---------------------------------------------------------
  lines.push(row([`Evenly — ${s.groupName} statement`]))
  lines.push(row(['Primary currency', P]))
  lines.push(row(['Members', s.members.length]))
  lines.push(row(['Expenses', s.totals.expenseCount]))
  lines.push(row(['Settlements', s.totals.settlementCount]))
  lines.push(row(['Generated', generated]))
  lines.push(
    row([
      'Note',
      `Foreign amounts are converted to ${P} using the exchange rate captured when each entry was added.`,
    ]),
  )
  lines.push(
    row(['Note', 'Money is shown in major units (e.g. 42.50). The Currency column gives each row’s currency.']),
  )
  lines.push('')

  // 2) Ledger table ---------------------------------------------------------
  lines.push(row(['LEDGER']))
  const header = [
    'Date',
    'Type',
    'Description',
    'Category',
    'Currency',
    'Amount (original)',
    `Amount (${P})`,
    'Paid by',
    ...s.members.map((m) => (m.isGuest ? `${m.name} (guest)` : m.name)),
  ]
  lines.push(row(header))

  for (const r of s.rows) {
    const paidBy =
      r.payers.length <= 1
        ? r.payers[0]?.name ?? ''
        : r.payers.map((p) => `${p.name} (${major(p.amountMinor, r.currency)})`).join('; ')

    const shareCells =
      r.kind === 'expense'
        ? s.members.map((m) => shareCell(r.shares[m.memberId], r.currency))
        : s.members.map(() => '')

    lines.push(
      row([
        r.dateISO,
        r.kind === 'expense' ? 'Expense' : 'Settlement',
        r.description,
        r.category,
        r.currency,
        major(r.amountMinor, r.currency),
        major(r.primaryMinor, P),
        paidBy,
        ...shareCells,
      ]),
    )
  }
  lines.push('')

  // 3) Totals ---------------------------------------------------------------
  lines.push(row(['TOTALS']))
  lines.push(row([`Total expenses (${P})`, major(s.totals.expensesPrimaryMinor, P)]))
  lines.push(row([`Total settlements (${P})`, major(s.totals.settlementsPrimaryMinor, P)]))
  lines.push('')

  // 4) Balances -------------------------------------------------------------
  lines.push(row([`BALANCES (net in ${P})`]))
  lines.push(row(['Member', `Net (${P})`, 'Status']))
  for (const b of s.balances) {
    const name = b.isGuest ? `${b.name} (guest)` : b.name
    lines.push(row([name, major(b.netMinor, P), statusWord(b.netMinor)]))
  }
  if (s.residualMinor !== 0) {
    lines.push(row(['Rounding (FX residual)', major(s.residualMinor, P), 'not a debt']))
  }

  // CRLF line endings (RFC-4180) + a BOM so Excel detects UTF-8.
  return '﻿' + lines.join('\r\n') + '\r\n'
}
