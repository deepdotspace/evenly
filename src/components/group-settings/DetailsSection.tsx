/**
 * Group details (CONTRACT §3.14, §1.5, §7 A4) — name, preset icon, cover color,
 * cover image (R2 scope:'app', client-downscaled), primary currency, the group
 * simplify-debts default (the per-view toggle stays personal, R3), and the
 * remembered default split. Admin-gated: members see the same surface read-only.
 *
 * One draft, one Save — only changed fields are sent to `updateGroup`. The cover
 * image uploads on pick (so its key is ready) and persists on Save with the rest.
 */

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, EV, useToast } from '../../design'
import { safeUrl } from '../../lib/util/safeUrl'
import { GROUP_ICONS, ImageIcon, TrashIcon } from './icons'
import { Card, Notice, controlStyle, fieldLabel } from './kit'
import { downscaleImage } from './image'
import { updateGroup, type GroupSettingsData } from './api'

/** R2 upload + URL resolution, passed in from `useR2Files({ scope: 'app' })`. */
export type UploadFn = (
  file: File | Blob,
  name?: string,
) => Promise<{ success: boolean; key?: string; url?: string; error?: string }>
export type GetUrlFn = (key: string) => string

const CURRENCIES: [string, string][] = [
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
]

/** Soft, on-brand cover swatches (pastels, never dark + saturated). */
const COVER_COLORS = ['#E2725B', '#9CAF88', '#C79A4E', '#D8C4D0', '#C4D2D2', '#DCC8AC', '#E6C9C0', '#CBD3C0']

interface Draft {
  name: string
  icon: string | null
  coverColor: string | null
  coverImageKey: string | null
  primaryCurrency: string
  simplifyDefault: boolean
  clearDefaultSplit: boolean
}

function toDraft(g: GroupSettingsData): Draft {
  return {
    name: g.name ?? '',
    icon: g.icon ?? null,
    coverColor: g.coverColor ?? null,
    coverImageKey: g.coverImageKey ?? null,
    primaryCurrency: g.primaryCurrency ?? 'USD',
    simplifyDefault: g.simplifyDefault === true || g.simplifyDefault === 1,
    clearDefaultSplit: false,
  }
}

