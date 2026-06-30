/**
 * ProfileSettings -- the account screen (CONTRACT §3.12).
 *
 * Edit your identity (name, avatar), your default currency, the payment handles
 * co-members use to pay you back, and your notification preferences. Saving calls
 * the privileged `updateProfile` action, which writes the `users` row and
 * re-stamps the shared identity onto every group you're in. Plus the account
 * (sign out) and an open-source / version block.
 *
 * One coherent warm form across phone and desktop: a centered editorial column of
 * grouped cards, with a save bar that surfaces only when there's something to save.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { signOut, useAuth, useR2Files, useUser } from 'deepspace'
import { safeUrl } from '../../lib/util/safeUrl'
import {
  Avatar,
  Button,
  CameraIcon,
  CheckIcon,
  CloseIcon,
  EV,
  EqualsMark,
  HeartIcon,
  SectionLabel,
  Surface,
} from '../../design'
import { useProfile } from '../../hooks'
import type { NotifyPrefs, PaymentHandles } from '../../lib/data/types'
import { CURRENCIES, Field, fieldLabelStyle, SelectField, Toggle } from './controls'
import { downscaleAvatar, updateProfile } from './api'

const APP_VERSION = '0.0.1'

const DEFAULT_PREFS: NotifyPrefs = {
  added: true,
  settled: true,
  comments: true,
  reminders: true,
  weekly: false,
}

interface HandleDraft {
  venmo: string
  paypalMe: string
  cashtag: string
  upiId: string
}

interface Draft {
  displayName: string
  avatarUrl: string | null
  defaultCurrency: string
  handles: HandleDraft
  prefs: NotifyPrefs
}

const emptyHandles: HandleDraft = { venmo: '', paypalMe: '', cashtag: '', upiId: '' }

function handlesToDraft(h: PaymentHandles | null | undefined): HandleDraft {
  return {
    venmo: h?.venmo ?? '',
    paypalMe: h?.paypalMe ?? '',
    cashtag: h?.cashtag ?? '',
    upiId: h?.upiId ?? '',
  }
}

function draftToHandles(h: HandleDraft): PaymentHandles | null {
  const out: PaymentHandles = {}
  if (h.venmo.trim()) out.venmo = h.venmo.trim()
  if (h.paypalMe.trim()) out.paypalMe = h.paypalMe.trim()
  if (h.cashtag.trim()) out.cashtag = h.cashtag.trim()
  if (h.upiId.trim()) out.upiId = h.upiId.trim()
  return Object.keys(out).length ? out : null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function ProfileSettings() {
  const { userId } = useAuth()
  const { user } = useUser()
  const { record: profile, status } = useProfile()
  const { upload } = useR2Files({ scope: 'app' })

  const [draft, setDraft] = useState<Draft | null>(null)
  const [baseline, setBaseline] = useState<Draft | null>(null)
  const seeded = useRef(false)

  const [save, setSave] = useState<SaveState>('idle')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Seed the form once the profile resolves. Only this screen edits this row, so
  // a single seed is correct -- after a save we re-baseline to clear "dirty".
  useEffect(() => {
    if (seeded.current || status === 'loading') return
    const d: Draft = {
      displayName: profile?.data.displayName ?? user?.name ?? '',
      avatarUrl: profile?.data.avatarUrl ?? null,
      defaultCurrency: profile?.data.defaultCurrency ?? 'USD',
      handles: handlesToDraft(profile?.data.paymentHandles),
      prefs: profile?.data.notifyPrefs ?? DEFAULT_PREFS,
    }
    setDraft(d)
    setBaseline(d)
    seeded.current = true
  }, [profile, user, status])

  const dirty = useMemo(
    () => (draft && baseline ? JSON.stringify(draft) !== JSON.stringify(baseline) : false),
    [draft, baseline],
  )

  function patch(p: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
    setSave('idle')
    setSaveMsg(null)
  }
  function patchHandle(k: keyof HandleDraft, v: string) {
    setDraft((d) => (d ? { ...d, handles: { ...d.handles, [k]: v } } : d))
    setSave('idle')
    setSaveMsg(null)
  }
  function patchPref(k: keyof NotifyPrefs, v: boolean) {
    setDraft((d) => (d ? { ...d, prefs: { ...d.prefs, [k]: v } } : d))
    setSave('idle')
    setSaveMsg(null)
  }

  async function onPickAvatar(file: File) {
    setUploading(true)
    setError(null)
    try {
      const blob = await downscaleAvatar(file)
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const up = await upload(blob, `avatars/${userId ?? 'me'}-${Date.now()}.${ext}`)
      if (up.success && up.url) {
        patch({ avatarUrl: up.url })
      } else {
        setError(up.error ?? 'Could not upload that photo. Please try another.')
      }
    } catch {
      setError('Could not process that photo. Please try another.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onSave() {
    if (!draft || !dirty || save === 'saving') return
    const name = draft.displayName.trim()
    if (!name) {
      setError('Your name cannot be empty.')
      return
    }
    setSave('saving')
    setError(null)
    setSaveMsg(null)
    const res = await updateProfile({
      displayName: name,
      avatarUrl: draft.avatarUrl,
      defaultCurrency: draft.defaultCurrency,
      paymentHandles: draftToHandles(draft.handles),
      notifyPrefs: draft.prefs,
    })
    if (res.success) {
      setBaseline({ ...draft, displayName: name })
      setSave('saved')
      const n = res.data?.restamped ?? 0
      setSaveMsg(n > 0 ? `Saved. Updated your details across ${n} ${n === 1 ? 'group' : 'groups'}.` : 'Saved.')
    } else {
      setSave('error')
      setError(res.error ?? 'Could not save your changes. Please try again.')
    }
  }

  function onDiscard() {
    if (baseline) setDraft(baseline)
    setSave('idle')
    setSaveMsg(null)
    setError(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-9 lg:px-10 lg:py-12" style={{ maxWidth: 760, paddingBottom: 120 }}>
        <header>
          <SectionLabel>Profile and settings</SectionLabel>
          <h1
            style={{
              fontFamily: EV.fontDisplay,
              fontSize: 'clamp(28px, 4vw, 36px)',
              fontWeight: 500,
              letterSpacing: '-0.02em',
              color: EV.ink,
              marginTop: 8,
            }}
          >
            Your account
          </h1>
        </header>

        {!draft ? (
          <FormSkeleton />
        ) : (
          <div className="flex flex-col" style={{ gap: 18, marginTop: 28 }}>
            {/* ---- profile ---- */}
            <SettingsCard title="Profile">
              <div className="flex flex-col sm:flex-row sm:items-start" style={{ gap: 20 }}>
                <AvatarUploader
                  url={draft.avatarUrl}
                  id={userId ?? undefined}
                  name={draft.displayName || user?.name || 'You'}
                  uploading={uploading}
                  onPick={() => fileRef.current?.click()}
                  onRemove={draft.avatarUrl ? () => patch({ avatarUrl: null }) : undefined}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void onPickAvatar(f)
                  }}
                />

                <div className="flex-1 flex flex-col" style={{ gap: 16, minWidth: 0 }}>
                  <Field
                    id="pf-name"
                    label="Display name"
                    value={draft.displayName}
                    placeholder="Your name"
                    onChange={(v) => patch({ displayName: v })}
                    hint="Shown to the people you split with."
                    autoComplete="name"
                  />
                  <SelectField
                    id="pf-currency"
                    label="Default currency"
                    value={draft.defaultCurrency}
                    onChange={(v) => patch({ defaultCurrency: v })}
                    hint="Used for your overall total and to seed new groups."
                  >
                    {CURRENCIES.map(([code, label]) => (
                      <option key={code} value={code}>
                        {code} · {label}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>
            </SettingsCard>

            {/* ---- payment handles ---- */}
            <SettingsCard
              title="Payment handles"
              caption="Add a handle and it becomes a one-tap pay button for the people you owe. Each is optional, and is shared with your co-members so they can settle up with you."
            >
              <div className="grid sm:grid-cols-2" style={{ gap: 16 }}>
                <Field
                  id="pf-venmo"
                  label="Venmo"
                  prefix="@"
                  value={draft.handles.venmo}
                  placeholder="username"
                  onChange={(v) => patchHandle('venmo', v.replace(/^@/, ''))}
                />
                <Field
                  id="pf-cashapp"
                  label="Cash App"
                  prefix="$"
                  value={draft.handles.cashtag}
                  placeholder="cashtag"
                  onChange={(v) => patchHandle('cashtag', v.replace(/^\$/, ''))}
                />
                <Field
                  id="pf-paypal"
                  label="PayPal.Me"
                  value={draft.handles.paypalMe}
                  placeholder="paypal.me/username"
                  onChange={(v) => patchHandle('paypalMe', v)}
                  inputMode="url"
                />
                <Field
                  id="pf-upi"
                  label="UPI ID"
                  value={draft.handles.upiId}
                  placeholder="name@bank"
                  onChange={(v) => patchHandle('upiId', v)}
                />
              </div>
            </SettingsCard>

            {/* ---- notifications ---- */}
            <SettingsCard
              title="Notifications"
              caption="Choose what Evenly tells you about. Email reaches you for reminders and the weekly summary."
            >
              <div className="flex flex-col" style={{ gap: 6 }}>
                <Toggle
                  label="Added to an expense"
                  description="When someone splits a cost that includes you."
                  checked={draft.prefs.added}
                  onChange={(v) => patchPref('added', v)}
                />
                <Divider />
                <Toggle
                  label="Settlements"
                  description="When a payment to or from you is recorded."
                  checked={draft.prefs.settled}
                  onChange={(v) => patchPref('settled', v)}
                />
                <Divider />
                <Toggle
                  label="Comments"
                  description="Replies on expenses you are part of."
                  checked={draft.prefs.comments}
                  onChange={(v) => patchPref('comments', v)}
                />
                <Divider />
                <Toggle
                  label="Reminders"
                  description="Nudges to settle up an outstanding balance."
                  checked={draft.prefs.reminders}
                  onChange={(v) => patchPref('reminders', v)}
                />
                <Divider />
                <Toggle
                  label="Weekly summary"
                  description="A Monday digest of where everyone stands."
                  checked={draft.prefs.weekly}
                  onChange={(v) => patchPref('weekly', v)}
                />
              </div>
            </SettingsCard>

            {/* ---- account ---- */}
            <SettingsCard title="Account">
              <div
                className="flex items-center justify-between"
                style={{ gap: 16, flexWrap: 'wrap' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={fieldLabelStyle}>Signed in as</div>
                  <div className="truncate" style={{ fontSize: 14.5, fontWeight: 500, color: EV.ink }}>
                    {user?.email ?? user?.name ?? 'Your account'}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<CloseIcon size={15} />}
                  onClick={() => signOut()}
                >
                  Sign out
                </Button>
              </div>
            </SettingsCard>

            {/* ---- about ---- */}
            <AboutBlock />
          </div>
        )}
      </div>

      {/* ---- save bar ---- */}
      {draft && (dirty || save === 'saved' || error) && (
        <SaveBar
          dirty={dirty}
          save={save}
          message={error ?? saveMsg}
          isError={Boolean(error)}
          onSave={onSave}
          onDiscard={onDiscard}
        />
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- pieces */

function SettingsCard({
  title,
  caption,
  children,
}: {
  title: string
  caption?: string
  children: ReactNode
}) {
  return (
    <section>
      <SectionLabel style={{ marginBottom: caption ? 8 : 12 }}>{title}</SectionLabel>
      {caption && (
        <p style={{ fontSize: 13, color: EV.ink55, marginBottom: 14, lineHeight: 1.55, maxWidth: 560 }}>
          {caption}
        </p>
      )}
      <Surface variant="card" style={{ padding: 20, boxShadow: 'var(--ev-shadow-soft)' }}>
        {children}
      </Surface>
    </section>
  )
}

function Divider() {
  return <div style={{ height: 1, background: EV.line, margin: '2px 0' }} />
}

function AvatarUploader({
  url,
  id,
  name,
  uploading,
  onPick,
  onRemove,
}: {
  url: string | null
  id?: string
  name: string
  uploading: boolean
  onPick: () => void
  onRemove?: () => void
}) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 10 }}>
      <button
        type="button"
        onClick={onPick}
        aria-label="Change your photo"
        className="ev-pressable"
        style={{
          position: 'relative',
          width: 84,
          height: 84,
          borderRadius: '50%',
          border: 'none',
          padding: 0,
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        {safeUrl(url, { image: true }) ? (
          <img
            src={safeUrl(url, { image: true })}
            alt=""
            width={84}
            height={84}
            style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Avatar id={id} name={name} size={84} />
        )}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: EV.surface,
            border: `2px solid ${EV.paper}`,
            boxShadow: 'var(--ev-shadow-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: EV.ink70,
          }}
        >
          <CameraIcon size={15} />
        </span>
        {uploading && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'rgba(58,53,47,0.42)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Uploading…
          </span>
        )}
      </button>
      {onRemove && !uploading && (
        <button
          type="button"
          onClick={onRemove}
          className="ev-pressable"
          style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: EV.ink50, cursor: 'pointer' }}
        >
          Remove
        </button>
      )}
    </div>
  )
}

