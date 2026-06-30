/**
 * DEV-ONLY membership-boundary harness (CONTRACT D1 / R4 — the #1 correctness bet).
 *
 * Mounts the REAL `useQuery`/`useMutations` against `groups` + `expenses` so the
 * DO's server-side `canRead()` filter is exercised over the live WebSocket exactly
 * as in production. The 2-user Playwright spec (tests/membership-boundary.spec.ts)
 * drives this page as two signed-in identities to prove a non-member receives ZERO
 * of a group's rows, and that adding them flips it.
 *
 * Gated to `import.meta.env.DEV` — it redirects in a production build, so it is
 * inert on the shipped app. Kept (not deleted) so Phase 6 can re-run the proof.
 */

import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, useQuery, useMutations, getAuthToken } from 'deepspace'
import { Button, Input } from '../../components/ui'

type AnyRec = Record<string, unknown>

export default function DevSpikePage() {
  if (!import.meta.env.DEV) return <Navigate to="/app" replace />
  return <DevSpike />
}

function DevSpike() {
  const { userId } = useAuth()
  const groups = useQuery<AnyRec>('groups')
  const expenses = useQuery<AnyRec>('expenses')
  const groupMut = useMutations<AnyRec>('groups')
  const expenseMut = useMutations<AnyRec>('expenses')

  const [name, setName] = useState('')
  const [memberId, setMemberId] = useState('')
  const [myGroupId, setMyGroupId] = useState('')
  const [myExpenseId, setMyExpenseId] = useState('')
  const [status, setStatus] = useState('')

  async function createGroup() {
    if (!userId) return
    const id = await groupMut.createConfirmed({
      name,
      kind: 'group',
      primaryCurrency: 'USD',
      memberIds: [userId],
      adminIds: [userId],
      simplifyDefault: false,
    })
    setMyGroupId(id)
    setStatus(`group:${id}`)
  }

  async function createExpense() {
    if (!userId || !myGroupId) return
    const id = await expenseMut.createConfirmed({
      groupId: myGroupId,
      memberIds: [userId],
      description: `${name} expense`,
      category: 'other',
      currency: 'USD',
      amountMinor: 1000,
      fxRate: 1,
      fxAsOf: Date.now(),
      paidBy: { [userId]: 1000 },
      splits: { [userId]: 1000 },
      splitConfig: { scope: 'simple', baseType: 'equal', participants: [userId], payerIsParticipant: true },
      expenseAtMs: Date.now(),
    })
    setMyExpenseId(id)
    setStatus(`expense:${id}`)
  }

  async function callAction(action: string, body: AnyRec) {
    const token = await getAuthToken()
    const res = await fetch(`/api/actions/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as { success?: boolean; error?: string }
    setStatus(`${action}:${json.success ? 'ok' : `err:${json.error ?? res.status}`}`)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">Dev spike: membership boundary</h1>
      <div data-testid="spike-user-id">{userId ?? ''}</div>
      <div data-testid="spike-my-group-id">{myGroupId}</div>
      <div data-testid="spike-my-expense-id">{myExpenseId}</div>
      <div data-testid="spike-action-status">{status}</div>
      <div data-testid="spike-groups-status">{groups.status}</div>
      <div data-testid="spike-expenses-status">{expenses.status}</div>

      <Input data-testid="spike-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="unique group name" />
      <Input data-testid="spike-member-input" value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="memberId to add" />

      <div className="flex flex-wrap gap-2">
        <Button data-testid="spike-create-group" onClick={createGroup}>Create group</Button>
        <Button data-testid="spike-create-expense" onClick={createExpense}>Create expense</Button>
        <Button data-testid="spike-add-member" onClick={() => callAction('addGroupMember', { groupId: myGroupId, memberId, displayName: 'Spike Member' })}>Add member</Button>
        <Button data-testid="spike-delete-group" onClick={() => callAction('deleteGroupCascade', { groupId: myGroupId })}>Delete group</Button>
      </div>

      <h2 className="mt-4 font-medium">Groups visible to me ({groups.records.length})</h2>
      <ul>
        {groups.records.map((g) => (
          <li
            key={g.recordId}
            data-testid="spike-group"
            data-id={g.recordId}
            data-name={String((g.data as AnyRec).name ?? '')}
            data-members={JSON.stringify((g.data as AnyRec).memberIds ?? [])}
          >
            {String((g.data as AnyRec).name ?? '')}
          </li>
        ))}
      </ul>

      <h2 className="mt-4 font-medium">Expenses visible to me ({expenses.records.length})</h2>
      <ul>
        {expenses.records.map((x) => (
          <li
            key={x.recordId}
            data-testid="spike-expense"
            data-id={x.recordId}
            data-desc={String((x.data as AnyRec).description ?? '')}
            data-group={String((x.data as AnyRec).groupId ?? '')}
          >
            {String((x.data as AnyRec).description ?? '')}
          </li>
        ))}
      </ul>
    </div>
  )
}
