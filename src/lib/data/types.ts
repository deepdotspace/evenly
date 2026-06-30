/**
 * Domain record-data types (CONTRACT §1). These describe the `.data` payload of
 * each collection's DeepSpace envelope -- they are the single typed contract the
 * record hooks (`src/hooks`) and the derived selectors (`src/lib/data`) bind to.
 *
 * Every type matches the live schema in `src/schemas/*` field-for-field. The
 * envelope fields (`recordId` / `createdBy` / `createdAt` / `updatedAt`) are NOT
 * repeated here -- they live on `RecordData<T>` from the SDK.
 *
 * Boolean columns are stored as `storage:'number'` and read back as `1 | 0`
 * (CONTRACT §8 convention), so boolean-ish fields are typed `StoredBool` and must
 * be read via `truthy()`, never `=== true`.
 */

import type {
  Cents,
  Claims,
  MemberId,
  Shares,
  SplitConfig,
} from '../split'

/** A DeepSpace number-backed boolean: `true`/`false` at write, `1`/`0` on read. */
export type StoredBool = boolean | 0 | 1

/** Read a number-backed boolean column truthily (never `=== true`). */
export function truthy(v: StoredBool | null | undefined): boolean {
  return v === true || v === 1
}

/** Opted-in settle-up handles a member shares with co-members (CONTRACT §1.3). */
export interface PaymentHandles {
  venmo?: string
  paypalMe?: string
  cashtag?: string
  upiId?: string
}

/** Per-channel notification toggles (CONTRACT §1.3). */
export interface NotifyPrefs {
  added: boolean
  settled: boolean
  comments: boolean
  reminders: boolean
  weekly: boolean
}

/** `users` profile, extending the SDK base (CONTRACT §1.3). */
export interface UserProfileData {
  displayName?: string
  avatarUrl?: string | null
  defaultCurrency?: string
  paymentHandles?: PaymentHandles | null
  notifyPrefs?: NotifyPrefs | null
  createdAtMs?: number
}

/** `contacts` address-book row (CONTRACT §1.4). */
export interface ContactData {
  ownerUserId: string
  contactUserId?: string | null
  contactGuestId?: string | null
  cachedName: string
  cachedAvatarUrl?: string | null
  email?: string | null
  lastSplitAtMs?: number | null
}

export type GroupKind = 'group' | 'pair' | 'oneoff'

/** `groups` container (CONTRACT §1.5). */
export interface GroupData {
  name: string
  kind: GroupKind
  primaryCurrency: string
  memberIds: MemberId[]
  adminIds: string[]
  simplifyDefault: StoredBool
  defaultSplit?: SplitConfig | null
  coverColor?: string | null
  archivedAt?: number | null
  cachedNet?: Record<MemberId, number> | null
}

export type MemberRole = 'admin' | 'member'
export type MemberStatus = 'active' | 'inactive' | 'removed'

/** `groupMembers` membership row (CONTRACT §1.6). */
export interface GroupMemberData {
  groupId: string
  memberIds: MemberId[]
  userId?: string | null
  guestId?: string | null
  role: MemberRole
  status: MemberStatus
  displayName: string
  avatarUrl?: string | null
  paymentHandles?: PaymentHandles | null
  joinedAtMs?: number
  leftAtMs?: number | null
  inviteEmail?: string | null
  inviteToken?: string | null
  inviteExpiresMs?: number | null
}

/** `expenses` ledger entry (CONTRACT §1.7). Structurally a superset of the
 *  engine's `ExpenseLedgerInput` + `ExpenseSharesInput`. */
export interface ExpenseData {
  groupId: string
  memberIds: MemberId[]
  description: string
  category: string
  currency: string
  amountMinor: Cents
  fxRate: number
  fxAsOf?: number
  paidBy: Shares
  splits: Shares
  splitConfig: SplitConfig
  expenseAtMs?: number
  receiptId?: string | null
  isReimbursement?: StoredBool
  recurringId?: string | null
  note?: string | null
  deletedAt?: number | null
}

