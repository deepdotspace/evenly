/**
 * CreateGroupModal — the "new group" flow (CONTRACT §3.3).
 *
 * Collects a name, a primary currency, and optional guest participants, then
 * calls the privileged `createGroup` server action (membership writes never go
 * through client `put`, D5). On success it routes straight into the new group.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthToken } from 'deepspace'
import {
  Avatar,
  Button,
  EV,
  CloseIcon,
  PlusIcon,
  Sheet,
} from '../../design'
import { useProfile } from '../../hooks'

interface GuestSeed {
  guestId: string
  displayName: string
}

const CURRENCIES = [
  ['USD', 'US Dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'British Pound'],
  ['JPY', 'Japanese Yen'],
  ['CAD', 'Canadian Dollar'],
  ['AUD', 'Australian Dollar'],
  ['INR', 'Indian Rupee'],
  ['MXN', 'Mexican Peso'],
  ['BRL', 'Brazilian Real'],
  ['CHF', 'Swiss Franc'],
  ['CNY', 'Chinese Yuan'],
  ['KRW', 'Korean Won'],
] as const

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

export function CreateGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { record: profile } = useProfile()
  const defaultCurrency = profile?.data.defaultCurrency ?? 'USD'

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [guests, setGuests] = useState<GuestSeed[]>([])
  const [guestDraft, setGuestDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset the form whenever it (re)opens; seed currency from the profile.
  useEffect(() => {
    if (open) {
      setName('')
      setCurrency(defaultCurrency)
      setGuests([])
      setGuestDraft('')
      setError(null)
      setSubmitting(false)
    }
  }, [open, defaultCurrency])

  function addGuest() {
    const n = guestDraft.trim()
    if (!n) return
    if (guests.some((g) => g.displayName.toLowerCase() === n.toLowerCase())) {
      setGuestDraft('')
      return
    }
    setGuests((g) => [...g, { guestId: newGuestId(), displayName: n }])
    setGuestDraft('')
  }

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/actions/createGroup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed, primaryCurrency: currency, kind: 'group', guests }),
      })
      const json = (await res.json()) as {
        success?: boolean
        error?: string
        data?: { groupId?: string }
      }
      if (json.success && json.data?.groupId) {
        onClose()
        navigate(`/app/g/${json.data.groupId}`)
      } else {
        setError(json.error ?? 'Could not create the group. Please try again.')
        setSubmitting(false)
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="modal"
      title="New group"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!name.trim() || submitting}>
            {submitting ? 'Creating…' : 'Create group'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <div>
          <label style={fieldLabel} htmlFor="cg-name">
            Group name
          </label>
          <input
            id="cg-name"
            className="ev-input"
            style={inputStyle}
            value={name}
            autoFocus
            placeholder="Italy 2026, Apartment 4B…"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>

        <div>
          <label style={fieldLabel} htmlFor="cg-currency">
            Primary currency
          </label>
          <select
            id="cg-currency"
            className="ev-input"
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map(([code, label]) => (
              <option key={code} value={code}>
                {code} · {label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 6 }}>
            All balances roll up to this. Foreign expenses are converted at entry-time rates.
          </p>
        </div>

        <div>
          <label style={fieldLabel}>People (optional)</label>
          <p style={{ fontSize: 11.5, color: EV.ink45, marginBottom: 9 }}>
            Add anyone without an account yet as a guest. You can invite them later.
          </p>

          {guests.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2.5">
              {guests.map((g) => (
                <span
                  key={g.guestId}
                  className="inline-flex items-center gap-1.5"
                  style={{
                    background: EV.fillGhost,
                    borderRadius: 999,
                    padding: '5px 8px 5px 5px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: EV.ink,
                  }}
                >
                  <Avatar id={g.guestId} name={g.displayName} size={22} />
                  {g.displayName}
                  <button
                    type="button"
                    aria-label={`Remove ${g.displayName}`}
                    className="ev-pressable inline-flex"
                    onClick={() => setGuests((gs) => gs.filter((x) => x.guestId !== g.guestId))}
                    style={{ border: 'none', background: 'transparent', color: EV.ink45, padding: 2 }}
                  >
                    <CloseIcon size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              className="ev-input"
              style={inputStyle}
              value={guestDraft}
              placeholder="Add a name"
              onChange={(e) => setGuestDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addGuest()
                }
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<PlusIcon size={16} strokeWidth={2.4} />}
              onClick={addGuest}
              disabled={!guestDraft.trim()}
            >
              Add
            </Button>
          </div>
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