export function DetailsSection({
  groupId,
  group,
  isAdmin,
  upload,
  getUrl,
}: {
  groupId: string
  group: GroupSettingsData
  isAdmin: boolean
  upload: UploadFn
  getUrl: GetUrlFn
}) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const baseline = useMemo(() => toDraft(group), [group])
  const [draft, setDraft] = useState<Draft>(baseline)
  const [coverUrl, setCoverUrl] = useState<string | null>(
    group.coverImageKey ? getUrl(group.coverImageKey) : null,
  )
  const [seededId, setSeededId] = useState(groupId)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset the draft when navigating to a different group.
  if (seededId !== groupId) {
    setSeededId(groupId)
    setDraft(baseline)
    setCoverUrl(group.coverImageKey ? getUrl(group.coverImageKey) : null)
  }

  const hasDefaultSplit = !!group.defaultSplit && !draft.clearDefaultSplit

  const dirty =
    draft.name.trim() !== baseline.name.trim() ||
    draft.icon !== baseline.icon ||
    draft.coverColor !== baseline.coverColor ||
    draft.coverImageKey !== baseline.coverImageKey ||
    draft.primaryCurrency !== baseline.primaryCurrency ||
    draft.simplifyDefault !== baseline.simplifyDefault ||
    draft.clearDefaultSplit

  const nameValid = draft.name.trim().length > 0
  const canSave = isAdmin && dirty && nameValid && !saving && !uploading

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (!isAdmin) return
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function onPickCover(file: File | undefined) {
    if (!file || !isAdmin) return
    setUploading(true)
    try {
      const blob = await downscaleImage(file, 1280, 0.82)
      const res = await upload(blob, `groups/${groupId}/cover-${Date.now()}.jpg`)
      if (res.success && res.key) {
        setDraft((d) => ({ ...d, coverImageKey: res.key as string }))
        setCoverUrl(res.url ?? getUrl(res.key))
      } else {
        toast.error('Upload failed', res.error ?? 'Could not upload the cover image.')
      }
    } catch {
      toast.error('Upload failed', 'Could not process that image.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function removeCover() {
    if (!isAdmin) return
    setDraft((d) => ({ ...d, coverImageKey: null }))
    setCoverUrl(null)
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    const input: Parameters<typeof updateGroup>[0] = { groupId }
    if (draft.name.trim() !== baseline.name.trim()) input.name = draft.name.trim()
    if (draft.icon !== baseline.icon) input.icon = draft.icon
    if (draft.coverColor !== baseline.coverColor) input.coverColor = draft.coverColor
    if (draft.coverImageKey !== baseline.coverImageKey) input.coverImageKey = draft.coverImageKey
    if (draft.primaryCurrency !== baseline.primaryCurrency) input.primaryCurrency = draft.primaryCurrency
    if (draft.simplifyDefault !== baseline.simplifyDefault) input.simplifyDefault = draft.simplifyDefault
    if (draft.clearDefaultSplit) input.defaultSplit = null

    const res = await updateGroup(input)
    setSaving(false)
    if (res.success) {
      toast.success('Saved', 'Group details updated.')
      setDraft((d) => ({ ...d, clearDefaultSplit: false }))
    } else {
      toast.error('Could not save', res.error ?? 'Please try again.')
    }
  }

  function discard() {
    setDraft(baseline)
    setCoverUrl(group.coverImageKey ? getUrl(group.coverImageKey) : null)
  }

  return (
    <Card title="Group details" subtitle={isAdmin ? undefined : 'Only an admin can change these.'}>
      <div className="flex flex-col" style={{ gap: 22 }}>
        {/* name */}
        <div>
          <label style={fieldLabel} htmlFor="gs-name">
            Group name
          </label>
          <input
            id="gs-name"
            className="ev-input"
            style={{ ...controlStyle, opacity: isAdmin ? 1 : 0.7 }}
            value={draft.name}
            disabled={!isAdmin}
            placeholder="Italy 2026, Apartment 4B…"
            onChange={(e) => patch('name', e.target.value)}
          />
          {isAdmin && !nameValid && (
            <p style={{ fontSize: 12, color: EV.clayDeep, marginTop: 6 }}>A group needs a name.</p>
          )}
        </div>

        {/* icon */}
        <div>
          <label style={fieldLabel}>Icon</label>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            <IconTileButton
              selected={!draft.icon}
              disabled={!isAdmin}
              onClick={() => patch('icon', null)}
              label="None"
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: EV.ink45 }}>–</span>
            </IconTileButton>
            {GROUP_ICONS.map(({ id, label, Comp }) => (
              <IconTileButton
                key={id}
                selected={draft.icon === id}
                disabled={!isAdmin}
                onClick={() => patch('icon', id)}
                label={label}
              >
                <Comp size={20} />
              </IconTileButton>
            ))}
          </div>
        </div>

        {/* cover color */}
        <div>
          <label style={fieldLabel}>Cover color</label>
          <div className="flex flex-wrap items-center" style={{ gap: 9 }}>
            <Swatch
              selected={!draft.coverColor}
              disabled={!isAdmin}
              onClick={() => patch('coverColor', null)}
              color="transparent"
              none
            />
            {COVER_COLORS.map((c) => (
              <Swatch
                key={c}
                selected={draft.coverColor === c}
                disabled={!isAdmin}
                onClick={() => patch('coverColor', c)}
                color={c}
              />
            ))}
          </div>
        </div>

        {/* cover image */}
        <div>
          <label style={fieldLabel}>Cover image</label>
          {coverUrl ? (
            <div
              style={{
                position: 'relative',
                borderRadius: 14,
                overflow: 'hidden',
                aspectRatio: '16 / 7',
                background: EV.fillGhost,
                boxShadow: `inset 0 0 0 1px ${EV.borderGhost}`,
              }}
            >
              <img
                src={safeUrl(coverUrl, { image: true })}
                alt="Group cover"
                referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {isAdmin && (
                <button
                  type="button"
                  onClick={removeCover}
                  aria-label="Remove cover image"
                  className="ev-pressable"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    borderRadius: 999,
                    padding: '7px 11px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: EV.ink,
                    background: 'rgba(255,253,248,0.92)',
                    boxShadow: 'var(--ev-shadow-soft)',
                    cursor: 'pointer',
                  }}
                >
                  <TrashIcon size={15} />
                  Remove
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={!isAdmin || uploading}
              onClick={() => fileRef.current?.click()}
              className="ev-pressable"
              style={{
                width: '100%',
                aspectRatio: '16 / 7',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 14,
                border: `1px dashed ${EV.dash}`,
                background: EV.paper,
                color: EV.ink45,
                cursor: isAdmin ? 'pointer' : 'default',
              }}
            >
              <ImageIcon size={24} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {uploading ? 'Uploading…' : isAdmin ? 'Add a cover photo' : 'No cover photo'}
              </span>
              {isAdmin && !uploading && (
                <span style={{ fontSize: 11.5, color: EV.ink40 }}>Downscaled before upload</span>
              )}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPickCover(e.target.files?.[0])}
          />
        </div>

        {/* primary currency */}
        <div>
          <label style={fieldLabel} htmlFor="gs-currency">
            Primary currency
          </label>
          <select
            id="gs-currency"
            className="ev-input"
            style={{ ...controlStyle, cursor: isAdmin ? 'pointer' : 'default', opacity: isAdmin ? 1 : 0.7 }}
            value={draft.primaryCurrency}
            disabled={!isAdmin}
            onChange={(e) => patch('primaryCurrency', e.target.value)}
          >
            {CURRENCIES.map(([code, label]) => (
              <option key={code} value={code}>
                {code} · {label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 6, lineHeight: 1.45 }}>
            Changes display only. Past expenses keep their entry-time conversion rates.
          </p>
        </div>

        {/* simplify default */}
        <Toggle
          label="Simplify debts by default"
          hint="The group's starting view. Each person can still flip Direct / Simplified on settle-up."
          checked={draft.simplifyDefault}
          disabled={!isAdmin}
          onChange={(v) => patch('simplifyDefault', v)}
        />

        {/* default split */}
        {hasDefaultSplit && (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: EV.ink }}>Remembered split</div>
              <p style={{ fontSize: 12.5, color: EV.ink55, marginTop: 2, lineHeight: 1.4 }}>
                New expenses preselect the group's saved split.
              </p>
            </div>
            {isAdmin && (
              <Button variant="secondary" size="sm" onClick={() => patch('clearDefaultSplit', true)}>
                Clear
              </Button>
            )}
          </div>
        )}

        {/* save bar */}
        {isAdmin && dirty && (
          <div
            className="flex items-center justify-end gap-2.5"
            style={{ paddingTop: 6, borderTop: `1px solid ${EV.line}` }}
          >
            <Button variant="quiet" size="sm" onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button size="sm" onClick={save} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        )}

        {!isAdmin && (
          <Notice>You can view these settings. Ask a group admin to make changes.</Notice>
        )}
      </div>
    </Card>
  )
}

