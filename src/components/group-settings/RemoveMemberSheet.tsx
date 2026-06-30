/**
 * Remove / mark-inactive a member (CONTRACT §3.14, §4, §7 A5). Admin-only.
 *
 * Hard removal is only legal once a member is square (the server re-checks). When
 * they still carry a balance, this offers the smooth path: record the settling
 * payment(s) that zero them — the exact pairwise edges from the ledger — then
 * remove, instead of a dead-end block. Mark-inactive keeps them in the ledger
 * (visible, can still settle) but out of new expenses.
 */

import { useState } from 'react'
import { ArrowRightIcon, Avatar, Button, EV, MoneyText, formatMoney } from '../../design'
import { recordSettlement } from '../settle'
import { Notice } from './kit'
import { LeaveIcon } from './icons'
import { removeMember } from './api'

export interface SettleEdge {
  from: string
  to: string
  amount: number
}

type Busy = null | 'settle' | 'remove' | 'inactive'

export function RemoveMemberSheet({
  groupId,
  member,
  netMinor,
  edges,
  primary,
  nameFor,
  onDone,
  onClose,
}: {
  groupId: string
  member: { id: string; name: string }
  netMinor: number
  edges: SettleEdge[]
  primary: string
  nameFor: (id: string) => string
  onDone: (action: 'removed' | 'inactive' | 'settled-removed', name: string) => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const square = Math.abs(netMinor) <= 1
  const owes = netMinor < 0

  async function hardRemove() {
    setBusy('remove')
    setError(null)
    const res = await removeMember(groupId, member.id, 'remove')
    setBusy(null)
    if (res.success) onDone('removed', member.name)
    else setError(res.error ?? 'Could not remove this member.')
  }

  async function markInactive() {
    setBusy('inactive')
    setError(null)
    const res = await removeMember(groupId, member.id, 'inactive')
    setBusy(null)
    if (res.success) onDone('inactive', member.name)
    else setError(res.error ?? 'Could not update this member.')
  }

  async function settleAndRemove() {
    setBusy('settle')
    setError(null)
    for (const e of edges) {
      if (e.amount <= 0) continue
      const res = await recordSettlement({
        groupId,
        fromUserId: e.from,
        toUserId: e.to,
        amountMinor: e.amount,
        currency: primary,
        method: 'manual',
        note: `Settling ${member.name} before removal`,
      })
      if (!res.success) {
        setBusy(null)
        setError(res.error ?? 'Could not record the settling payment.')
        return
      }
    }
    const rm = await removeMember(groupId, member.id, 'remove')
    setBusy(null)
    if (rm.success) onDone('settled-removed', member.name)
    else setError(rm.error ?? 'Recorded the payments, but removal failed. Try again.')
  }

  const working = busy !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {square ? (
        <p style={{ fontSize: 14, color: EV.ink55, lineHeight: 1.5 }}>
          {member.name} is all square. You can remove them from the group, or mark them inactive to
          keep their history while leaving them out of new expenses.
        </p>
      ) : (
        <>
          <div
            style={{
              background: EV.tileHoney,
              borderRadius: 14,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: EV.honey }}>
              {member.name} {owes ? 'still owes' : 'is still owed'}
            </div>
            <MoneyText tone={owes ? 'owe' : 'owed'} size={26} weight={600} style={{ marginTop: 4, display: 'block' }}>
              {formatMoney(Math.abs(netMinor), primary)}
            </MoneyText>
          </div>
          <p style={{ fontSize: 13.5, color: EV.ink55, lineHeight: 1.5 }}>
            A member can only be fully removed once they're square. Record the settling{' '}
            {edges.length === 1 ? 'payment' : 'payments'} below to zero them out, then remove, or
            mark them inactive to keep them in the ledger.
          </p>

          {edges.length > 0 && (
            <div className="flex flex-col" style={{ gap: 2 }}>
              {edges.map((e, i) => (
                <div
                  key={`${e.from}-${e.to}-${i}`}
                  className="flex items-center gap-2.5"
                  style={{ padding: '9px 4px', borderBottom: i === edges.length - 1 ? 'none' : `1px solid ${EV.line}` }}
                >
                  <Avatar id={e.from} name={nameFor(e.from)} size={26} />
                  <ArrowRightIcon size={15} style={{ color: EV.ink35 }} />
                  <Avatar id={e.to} name={nameFor(e.to)} size={26} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: EV.ink }}>
                    {nameFor(e.from)} → {nameFor(e.to)}
                  </span>
                  <MoneyText tone="neutral" size={13.5} weight={600}>
                    {formatMoney(e.amount, primary)}
                  </MoneyText>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex flex-col" style={{ gap: 9 }}>
        {square ? (
          <Button fullWidth onClick={hardRemove} disabled={working} icon={<LeaveIcon size={17} />}>
            {busy === 'remove' ? 'Removing…' : `Remove ${member.name}`}
          </Button>
        ) : (
          <Button fullWidth onClick={settleAndRemove} disabled={working || edges.length === 0}>
            {busy === 'settle' ? 'Settling…' : 'Record settlement & remove'}
          </Button>
        )}
        <Button fullWidth variant="secondary" onClick={markInactive} disabled={working}>
          {busy === 'inactive' ? 'Updating…' : 'Mark inactive instead'}
        </Button>
        <Button fullWidth variant="quiet" onClick={onClose} disabled={working}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
