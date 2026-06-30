/**
 * Typed record hooks (CONTRACT §1, §3). One hook per collection, each a thin typed
 * wrapper over the SDK `useQuery` scoped to the current user's groups.
 *
 * MEMBER-SCOPING (D1): the RecordRoom DO's server-side `canRead()` is the real
 * boundary -- it filters `memberIds` against the connecting user before any row
 * ships over the WebSocket. The `where` clauses here are convenience/perf only.
 *
 * Soft-deleted rows (`deletedAt`) are excluded from these "active" views by
 * default; pass `{ includeDeleted: true }` to see them (history / restore UI).
 */

import { useMemo } from 'react'
import { useQuery, type RecordData } from 'deepspace'
import type {
  ActivityData,
  CommentData,
  ContactData,
  ExpenseData,
  GroupData,
  GroupMemberData,
  ReceiptData,
  RecurringExpenseData,
  SettlementData,
  UserProfileData,
} from '../lib/data/types'

/** Common shape returned by the list hooks. */
export interface RecordsState<T> {
  records: RecordData<T>[]
  status: 'loading' | 'ready' | 'error'
  error?: string
}

/** Common shape returned by the single-record hooks. */
export interface RecordState<T> {
  record: RecordData<T> | null
  status: 'loading' | 'ready' | 'error'
  error?: string
}

const notDeleted = (r: RecordData<{ deletedAt?: number | null }>): boolean => !r.data.deletedAt

/* -------------------------------------------------------------------- groups */

/** All groups the user belongs to. Archived groups excluded unless requested. */
export function useGroups(opts: { includeArchived?: boolean } = {}): RecordsState<GroupData> {
  const q = useQuery<GroupData>('groups', { orderBy: 'updatedAt', orderDir: 'desc' })
  const records = useMemo(
    () => (opts.includeArchived ? q.records : q.records.filter((r) => !r.data.archivedAt)),
    [q.records, opts.includeArchived],
  )
  return { records, status: q.status, error: q.error }
}

/** A single group by recordId (resolved from the member-scoped set). */
export function useGroup(groupId: string | undefined): RecordState<GroupData> {
  const q = useGroups({ includeArchived: true })
  const record = useMemo(
    () => (groupId ? q.records.find((r) => r.recordId === groupId) ?? null : null),
    [q.records, groupId],
  )
  return { record, status: q.status, error: q.error }
}

/** Pair groups (1:1 friend ledgers) -- the Friends surface (CONTRACT §3.8). */
export function useFriendGroups(): RecordsState<GroupData> {
  const q = useGroups()
  const records = useMemo(() => q.records.filter((r) => r.data.kind === 'pair'), [q.records])
  return { records, status: q.status, error: q.error }
}

/* ------------------------------------------------------------- group members */

/** Members of a group. Includes inactive/removed (UI filters by `status`). */
export function useGroupMembers(groupId: string | undefined): RecordsState<GroupMemberData> {
  const q = useQuery<GroupMemberData>('groupMembers', groupId ? { where: { groupId } } : undefined)
  const records = useMemo(
    () => (groupId ? q.records.filter((r) => r.data.groupId === groupId) : []),
    [q.records, groupId],
  )
  return { records, status: q.status, error: q.error }
}

/* ------------------------------------------------------------------ expenses */

export function useExpenses(
  groupId: string | undefined,
  opts: { includeDeleted?: boolean } = {},
): RecordsState<ExpenseData> {
  const q = useQuery<ExpenseData>(
    'expenses',
    groupId
      ? { where: { groupId }, orderBy: 'expenseAtMs', orderDir: 'desc' }
      : { orderBy: 'expenseAtMs', orderDir: 'desc' },
  )
  const records = useMemo(() => {
    let rows = groupId ? q.records.filter((r) => r.data.groupId === groupId) : q.records
    if (!opts.includeDeleted) rows = rows.filter(notDeleted)
    return rows
  }, [q.records, groupId, opts.includeDeleted])
  return { records, status: q.status, error: q.error }
}

/* --------------------------------------------------------------- settlements */

export function useSettlements(
  groupId: string | undefined,
  opts: { includeDeleted?: boolean } = {},
): RecordsState<SettlementData> {
  const q = useQuery<SettlementData>(
    'settlements',
    groupId
      ? { where: { groupId }, orderBy: 'settledAtMs', orderDir: 'desc' }
      : { orderBy: 'settledAtMs', orderDir: 'desc' },
  )
  const records = useMemo(() => {
    let rows = groupId ? q.records.filter((r) => r.data.groupId === groupId) : q.records
    if (!opts.includeDeleted) rows = rows.filter(notDeleted)
    return rows
  }, [q.records, groupId, opts.includeDeleted])
  return { records, status: q.status, error: q.error }
}

/* ------------------------------------------------------------------ receipts */

/** A single receipt by recordId (member-scoped). */
export function useReceipt(receiptId: string | undefined): RecordState<ReceiptData> {
  const q = useQuery<ReceiptData>('receipts')
  const record = useMemo(
    () => (receiptId ? q.records.find((r) => r.recordId === receiptId) ?? null : null),
    [q.records, receiptId],
  )
  return { record, status: q.status, error: q.error }
}

/* ------------------------------------------------------------------ comments */

export function useComments(expenseId: string | undefined): RecordsState<CommentData> {
  const q = useQuery<CommentData>(
    'comments',
    expenseId ? { where: { expenseId }, orderBy: 'createdAt' } : undefined,
  )
  const records = useMemo(
    () => (expenseId ? q.records.filter((r) => r.data.expenseId === expenseId && !r.data.deletedAt) : []),
    [q.records, expenseId],
  )
  return { records, status: q.status, error: q.error }
}

/* ------------------------------------------------------------------ activity */

/** Activity feed -- a single group's, or all groups' when `groupId` is omitted. */
export function useActivity(
  groupId?: string,
  opts: { limit?: number } = {},
): RecordsState<ActivityData> {
  const q = useQuery<ActivityData>('activity', {
    ...(groupId ? { where: { groupId } } : {}),
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: opts.limit ?? 100,
  })
  const records = useMemo(
    () => (groupId ? q.records.filter((r) => r.data.groupId === groupId) : q.records),
    [q.records, groupId],
  )
  return { records, status: q.status, error: q.error }
}

/* ----------------------------------------------------------------- recurring */

export function useRecurring(groupId: string | undefined): RecordsState<RecurringExpenseData> {
  const q = useQuery<RecurringExpenseData>(
    'recurringExpenses',
    groupId ? { where: { groupId } } : undefined,
  )
  const records = useMemo(
    () => (groupId ? q.records.filter((r) => r.data.groupId === groupId) : []),
    [q.records, groupId],
  )
  return { records, status: q.status, error: q.error }
}

/* ------------------------------------------------------------------ contacts */

/** The current user's address book (read:'own', scoped server-side). */
export function useContacts(): RecordsState<ContactData> {
  const q = useQuery<ContactData>('contacts', { orderBy: 'lastSplitAtMs', orderDir: 'desc' })
  return { records: q.records, status: q.status, error: q.error }
}

/* ------------------------------------------------------------------- profile */

/** The current user's own `users` profile row (read:'own'). */
export function useProfile(): RecordState<UserProfileData> {
  const q = useQuery<UserProfileData>('users')
  return { record: q.records[0] ?? null, status: q.status, error: q.error }
}