export type SettlementMethod = 'manual' | 'venmo' | 'paypal' | 'cashapp' | 'upi' | 'cash'

/** `settlements` payment row (CONTRACT §1.8). */
export interface SettlementData {
  groupId: string
  memberIds: MemberId[]
  fromUserId: MemberId
  toUserId: MemberId
  currency: string
  amountMinor: Cents
  fxRate: number
  fxAsOf?: number
  method: SettlementMethod
  note?: string | null
  settledAtMs?: number
  deletedAt?: number | null
}

export type ReceiptStatus = 'parsing' | 'parsed' | 'low_confidence' | 'failed' | 'confirmed'
export type Confidence = 'high' | 'medium' | 'low'

/** One modifier riding on a receipt line item (its cost is in the line total). */
export interface ParsedReceiptModifier {
  name: string
  amountMinor: number
}

/** A parsed receipt line item (CONTRACT §1.9). `lineTotalMinor` already includes
 *  modifiers -- never emit a modifier as a phantom line. */
export interface ParsedReceiptItem {
  id: string
  name: string
  qty: number
  unitPriceMinor: number
  lineTotalMinor: number
  modifiers?: ParsedReceiptModifier[]
}

/** The AI receipt-parse output (CONTRACT §1.9). */
export interface ParsedReceipt {
  merchant: string | null
  datetime: string | null
  currency: string
  items: ParsedReceiptItem[]
  taxMinor: number
  tipMinor: number
  feesMinor: number
  discountMinor: number
  subtotalMinor: number
  printedTotalMinor: number
  confidence: Confidence
}

/** `receipts` row (CONTRACT §1.9). */
export interface ReceiptData {
  groupId: string
  memberIds: MemberId[]
  expenseId?: string | null
  r2Key: string
  imageUrl: string
  status: ReceiptStatus
  parsed?: ParsedReceipt | null
  claims: Claims
  model: string
  confidence?: Confidence | null
}

/** `comments` row (CONTRACT §1.10). */
export interface CommentData {
  expenseId: string
  groupId: string
  memberIds: MemberId[]
  body: string
  deletedAt?: number | null
}

export type ActivityType =
  | 'expense.created'
  | 'expense.edited'
  | 'expense.deleted'
  | 'expense.restored'
  | 'settlement.recorded'
  | 'settlement.deleted'
  | 'member.added'
  | 'member.removed'
  | 'member.left'
  | 'comment.added'
  | 'receipt.scanned'
  | 'group.created'
  | 'group.renamed'
  | 'recurring.created'
  | 'recurring.materialized'

/** The before/after payload that powers history + undo (CONTRACT §1.11). */
export interface ActivityPayload {
  before?: unknown
  after?: unknown
  summary?: string
}

/** `activity` audit/feed row (CONTRACT §1.11). */
export interface ActivityData {
  groupId: string
  memberIds: MemberId[]
  type: ActivityType
  actorId: string
  targetId?: string | null
  payload?: ActivityPayload | null
}

/** A recurring-expense template (same shapes as an expense; CONTRACT §1.12). */
export interface RecurringTemplate {
  description: string
  category: string
  currency: string
  amountMinor: Cents
  paidBy: Shares
  splitConfig: SplitConfig
}

export interface Cadence {
  unit: 'day' | 'week' | 'month'
  interval: number
  anchorDay?: number
}

/** `recurringExpenses` row (CONTRACT §1.12). */
export interface RecurringExpenseData {
  groupId: string
  memberIds: MemberId[]
  template: RecurringTemplate
  cadence: Cadence
  timezone?: string
  nextRunAtMs?: number
  lastRunAtMs?: number | null
  endsAtMs?: number | null
  active: StoredBool
}

/** `fxRates` worker-written cache (CONTRACT §1.13). */
export interface FxRatesData {
  base: string
  /** `{ [code]: number }` major-unit rates vs `base`. */
  rates: Record<string, number>
  fetchedAtMs?: number
}

export type { Cents, Claims, MemberId, Shares, SplitConfig } from '../split'
