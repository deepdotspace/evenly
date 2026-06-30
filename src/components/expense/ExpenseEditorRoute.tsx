/**
 * ExpenseEditorRoute — the data-loading shell behind the new/edit routes.
 *
 * Resolves the group, its members, (edit) the existing expense, and any linked /
 * incoming receipt, guards the loading / not-found / not-a-member states, then
 * mounts the controlled `ExpenseForm` with everything it needs already settled
 * (so the form's one-shot seeding sees real data).
 */

import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from 'deepspace'
import { Button, EV } from '../../design'
import { useExpenses, useGroup, useGroupMembers, useReceipt } from '../../hooks'
import type { Claims, SplitConfig } from '../../lib/split'
import type { ParsedReceipt } from '../../lib/data/types'
import { ExpenseForm } from './ExpenseForm'
import { rosterFrom } from './shared'
import type { ExpenseDataWithNote } from './useExpenseForm'

export function ExpenseEditorRoute({ mode }: { mode: 'new' | 'edit' }) {
  const { groupId, expenseId } = useParams()
  const [searchParams] = useSearchParams()
  const queryReceiptId = searchParams.get('receiptId') ?? undefined
  const { userId } = useAuth()

  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const expenses = useExpenses(groupId, { includeDeleted: true })

  const existingRec = useMemo(
    () => (mode === 'edit' && expenseId ? expenses.records.find((r) => r.recordId === expenseId) ?? null : null),
    [mode, expenseId, expenses.records],
  )

  // The receipt to seed from: an incoming scan (new) or a linked one (edit).
  const receiptId = (mode === 'edit' ? existingRec?.data.receiptId ?? undefined : queryReceiptId) ?? undefined
  const receipt = useReceipt(receiptId)

  const roster = useMemo(() => rosterFrom(members.records, userId ?? undefined), [members.records, userId])

  // ---- guards ----
  const groupLoading = group.status === 'loading' && !group.record
  const membersLoading = members.status === 'loading' && members.records.length === 0
  const expensesLoading = mode === 'edit' && expenses.status === 'loading' && !existingRec
  const receiptLoading = !!receiptId && receipt.status === 'loading' && !receipt.record

  if (groupLoading || membersLoading || expensesLoading || receiptLoading) return <Skeleton />

  if (group.status === 'ready' && !group.record) {
    return (
      <Centered
        title="Group not found"
        body="It may have been deleted, or you're no longer a member."
        action={
          <Link to="/app">
            <Button variant="secondary">Back to overview</Button>
          </Link>
        }
      />
    )
  }

  if (group.record && userId && !group.record.data.memberIds?.includes(userId) && group.record.createdBy !== userId) {
    return (
      <Centered
        title="You're not in this group"
        body="Only members can add or change its expenses."
        action={
          <Link to="/app">
            <Button variant="secondary">Back to overview</Button>
          </Link>
        }
      />
    )
  }

  if (mode === 'edit' && !existingRec) {
    return (
      <Centered
        title="Expense not found"
        body="It may have been removed."
        action={
          <Link to={`/app/g/${groupId}`}>
            <Button variant="secondary">Back to group</Button>
          </Link>
        }
      />
    )
  }

  const primary = group.record?.data.primaryCurrency ?? 'USD'
  const isAdmin =
    !!group.record &&
    !!userId &&
    ((group.record.data.adminIds ?? []).includes(userId) || group.record.createdBy === userId)

  const parsed = receipt.record?.data.parsed as ParsedReceipt | null | undefined
  const receiptSeed =
    receiptId && parsed
      ? { id: receiptId, parsed, claims: (receipt.record?.data.claims ?? {}) as Claims }
      : null

  return (
    <ExpenseForm
      key={`${mode}:${expenseId ?? 'new'}:${receiptId ?? ''}`}
      mode={mode}
      groupId={groupId ?? ''}
      primary={primary}
      roster={roster}
      youId={userId ?? ''}
      isAdmin={isAdmin}
      existing={existingRec ? { id: existingRec.recordId, data: existingRec.data as ExpenseDataWithNote } : null}
      receiptSeed={receiptSeed}
      defaultSplit={mode === 'new' ? ((group.record?.data.defaultSplit as SplitConfig | null) ?? null) : null}
    />
  )
}

function Centered({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col items-center text-center" style={{ paddingTop: 'clamp(48px, 14vh, 140px)' }}>
        <div style={{ fontFamily: EV.fontDisplay, fontSize: 24, fontWeight: 500, color: EV.ink }}>{title}</div>
        <p style={{ fontSize: 14, color: EV.ink55, marginTop: 6, maxWidth: 360 }}>{body}</p>
        <div style={{ marginTop: 18 }}>{action}</div>
      </div>
    </div>
  )
}

function Bar({ w, h = 14, mt = 0 }: { w: number | string; h?: number; mt?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 6, background: EV.fillGhost, marginTop: mt }} />
}

function Skeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 680 }}>
        <Bar w={100} h={11} />
        <Bar w="55%" h={30} mt={18} />
        <Bar w="100%" h={150} mt={20} />
        <Bar w="100%" h={120} mt={16} />
        <Bar w="100%" h={120} mt={16} />
      </div>
    </div>
  )
}
