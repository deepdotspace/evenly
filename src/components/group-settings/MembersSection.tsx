/**
 * Members (CONTRACT §3.14, §1.6, §4, §7 A5). The roster with role + status, plus
 * the admin actions: add a member, promote / step down admins (the source of
 * truth is `groups.adminIds`, D8), and the settle-then-remove / mark-inactive
 * flow. Members see the roster read-only.
 */

import { useMemo, useState, type ReactNode } from 'react'
import type { RecordData } from 'deepspace'
import { Avatar, Button, EV, LinkIcon, MoneyText, PlusIcon, Sheet, formatMoney } from '../../design'
import type { GroupMemberData, MemberId } from '../../lib/data/types'
import { Card, Notice } from './kit'
import { ShieldIcon } from './icons'
import { AddMemberSheet } from './AddMemberSheet'
import { RemoveMemberSheet, type SettleEdge } from './RemoveMemberSheet'
import { updateGroup, type GroupSettingsData } from './api'
import { InviteSheet } from '../invite'

type MemberRec = RecordData<GroupMemberData>

const STATUS_ORDER: Record<GroupMemberData['status'], number> = { active: 0, inactive: 1, removed: 2 }

export function MembersSection({
  groupId,
  group,
  createdBy,
  members,
  isAdmin,
  currentUserId,
  net,
  directEdges,
  primary,
  nameFor,
  onToast,
}: {
  groupId: string
  group: GroupSettingsData
  createdBy: string
  members: MemberRec[]
  isAdmin: boolean
  currentUserId: string | null
  net: Record<MemberId, number>
  directEdges: SettleEdge[]
  primary: string
  nameFor: (id: string) => string
  onToast: (kind: 'success' | 'error', title: string, body?: string) => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)
  const [pendingRole, setPendingRole] = useState<string | null>(null)

  const adminIds = useMemo(() => new Set(group.adminIds ?? []), [group.adminIds])

  const visible = useMemo(
    () =>
      members
        .filter((m) => m.data.status !== 'removed')
        .map((m) => ({ rec: m, id: (m.data.userId ?? m.data.guestId ?? m.recordId) as string }))
        .sort((a, b) => {
          const s = STATUS_ORDER[a.rec.data.status] - STATUS_ORDER[b.rec.data.status]
          if (s !== 0) return s
          return a.rec.data.displayName.localeCompare(b.rec.data.displayName)
        }),
    [members],
  )

  const existingMemberIds = useMemo(() => visible.map((v) => v.id), [visible])
  const existingNames = useMemo(() => visible.map((v) => v.rec.data.displayName), [visible])

  async function setAdmin(id: string, makeAdmin: boolean) {
    if (pendingRole) return
    setPendingRole(id)
    const next = makeAdmin
      ? Array.from(new Set([...(group.adminIds ?? []), id]))
      : (group.adminIds ?? []).filter((x) => x !== id)
    const res = await updateGroup({ groupId, adminIds: next })
    setPendingRole(null)
    if (res.success) {
      onToast('success', makeAdmin ? 'Promoted to admin' : 'Admin role removed')
    } else {
      onToast('error', 'Could not update role', res.error ?? 'Please try again.')
    }
  }

  function edgesFor(id: string): SettleEdge[] {
    return directEdges.filter((e) => e.from === id || e.to === id)
  }

  return (
    <Card
      title="Members"
      subtitle={`${visible.length} ${visible.length === 1 ? 'person' : 'people'}`}
      right={
        isAdmin ? (
          <Button size="sm" variant="secondary" icon={<PlusIcon size={16} strokeWidth={2.4} />} onClick={() => setAddOpen(true)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col">
        {visible.map(({ rec, id }, i) => {
          const m = rec.data
          const isCreator = createdBy === id || createdBy === m.userId
          const memberIsAdmin = adminIds.has(id) || isCreator
          const isGuest = !m.userId
          const isSelf = currentUserId != null && m.userId === currentUserId
          const inactive = m.status === 'inactive'
          const memberNet = net[id] ?? 0
          const tone = Math.abs(memberNet) <= 1 ? 'even' : memberNet > 0 ? 'owed' : 'owe'

          return (
            <div
              key={rec.recordId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${EV.line}`,
                opacity: inactive ? 0.7 : 1,
              }}
            >
              <Avatar id={id} name={m.displayName} size={40} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center" style={{ gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: EV.ink }}>{m.displayName}</span>
                  {isSelf && <span style={{ fontSize: 12, color: EV.ink45 }}>You</span>}
                  {memberIsAdmin && <RoleBadge>{isCreator ? 'Owner' : 'Admin'}</RoleBadge>}
                  {isGuest && <MutedBadge>Guest</MutedBadge>}
                  {inactive && <MutedBadge>Inactive</MutedBadge>}
                </div>
                <div style={{ marginTop: 2 }}>
                  {tone === 'even' ? (
                    <span style={{ fontSize: 12.5, color: EV.ink45 }}>Settled up</span>
                  ) : (
                    <MoneyText
                      tone={tone}
                      size={12.5}
                      weight={600}
                      label={tone === 'owed' ? 'owed' : 'owes'}
                    >
                      {formatMoney(Math.abs(memberNet), primary)}
                    </MoneyText>
                  )}
                </div>

                {/* admin actions */}
                {isAdmin && (
                  <div className="flex items-center" style={{ gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                    {!isGuest && !isCreator && (
                      <RowAction
                        onClick={() => setAdmin(id, !memberIsAdmin)}
                        disabled={pendingRole === id}
                      >
                        {memberIsAdmin ? 'Step down' : 'Make admin'}
                      </RowAction>
                    )}
                    {!isCreator && (
                      <RowAction danger onClick={() => setRemoveTarget({ id, name: m.displayName })}>
                        Remove
                      </RowAction>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* share invite link — any member can invite; the friend picks who they are */}
      <Button
        variant="secondary"
        fullWidth
        icon={<LinkIcon size={17} />}
        onClick={() => setInviteOpen(true)}
        style={{ marginTop: 14 }}
      >
        Share invite link
      </Button>

      {!isAdmin && (
        <Notice style={{ marginTop: 14 }}>
          Anyone with the invite link can join. Only an admin can add or remove members directly.
        </Notice>
      )}

      <InviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        groupId={groupId}
        groupName={group.name}
        isAdmin={isAdmin}
      />

      {/* add member */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add a member">
        <AddMemberSheet
          groupId={groupId}
          existingMemberIds={existingMemberIds}
          existingNames={existingNames}
          onAdded={(name) => onToast('success', 'Member added', `${name} is in the group.`)}
          onClose={() => setAddOpen(false)}
        />
      </Sheet>

      {/* settle-then-remove */}
      <Sheet
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title={removeTarget ? `Remove ${removeTarget.name}` : 'Remove member'}
      >
        {removeTarget && (
          <RemoveMemberSheet
            groupId={groupId}
            member={removeTarget}
            netMinor={net[removeTarget.id] ?? 0}
            edges={edgesFor(removeTarget.id)}
            primary={primary}
            nameFor={nameFor}
            onClose={() => setRemoveTarget(null)}
            onDone={(action, name) => {
              setRemoveTarget(null)
              if (action === 'inactive') onToast('success', 'Marked inactive', `${name} stays in the ledger.`)
              else if (action === 'settled-removed') onToast('success', 'Settled & removed', `${name} is square and out of the group.`)
              else onToast('success', 'Member removed', `${name} is out of the group.`)
            }}
          />
        )}
      </Sheet>
    </Card>
  )
}

/* -------------------------------------------------------------------- bits */

function RoleBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 4,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: EV.sageDeep,
        background: 'var(--ev-tile)',
        borderRadius: 999,
        padding: '2px 8px',
      }}
    >
      <ShieldIcon size={11} />
      {children}
    </span>
  )
}

function MutedBadge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: EV.ink45,
        background: EV.fillGhost,
        borderRadius: 999,
        padding: '2px 8px',
      }}
    >
      {children}
    </span>
  )
}

function RowAction({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={disabled ? undefined : 'ev-pressable'}
      style={{
        border: `1px solid ${EV.borderGhost}`,
        background: EV.surface,
        borderRadius: 999,
        padding: '5px 11px',
        fontSize: 12.5,
        fontWeight: 600,
        color: danger ? EV.clayDeep : EV.ink,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}