function AboutBlock() {
  return (
    <section>
      <SectionLabel style={{ marginBottom: 12 }}>About</SectionLabel>
      <Surface variant="card" style={{ padding: 20, boxShadow: 'var(--ev-shadow-soft)' }}>
        <div className="flex items-center" style={{ gap: 14 }}>
          <span
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: EV.tileHoney,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <EqualsMark size={24} bg="transparent" markColor={EV.honey} markStroke={2.6} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 600, color: EV.ink }}>Evenly</div>
            <div style={{ fontSize: 12.5, color: EV.ink55, marginTop: 1 }}>
              A free, open-source bill splitter · v{APP_VERSION}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: EV.ink55, marginTop: 14, lineHeight: 1.6 }}>
          Scan a receipt, split it fairly, and settle up across currencies. Released under the MIT
          license, so you can read the source, self-host it, or make it your own.
        </p>
        <div className="flex items-center" style={{ gap: 6, marginTop: 14, fontSize: 12.5, color: EV.ink50 }}>
          <HeartIcon size={14} style={{ color: EV.clay }} />
          Built on DeepSpace.
        </div>
      </Surface>
    </section>
  )
}

function SaveBar({
  dirty,
  save,
  message,
  isError,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  save: SaveState
  message: string | null
  isError: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  const saving = save === 'saving'
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        background: 'color-mix(in srgb, var(--ev-paper) 86%, transparent)',
        backdropFilter: 'blur(10px)',
        borderTop: `1px solid ${EV.line}`,
      }}
    >
      <div
        className="mx-auto w-full flex items-center px-6 lg:px-10"
        style={{ maxWidth: 760, gap: 14, padding: '12px 24px', minHeight: 60 }}
      >
        <span
          className="flex-1 truncate"
          style={{
            fontSize: 13,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            color: isError ? EV.clayDeep : save === 'saved' ? EV.sageDeep : EV.ink55,
          }}
        >
          {save === 'saved' && !isError && <CheckIcon size={15} strokeWidth={2.6} />}
          {message ?? (dirty ? 'You have unsaved changes.' : '')}
        </span>
        {dirty && (
          <Button variant="quiet" size="sm" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className="flex flex-col" style={{ gap: 18, marginTop: 28 }}>
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div style={{ width: 90, height: 11, borderRadius: 6, background: EV.fillGhost }} />
          <div
            style={{
              marginTop: 12,
              height: i === 0 ? 150 : 120,
              borderRadius: 16,
              background: EV.surface,
              boxShadow: 'var(--ev-shadow-soft)',
            }}
          />
        </div>
      ))}
    </div>
  )
}
