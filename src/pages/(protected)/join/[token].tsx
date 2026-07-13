/**
 * Join via invite link (`/join/:token`).
 *
 * A friend who was handed the group's shareable link lands here. The (protected)
 * layout's AuthGate makes them sign in or sign up first, so by the time this
 * renders the caller has a verified identity. We resolve the token to the group's
 * roster (names only, no balances) and let them either claim an existing placeholder
 * ("who are you?") or join as someone new. On success we route into the group; the
 * guest-claim rewrite carries that placeholder's expenses and balance onto them.
 *
 * Standalone by design: it lives outside `(protected)/app/`, so it does NOT get the
 * app shell — just a focused, on-brand join card.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from 'deepspace'
import { Avatar, Button, CheckIcon, EV, EqualsMark, Logo, useToast } from '../../../design'
import { acceptInvite, resolveInvite, type InviteResolution } from '../../../components/invite'

type Selection = string | 'new'

export default function JoinPage() {
  const { token } = useParams()
  const { userId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [phase, setPhase] = useState<'resolving' | 'ready' | 'error'>('resolving')
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<InviteResolution | null>(null)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [joining, setJoining] = useState(false)

  // Resolve the token -> group + roster.
  useEffect(() => {
    if (!token) {
      setError('This invite link is missing its code.')
      setPhase('error')
      return
    }
    let alive = true
    setPhase('resolving')
    void resolveInvite(token).then((r) => {
      if (!alive) return
      if (r.success && r.data) {
        setRes(r.data)
        setPhase('ready')
      } else {
        setError(r.error ?? 'This invite link is invalid or has been turned off.')
        setPhase('error')
      }
    })
    return () => {
      alive = false
    }
  }, [token])

  // Already in the group -> go straight in.
  useEffect(() => {
    if (res?.alreadyMember) navigate(`/app/g/${res.groupId}`, { replace: true })
  }, [res, navigate])

  async function join() {
    if (!token || joining || !selected) return
    setJoining(true)
    const r = await acceptInvite(token, selected)
    if (r.success && r.data) {
      if (r.data.pending) {
        toast.success('You are joining', 'The group will show up in a moment.')
        navigate('/app', { replace: true })
      } else {
        navigate(`/app/g/${r.data.groupId}`, { replace: true })
      }
      return
    }
    setJoining(false)
    toast.error('Could not join', r.error ?? 'Please try again.')
    // The slot may have just been taken; refresh the roster so it locks.
    if (token) void resolveInvite(token).then((rr) => rr.success && rr.data && setRes(rr.data))
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: EV.paper, color: EV.ink }}>
      <div className="mx-auto w-full px-6 py-10" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
          <Logo size="sm" />
        </div>

        {phase === 'resolving' && <JoinSkeleton />}

        {phase === 'error' && (
          <Panel>
            <div style={{ display: 'grid', placeItems: 'center', gap: 14, textAlign: 'center', padding: '10px 0' }}>
              <EqualsMark size={48} radius={15} bg={EV.badgeBg} markColor={EV.clayDeep} markStroke={2.4} />
              <div>
                <h1 style={{ fontFamily: EV.fontDisplay, fontSize: 22, fontWeight: 500, color: EV.ink }}>
                  This invite can't be opened
                </h1>
                <p style={{ fontSize: 14, color: EV.ink55, marginTop: 6, lineHeight: 1.5 }}>{error}</p>
              </div>
              <Button variant="secondary" onClick={() => navigate('/app', { replace: true })}>
                Go to Evenly
              </Button>
            </div>
          </Panel>
        )}

        {phase === 'ready' && res && !res.alreadyMember && (
          <Panel>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: EV.ink45 }}>
                You're invited to
              </div>
              <h1
                style={{
                  fontFamily: EV.fontDisplay,
                  fontSize: 'clamp(26px, 6vw, 32px)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: EV.ink,
                  marginTop: 5,
                }}
              >
                {res.groupName}
              </h1>
              <p style={{ fontSize: 13.5, color: EV.ink55, marginTop: 6 }}>
                {res.memberCount} {res.memberCount === 1 ? 'person' : 'people'} so far. Which one are you?
              </p>
            </div>

            <div role="radiogroup" aria-label="Who are you?" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {res.roster.map((slot, i) =>
                slot.claimable && slot.guestId ? (
                  <PickRow
                    key={slot.guestId}
                    id={slot.guestId}
                    name={slot.displayName}
                    selected={selected === slot.guestId}
                    onSelect={() => setSelected(slot.guestId as string)}
                  />
                ) : (
                  <LockedRow key={`claimed-${i}`} id={slot.displayName} name={slot.displayName} />
                ),
              )}

              <div style={{ height: 1, background: EV.line, margin: '6px 2px' }} />

              <PickRow
                id="new-member"
                name="I'm someone new"
                subtitle="Join and start adding your own expenses"
                isNew
                selected={selected === 'new'}
                onSelect={() => setSelected('new')}
              />
            </div>

            <Button
              fullWidth
              size="lg"
              disabled={!selected || joining}
              onClick={join}
              style={{ marginTop: 20 }}
            >
              {joining ? 'Joining…' : selected === 'new' ? 'Join the group' : 'This is me'}
            </Button>

            <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
              Signed in as you. Pick the person you are so their share of the expenses becomes yours.
            </p>
          </Panel>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- primitives */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: EV.surface, borderRadius: 22, boxShadow: 'var(--ev-shadow-soft)', padding: 24 }}>
      {children}
    </div>
  )
}

function PickRow({
  id,
  name,
  subtitle,
  selected,
  onSelect,
  isNew = false,
}: {
  id: string
  name: string
  subtitle?: string
  selected: boolean
  onSelect: () => void
  isNew?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="ev-pressable"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 14,
        padding: '11px 12px',
        background: selected ? EV.tileHoney : EV.fillGhost,
        border: `1.5px solid ${selected ? EV.honey : 'transparent'}`,
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      {isNew ? (
        <span
          style={{ width: 40, height: 40, borderRadius: 999, background: EV.surface, color: EV.ink55, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 500, flexShrink: 0 }}
          aria-hidden="true"
        >
          +
        </span>
      ) : (
        <Avatar id={id} name={name} size={40} />
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: EV.ink }}>{name}</span>
        {subtitle && <span style={{ display: 'block', fontSize: 12.5, color: EV.ink55, marginTop: 1 }}>{subtitle}</span>}
      </span>
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          background: selected ? EV.honey : 'transparent',
          border: `1.5px solid ${selected ? EV.honey : EV.line}`,
          color: '#fff',
        }}
      >
        {selected && <CheckIcon size={13} strokeWidth={3} />}
      </span>
    </button>
  )
}

function LockedRow({ id, name }: { id: string; name: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        borderRadius: 14,
        padding: '11px 12px',
        opacity: 0.55,
      }}
    >
      <Avatar id={id} name={name} size={40} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: EV.ink }}>{name}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: EV.ink45 }}>Joined</span>
    </div>
  )
}

function JoinSkeleton() {
  return (
    <div style={{ background: EV.surface, borderRadius: 22, boxShadow: 'var(--ev-shadow-soft)', padding: 24 }}>
      <div style={{ height: 14, width: 120, borderRadius: 6, background: EV.fillGhost, margin: '0 auto' }} />
      <div style={{ height: 30, width: 200, borderRadius: 8, background: EV.fillGhost, margin: '12px auto 0' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 62, borderRadius: 14, background: EV.fillGhost }} />
        ))}
      </div>
    </div>
  )
}
