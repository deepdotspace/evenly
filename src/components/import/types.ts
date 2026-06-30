/**
 * Splitwise CSV import — shared types (CONTRACT §3.13, §4).
 *
 * These describe the parsed-CSV surface the wizard binds to and the member-id-
 * keyed payload the `importExpenses` server action consumes. Kept free of React /
 * DOM so the same module is safe to import from the worker action.
 */

import type { Shares, SplitConfig } from '../../lib/split'

/** A single parsed CSV data row (one Splitwise expense or settle-up line). */
export interface ParsedRow {
  /** 1-based source line number, for row-level error reporting. */
  line: number
  /** Expenses are imported; `payment` rows are Splitwise settle-ups (not imported). */
  kind: 'expense' | 'payment'
  /** Local-noon ms of the row's date (avoids the UTC off-by-one, §7). */
  dateMs: number
  description: string
  /** Resolved to the Evenly category catalog (§1.2); `other` when unknown. */
  category: string
  /** ISO-4217 code as written in the CSV. */
  currency: string
  /** Total cost in integer minor units of `currency`. */
  amountMinor: number
  /** Net per CSV person column (minor units, signed): `paid − owed`. Sums to ~0. */
  nets: Record<string, number>
  /** Non-fatal note (e.g. nets were nudged to balance). */
  warning?: string
}

/** A source line that could not be parsed into a valid row. */
export interface RowError {
  line: number
  raw: string
  reason: string
}

/** The full result of parsing a Splitwise export. */
export interface ParseResult {
  /** Person column names, in CSV order. */
  people: string[]
  /** Valid expense + payment rows. */
  rows: ParsedRow[]
  /** Rows we could not read (reported, never silently dropped). */
  errors: RowError[]
  /** Distinct currencies across expense rows. */
  currencies: string[]
  /** Whether the header looked like a Splitwise spreadsheet export. */
  recognized: boolean
}

/** How one CSV person maps onto a group member identity (map step). */
export interface Assignment {
  /** The member id to use: a real `userId` or a `guest:<uuid>`. */
  id: string
  /** Display name for the member. */
  name: string
  /** True when this identity must be created (a new guest / contact not yet in the group). */
  isNew: boolean
}

/** One row of the action payload: nets already mapped to member ids. */
export interface ImportRowPayload {
  /** Local-noon ms of the row's date. */
  dateMs: number
  description: string
  category: string
  currency: string
  amountMinor: number
  /** Net per member id (minor units, signed). */
  nets: Record<string, number>
}

/** The reconstructed ledger shape for one expense (member-id keyed). */
export interface Reconstructed {
  amountMinor: number
  /** Who paid (sums to `amountMinor`). */
  paidBy: Shares
  /** A split config that reproduces the owed shares exactly. */
  splitConfig: SplitConfig
}

/** Per-chunk result the action returns (accumulated client-side across chunks). */
export interface ImportChunkResult {
  imported: number
  skippedDuplicates: number
  errors: { index: number; description: string; reason: string }[]
  createdIds: string[]
}