/* ----------------------------------------------------------------- controls */

function IconTileButton({
  selected,
  disabled,
  onClick,
  label,
  children,
}: {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  children: ReactNode
}) {
  const base: CSSProperties = {
    width: 46,
    height: 46,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    cursor: disabled ? 'default' : 'pointer',
    background: selected ? EV.tileWarm : EV.fillGhost,
    color: selected ? EV.clayDeep : EV.ink55,
    border: `1.5px solid ${selected ? EV.clay : 'transparent'}`,
    transition: 'background 120ms ease, border-color 120ms ease',
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={disabled ? undefined : 'ev-pressable'}
      style={base}
    >
      {children}
    </button>
  )
}

function Swatch({
  selected,
  disabled,
  onClick,
  color,
  none,
}: {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  color: string
  none?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={none ? 'No cover color' : `Cover color ${color}`}
      aria-pressed={selected}
      className={disabled ? undefined : 'ev-pressable'}
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        cursor: disabled ? 'default' : 'pointer',
        background: none ? EV.paper : color,
        border: none ? `1.5px dashed ${EV.dash}` : '1.5px solid rgba(0,0,0,0.06)',
        boxShadow: selected ? `0 0 0 2px var(--ev-surface), 0 0 0 4px ${EV.ink}` : undefined,
        position: 'relative',
      }}
    >
      {none && (
        <span style={{ fontSize: 13, fontWeight: 700, color: EV.ink40, lineHeight: 1 }}>–</span>
      )}
    </button>
  )
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: EV.ink }}>{label}</div>
        {hint && <p style={{ fontSize: 12.5, color: EV.ink55, marginTop: 2, lineHeight: 1.45 }}>{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={disabled ? undefined : 'ev-pressable'}
        style={{
          flexShrink: 0,
          width: 46,
          height: 28,
          borderRadius: 999,
          border: 'none',
          padding: 3,
          cursor: disabled ? 'default' : 'pointer',
          background: checked ? EV.sage : EV.trackStrong,
          opacity: disabled ? 0.55 : 1,
          transition: 'background 140ms ease',
          display: 'flex',
          justifyContent: checked ? 'flex-end' : 'flex-start',
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: EV.surface,
            boxShadow: 'var(--ev-shadow-soft)',
            transition: 'all 140ms ease',
          }}
        />
      </button>
    </div>
  )
}
