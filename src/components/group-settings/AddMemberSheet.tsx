/**
 * Add a member (CONTRACT §3.14, §1.6). Admin-only. Two grounded paths that work
 * today without an issued invite token:
 *   - add a person by name as a guest (a `guest:<uuid>` ledger participant), or
 *   - add someone from the caller's contacts (a real user or saved guest).
 * A case-insensitive duplicate-name guard (A6) blocks accidental twins.
 *
 * For self-service joining, the group's shareable invite link (Share invite link →
 * InviteSheet, /join/:token) lets a friend claim a placeholder themselves; this
 * sheet stays the admin path for seeding placeholders and adding known contacts.
 */

import { useEffect, useMemo, useState } from 'react'
import { Avatar, Button, EV, PlusIcon } from '../../design'
import { useContacts } from '../../hooks'
import { Notice, controlStyle, fieldLabel } from './kit'
import { addGroupMember } from './api'

function newGuestId(): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `guest:${rnd}`
}

interface AddTarget {
  memberId: string
  displayName: string
  avatarUrl: string | null
}

export function AddMemberSheet({
  groupId,
  existingMemberIds,
  existingNames,
  onAdded,
  onClose,
}: {
  groupId: string
  existingMemberIds: string[]
  existingNames: string[]
  onAdded: (name: string) => void
  onClose: () => void
}) {
  const { records: contacts } = useContacts()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName('')
    setError(null)
    setBusy(false)
  }, [groupId])

  const takenNames = useMemo(() => new Set(existingNames.map((n) => n.toLowerCase())), [existingNames])
  const takenIds = useMemo(() => new Set(existingMemberIds), [existingMemberIds])

  const availableContacts = useMemo(
    () =>
      contacts
        .map((c) => {
          const memberId = c.data.contactUserId ?? c.data.contactGuestId ?? null
          return memberId
            ? { memberId, displayName: c.data.cachedName, avatarUrl: c.data.cachedAvatarUrl ?? null }
            : null
        })
        .filter((c): c is AddTarget => !!c && !takenIds.has(c.memberId)),
    [contacts, takenIds],
  )

  async function add(target: AddTarget) {
    if (busy) return
    setError(null)
    if (takenNames.has(target.displayName.trim().toLowerCase())) {
      setError(`Someone named "${target.displayName.trim()}" is already in this group.`)
      return
    }
    setBusy(true)
    const res = await addGroupMember({
      groupId,
      memberId: target.memberId,
      displayName: target.displayName.trim(),
      avatarUrl: target.avatarUrl,
      role: 'member',
    })
    setBusy(false)
    if (res.success) {
      onAdded(target.displayName.trim())
      onClose()
    } else {
      setError(res.error ?? 'Could not add this person. Please try again.')
    }
  }

  function addGuest() {
    const trimmed = name.trim()
    if (!trimmed) return
    void add({ memberId: newGuestId(), displayName: trimmed, avatarUrl: null })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* add a new guest by name */}
      <div>
        <label style={fieldLabel} htmlFor="am-name">
          Add a person
        </label>
        <div className="flex items-center gap-2">
          <input
            id="am-name"
            className="ev-input"
            style={controlStyle}
            value={name}
            autoFocus
            placeholder="Their name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addGuest()
              }
            }}
          />
          <Button
            size="sm"
            icon={<PlusIcon size={16} strokeWidth={2.4} />}
            onClick={addGuest}
            disabled={!name.trim() || busy}
          >
            Add
          </Button>
        </div>
        <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 7, lineHeight: 1.45 }}>
          They join as a guest, a full participant in splits and balances. Invite them to claim
          their share whenever they sign up.
        </p>
      </div>

      {/* from contacts */}
      {availableContacts.length > 0 && (
        <div>
          <label style={fieldLabel}>From your contacts</label>
          <div className="flex flex-col" style={{ gap: 2 }}>
            {availableContacts.map((c) => (
              <button
                key={c.memberId}
                type="button"
                disabled={busy}
                onClick={() => add(c)}
                className="ev-pressable"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: 12,
                  padding: '9px 8px',
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                <Avatar id={c.memberId} name={c.displayName} size={34} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: EV.ink }}>
                  {c.displayName}
                </span>
                <PlusIcon size={17} strokeWidth={2.2} style={{ color: EV.ink40 }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <Notice>
        Want them to join and add their own expenses? Close this and use{' '}
        <strong>Share invite link</strong>. They pick who they are and claim their spot.
      </Notice>
    </div>
  )
}
