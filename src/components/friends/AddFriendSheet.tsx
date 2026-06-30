/**
 * AddFriendSheet — the "add a friend" flow (CONTRACT §3.8).
 *
 * A friend is a `pair` group with the other person seeded as a guest placeholder
 * (D6 — everything is a group under the hood; guests participate in the ledger
 * until they claim an account). Two paths: quick-pick someone from your address
 * book, or add someone new by name (+ optional email). Both call the privileged
 * `createGroup` action with `kind:'pair'` (membership writes never go through
 * client `put`, D5), best-effort upsert the contact, then open the new ledger.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthToken, type RecordData } from 'deepspace'
import { Avatar, Button, EV, PlusIcon, Sheet, useToast } from '../../design'
import type { ContactData } from '../../lib/data/types'

const fieldLabel: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: EV.ink55,
  marginBottom: 7,
  display: 'block',
}

const inputStyle: CSSProperties = {
  width: '100%',
  fontSize: 15,
  fontWeight: 500,
  color: EV.ink,
  background: EV.paper,
  border: `1px solid ${EV.borderGhost}`,
  borderRadius: 12,
  padding: '12px 14px',
}

function newGuestId(): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `guest:${rnd}`
}

interface ActionResult<T> {
  success?: boolean
  error?: string
  data?: T
}

async function postAction<T>(name: string, body: Record<string, unknown>): Promise<ActionResult<T>> {
  const token = await getAuthToken()
  if (!token) return { success: false, error: 'You need to be signed in.' }
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return (await res.json().catch(() => ({ success: false, error: `Request failed (${res.status})` }))) as ActionResult<T>
}

export interface AddFriendSheetProps {
  open: boolean
  onClose: () => void
  contacts: RecordData<ContactData>[]
  defaultCurrency: string
}

export function AddFriendSheet({ open, onClose, contacts, defaultCurrency }: AddFriendSheetProps) {
  const navigate = useNavigate()
  const toast = useToast()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  /** recordId of the contact being added, 'new' for the form, or null if idle. */
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setEmail('')
      setBusyKey(null)
      setError(null)
    }
  }, [open])

  async function createFriend(key: string, input: { name: string; email?: string | null; source?: RecordData<ContactData> | null }) {
    const friendName = input.name.trim()
    if (!friendName) {
      setError('Enter a name for your friend.')
      return
    }
    if (busyKey) return
    setBusyKey(key)
    setError(null)
    try {
      const guestId = input.source?.data.contactGuestId ?? newGuestId()
      const res = await postAction<{ groupId?: string }>('createGroup', {
        name: friendName,
        kind: 'pair',
        primaryCurrency: defaultCurrency,
        guests: [
          { guestId, displayName: friendName, avatarUrl: input.source?.data.cachedAvatarUrl ?? null },
        ],
      })
      if (res.success && res.data?.groupId) {
        // Remember them in the address book (best-effort — never blocks the open).
        void postAction('addContact', {
          cachedName: friendName,
          contactUserId: input.source?.data.contactUserId ?? null,
          contactGuestId: input.source?.data.contactGuestId ?? guestId,
          email: (input.email ?? input.source?.data.email) || null,
          cachedAvatarUrl: input.source?.data.cachedAvatarUrl ?? null,
          lastSplitAtMs: Date.now(),
        })
        toast.success('Friend added', `You can start splitting with ${friendName}.`)
        onClose()
        navigate(`/app/g/${res.data.groupId}`)
      } else {
        setError(res.error ?? 'Could not add this friend. Please try again.')
        setBusyKey(null)
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      setBusyKey(null)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="modal"
      title="Add a friend"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            icon={<PlusIcon size={16} strokeWidth={2.4} />}
            onClick={() => createFriend('new', { name, email })}
            disabled={!name.trim() || busyKey !== null}
          >
            {busyKey === 'new' ? 'Adding…' : 'Add friend'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <p style={{ fontSize: 13, color: EV.ink55, lineHeight: 1.5 }}>
          Start a one-on-one ledger. Add anyone by name now. Add their email too and you can invite
          them to join and claim their balance later.
        </p>

        {contacts.length > 0 && (
          <div>
            <label style={fieldLabel}>People you've split with</label>
            <div className="flex flex-col gap-1.5">
              {contacts.slice(0, 6).map((c) => {
                const busy = busyKey === c.recordId
                return (
                  <button
                    key={c.recordId}
                    type="button"
                    className="ev-row-link"
                    disabled={busyKey !== null}
                    onClick={() =>
                      createFriend(c.recordId, {
                        name: c.data.cachedName,
                        email: c.data.email,
                        source: c,
                      })
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      width: '100%',
                      textAlign: 'left',
                      border: `1px solid ${EV.borderGhost}`,
                      background: EV.paper,
                      borderRadius: 12,
                      padding: '9px 12px',
                      cursor: busyKey !== null ? 'default' : 'pointer',
                      opacity: busyKey !== null && !busy ? 0.55 : 1,
                    }}
                  >
                    <Avatar id={c.data.contactGuestId ?? c.data.contactUserId ?? c.recordId} name={c.data.cachedName} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate" style={{ fontSize: 14, fontWeight: 600, color: EV.ink }}>
                        {c.data.cachedName}
                      </div>
                      {c.data.email && (
                        <div className="truncate" style={{ fontSize: 12, color: EV.ink45 }}>
                          {c.data.email}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: busy ? EV.ink45 : EV.clayDeep }}>
                      {busy ? 'Adding…' : 'Add'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3" style={{ marginTop: contacts.length > 0 ? 2 : 0 }}>
          <div style={{ flex: 1, height: 1, background: EV.line }} />
          <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.06em', color: EV.ink40, textTransform: 'uppercase' }}>
            {contacts.length > 0 ? 'Or add someone new' : 'New friend'}
          </span>
          <div style={{ flex: 1, height: 1, background: EV.line }} />
        </div>

        <div>
          <label style={fieldLabel} htmlFor="af-name">
            Name
          </label>
          <input
            id="af-name"
            className="ev-input"
            style={inputStyle}
            value={name}
            autoFocus
            placeholder="Alex Rivera"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createFriend('new', { name, email })
            }}
          />
        </div>

        <div>
          <label style={fieldLabel} htmlFor="af-email">
            Email <span style={{ fontWeight: 500, color: EV.ink40 }}>(optional)</span>
          </label>
          <input
            id="af-email"
            type="email"
            className="ev-input"
            style={inputStyle}
            value={email}
            placeholder="alex@example.com"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createFriend('new', { name, email })
            }}
          />
        </div>

        {error && (
          <p
            role="alert"
            style={{
              fontSize: 13,
              color: EV.clayDeep,
              background: EV.badgeBg,
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
