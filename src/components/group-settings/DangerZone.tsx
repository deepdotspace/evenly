/**
 * Archive / delete a group (CONTRACT §3.14, D8). Admin/creator only. Archiving is
 * reversible (hidden from the main list, kept read-only); deleting cascades every
 * group row and is permanent, so it goes behind an explicit confirm.
 */

import { useState, type ReactNode } from 'react'
import { Button, EV, Sheet } from '../../design'
import { Card, Notice } from './kit'
import { ArchiveIcon, TrashIcon } from './icons'
import { archiveGroup, deleteGroupCascade, type GroupSettingsData } from './api'

export function DangerZone({
  groupId,
  group,
  isAdmin,
  onToast,
  onDeleted,
}: {
  groupId: string
  group: GroupSettingsData
  isAdmin: boolean
  onToast: (kind: 'success' | 'error', title: string, body?: string) => void
  onDeleted: () => void
}) {
  const archived = !!group.archivedAt
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState<null | 'archive' | 'delete'>(null)

  if (!isAdmin) return null

  async function toggleArchive() {
    setBusy('archive')
    const res = await archiveGroup(groupId, !archived)
    setBusy(null)
    if (res.success) {
      onToast('success', archived ? 'Group restored' : 'Group archived', archived ? undefined : 'Hidden from your main list.')
    } else {
      onToast('error', 'Could not update', res.error ?? 'Please try again.')
    }
  }

  async function doDelete() {
    setBusy('delete')
    const res = await deleteGroupCascade(groupId)
    setBusy(null)
    setConfirmOpen(false)
    if (res.success) {
      onToast('success', 'Group deleted', `"${group.name}" and its history are gone.`)
      onDeleted()
    } else {
      onToast('error', 'Could not delete', res.error ?? 'Please try again.')
    }
  }

  return (
    <Card title="Archive & delete">
      <div className="flex flex-col" style={{ gap: 14 }}>
        <Row
          title={archived ? 'Restore group' : 'Archive group'}
          body={
            archived
              ? 'Bring this group back into your main list.'
              : 'Hide from your main list and make it read-only. You can restore it anytime.'
          }
          action={
            <Button variant="secondary" size="sm" icon={<ArchiveIcon size={16} />} onClick={toggleArchive} disabled={busy !== null}>
              {busy === 'archive' ? 'Working…' : archived ? 'Restore' : 'Archive'}
            </Button>
          }
        />

        <div style={{ height: 1, background: EV.line }} />

        <Row
          title="Delete group"
          body="Permanently remove this group and every expense, settlement, and receipt in it. This cannot be undone."
          action={
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={busy !== null}
              className="ev-pressable"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                border: `1px solid ${EV.clay}`,
                background: EV.badgeBg,
                color: EV.clayDeep,
                borderRadius: 13,
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: busy !== null ? 'default' : 'pointer',
              }}
            >
              <TrashIcon size={16} />
              Delete
            </button>
          }
        />
      </div>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} variant="modal" title="Delete this group?">
        <div className="flex flex-col" style={{ gap: 16, paddingTop: 2 }}>
          <p style={{ fontSize: 14, color: EV.ink60, lineHeight: 1.55 }}>
            <strong style={{ color: EV.ink }}>“{group.name}”</strong> and all of its expenses,
            settlements, receipts, and history will be permanently deleted. This cannot be undone.
          </p>
          <Notice tone="danger">Everyone in the group loses access to this ledger.</Notice>
          <div className="flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)} disabled={busy === 'delete'}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={doDelete}
              disabled={busy === 'delete'}
              className="ev-pressable"
              style={{
                border: 'none',
                background: EV.clay,
                color: EV.paper,
                borderRadius: 13,
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: 600,
                cursor: busy === 'delete' ? 'default' : 'pointer',
                boxShadow: 'var(--ev-shadow-btn)',
              }}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete group'}
            </button>
          </div>
        </div>
      </Sheet>
    </Card>
  )
}

function Row({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4" style={{ flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: EV.ink }}>{title}</div>
        <p style={{ fontSize: 12.5, color: EV.ink55, marginTop: 3, lineHeight: 1.45 }}>{body}</p>
      </div>
      {action}
    </div>
  )
}
