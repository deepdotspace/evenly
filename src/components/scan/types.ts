/**
 * Local types for the receipt scan -> tap-to-assign flow (CONTRACT §3.6).
 *
 * The flow is a small client state machine over a single route. The parsed
 * receipt is kept as an EDITABLE copy (never trust OCR blindly, D9) and the
 * claims map is local until the expense is saved via `addExpense`.
 */

import type { ParsedReceipt, ParsedReceiptItem } from '../../lib/data/types'
import type { UnclaimedPolicy } from '../../lib/split'

export type ScanPhase = 'capture' | 'scanning' | 'review' | 'assign' | 'failed'

/** A group member as the assign UI needs them (identity + display name). */
export interface AssignMember {
  /** A real userId or `guest:<uuid>` -- the ledger identity splits key on. */
  id: string
  name: string
}

/** `{ [itemId]: memberId[] }` -- who claimed each line item (local until save). */
export type ClaimsMap = Record<string, string[]>

export type { ParsedReceipt, ParsedReceiptItem, UnclaimedPolicy }
