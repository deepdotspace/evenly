/**
 * RecurringEditor — create / edit a recurring expense (CONTRACT §3.11).
 *
 * Reuses the add-expense brain (`useExpenseForm`) for the TEMPLATE — description,
 * amount, currency, category, payer(s), split type and tax/tip extras run the
 * real split engine for a live, accurate preview, exactly like §3.5 — then adds a
 * cadence picker + start/end dates. Receipts/by-item are intentionally omitted
 * (a template can't scan a receipt each period); FX is snapshotted per occurrence
 * at materialization, so a foreign-currency template never needs a rate up front.
 *
 * On save it builds the `template` ({description,category,currency,amountMinor,
 * paidBy,splitConfig}) from the form's draft and calls createRecurring /
 * updateRecurring.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  Avatar,
  Button,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  EV,
  MoneyText,
  PillTabs,
  PlusIcon,
  SectionLabel,
  Surface,
  categoryIcon,
  formatMoney,
} from '../../design'
import { useFxResolver } from '../../hooks'
import type { MemberId } from '../../lib/split'
import type { Cadence, RecurringExpenseData, RecurringTemplate } from '../../lib/data/types'
import { useExpenseForm, type ExpenseDataWithNote, type ExpenseFormState } from '../expense/useExpenseForm'
import {
  CATEGORIES,
  CURRENCIES,
  callAction,
  msToDateInput,
  toMinorSafe,
  type RosterMember,
  type SplitType,
} from '../expense/shared'
import { Field, GhostChip, MemberToggle, MoneyInput, Select, TextInput, fieldLabel, inputStyle } from '../expense/fields'
import { dayOfMonthUtc, startDateToMs } from './schedule'

/* ------------------------------------------------------------------ props */

export interface RecurringEditorProps {
  mode: 'new' | 'edit'
  groupId: string
  primary: string
  roster: RosterMember[]
  youId: string
  existing?: { id: string; data: RecurringExpenseData } | null
  onDone: () => void
  onCancel: () => void
}

const SPLIT_TABS: { id: SplitType; label: string }[] = [
  { id: 'equal', label: 'Equal' },
  { id: 'exact', label: 'Exact' },
  { id: 'percent', label: '%' },
  { id: 'shares', label: 'Shares' },
  { id: 'treat', label: 'Treat' },
]

function splitTypeLabel(t: SplitType): string {
  switch (t) {
    case 'equal':
      return 'Split equally'
    case 'exact':
      return 'Exact amounts'
    case 'percent':
      return 'By percentage'
    case 'shares':
      return 'By shares'
    case 'treat':
      return 'Treat'
    default:
      return 'Split'
  }
}

/** A recurring template seeds the expense-form brain via a synthetic expense. */
function templateToExpenseData(t: RecurringTemplate, groupId: string): ExpenseDataWithNote {
  return {
    groupId,
    memberIds: [],
    description: t.description,
    category: t.category,
    currency: t.currency,
    amountMinor: t.amountMinor,
    fxRate: 1,
    paidBy: t.paidBy,
    splits: {},
    splitConfig: t.splitConfig,
    receiptId: null,
    isReimbursement: false,
    recurringId: null,
    note: null,
    deletedAt: null,
  }
}

/* ------------------------------------------------------------------- card */

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <Surface variant="card" style={{ padding: '20px 22px', marginTop: 16, ...style }}>
      {children}
    </Surface>
  )
}

/* ------------------------------------------------------------- the editor */

export function RecurringEditor(props: RecurringEditorProps) {
  const { mode, groupId, primary, roster, youId, existing, onDone, onCancel } = props
  const { resolver, fetchedAtMs } = useFxResolver()

  const form = useExpenseForm({
    primary,
    roster,
    youId,
    existing: existing ? { id: existing.id, data: templateToExpenseData(existing.data.template, groupId) } : null,
    receiptSeed: null,
    defaultSplit: null,
    resolver,
    fetchedAtMs,
  })

  // ---- cadence + schedule state ----
  const seedCadence = existing?.data.cadence
  const [unit, setUnit] = useState<Cadence['unit']>(seedCadence?.unit ?? 'month')
  const [intervalStr, setIntervalStr] = useState<string>(String(seedCadence?.interval ?? 1))
  const [startDateStr, setStartDateStr] = useState<string>(
    existing?.data.nextRunAtMs ? msToDateInput(existing.data.nextRunAtMs) : msToDateInput(undefined),
  )
  const [endEnabled, setEndEnabled] = useState<boolean>(!!existing?.data.endsAtMs)
  const [endDateStr, setEndDateStr] = useState<string>(
    existing?.data.endsAtMs ? msToDateInput(existing.data.endsAtMs) : msToDateInput(undefined),
  )

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const interval = Math.max(1, Math.floor(Number.parseInt(intervalStr, 10) || 1))
  const startMs = startDateStr ? startDateToMs(startDateStr) : null
  const endMs = endEnabled && endDateStr ? startDateToMs(endDateStr) : null

  // Template readiness ignores FX (each occurrence snapshots its own rate).
  const templateBlock: string | null =
    form.description.trim().length === 0
      ? 'Add a description'
      : form.amountMinor <= 0
        ? form.splitType === 'byitem'
          ? 'Add an amount'
          : 'Enter an amount'
        : form.preview.error
          ? form.preview.error
          : !form.paidByValid
            ? `Who paid must add up to ${formatMoney(form.amountMinor, form.currency)}`
            : null

  const cadenceBlock: string | null =
    !startMs
      ? 'Pick a start date'
      : endMs != null && endMs < startMs
        ? 'The end date is before the start'
        : null

  const blockReason = templateBlock ?? cadenceBlock
  const canSave = !blockReason

  async function onSubmit() {
    if (!canSave || submitting || !startMs) return
    setSubmitting(true)
    setError(null)

    const draft = form.buildDraft()
    const template: RecurringTemplate = {
      description: draft.description,
      category: draft.category || 'other',
      currency: draft.currency,
      amountMinor: draft.amountMinor,
      paidBy: draft.paidBy,
      splitConfig: draft.splitConfig,
    }
    const cadence: Cadence = {
      unit,
      interval,
      ...(unit === 'month' ? { anchorDay: dayOfMonthUtc(startMs) } : {}),
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    const res =
      mode === 'edit' && existing
        ? await callAction('updateRecurring', {
            recurringId: existing.id,
            patch: { template, cadence, timezone, nextRunAtMs: startMs, endsAtMs: endMs },
          })
        : await callAction('createRecurring', {
            groupId,
            template,
            cadence,
            timezone,
            nextRunAtMs: startMs,
            endsAtMs: endMs,
            active: true,
          })

    if (!res.success) {
      setError(res.error ?? 'Could not save this recurring expense. Please try again.')
      setSubmitting(false)
      return
    }
    onDone()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 680, paddingBottom: 40 }}>
        <button
          type="button"
          onClick={onCancel}
          className="ev-pressable inline-flex items-center gap-1.5"
          style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: EV.ink55, marginBottom: 18, cursor: 'pointer', padding: 0 }}
        >
          <ChevronLeftIcon size={18} />
          Recurring
        </button>

        <h1
          style={{
            fontFamily: EV.fontDisplay,
            fontSize: 'clamp(26px, 4vw, 32px)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: EV.ink,
          }}
        >
          {mode === 'edit' ? 'Edit recurring expense' : 'New recurring expense'}
        </h1>
        <p style={{ fontSize: 14, color: EV.ink55, marginTop: 4, lineHeight: 1.5 }}>
          Set it once and it posts itself on schedule, split the way you choose.
        </p>

        {/* ---- essentials ---- */}
        <Card>
          <Field label="What is it for?" htmlFor="ev-rec-desc" style={{ marginBottom: 16 }}>
            <TextInput
              id="ev-rec-desc"
              value={form.description}
              onChange={form.setDescription}
              placeholder="Rent, Netflix, electricity…"
              autoFocus={!existing}
              style={{ fontSize: 16 }}
            />
          </Field>

          <div className="flex gap-3" style={{ marginBottom: 16 }}>
            <Field label="Amount" style={{ flex: 1.4 }}>
              <MoneyInput value={form.amountStr} onChange={form.setAmountStr} currency={form.currency} ariaLabel="Amount" />
            </Field>
            <Field label="Currency" style={{ flex: 1 }}>
              <CurrencySelect value={form.currency} primary={primary} onChange={form.setCurrency} />
            </Field>
          </div>

          {form.foreign && (
            <p
              style={{
                fontSize: 12,
                color: EV.honey,
                fontWeight: 600,
                background: EV.tileHoney,
                borderRadius: 10,
                padding: '9px 12px',
                marginBottom: 16,
                lineHeight: 1.45,
              }}
            >
              Each posting converts to {primary} at that day&apos;s exchange rate.
            </p>
          )}

          <Field label="Category" style={{ marginBottom: 0 }}>
            <CategoryPicker value={form.category} onChange={form.setCategory} />
          </Field>
        </Card>

        {/* ---- paid by ---- */}
        <Card>
          <SectionLabel style={{ marginBottom: 14 }}>Paid by</SectionLabel>
          <PaidBySection form={form} />
        </Card>

        {/* ---- split ---- */}
        <Card>
          <SectionLabel style={{ marginBottom: 12 }}>How to split</SectionLabel>
          <PillTabs
            fill
            tabs={SPLIT_TABS}
            value={form.splitType}
            onChange={(id) => form.setSplitType(id as SplitType)}
            style={{ marginBottom: 16 }}
          />
          <SplitSection form={form} />
        </Card>

        {/* ---- overhead ---- */}
        <Card>
          <SectionLabel style={{ marginBottom: 12 }}>Tax, tip &amp; extras</SectionLabel>
          <OverheadSection form={form} />
        </Card>

        {/* ---- cadence + schedule ---- */}
        <Card>
          <SectionLabel style={{ marginBottom: 14 }}>Repeat</SectionLabel>
          <div className="flex items-end gap-3" style={{ flexWrap: 'wrap' }}>
            <Field label="Every" style={{ width: 92 }}>
              <input
                className="ev-input"
                inputMode="numeric"
                aria-label="Repeat interval"
                style={{ ...inputStyle, textAlign: 'center' }}
                value={intervalStr}
                onChange={(e) => setIntervalStr(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="1"
              />
            </Field>
            <Field label="Period" style={{ flex: 1, minWidth: 140 }}>
              <Select value={unit} onChange={(v) => setUnit(v as Cadence['unit'])} ariaLabel="Repeat period">
                <option value="day">{interval === 1 ? 'Day' : 'Days'}</option>
                <option value="week">{interval === 1 ? 'Week' : 'Weeks'}</option>
                <option value="month">{interval === 1 ? 'Month' : 'Months'}</option>
              </Select>
            </Field>
          </div>

          <div className="flex gap-3" style={{ marginTop: 16, flexWrap: 'wrap' }}>
            <Field label="Starts" htmlFor="ev-rec-start" style={{ flex: 1, minWidth: 150 }}>
              <input
                id="ev-rec-start"
                type="date"
                className="ev-input"
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
              />
            </Field>
            <Field label="Ends" style={{ flex: 1, minWidth: 150 }}>
              {endEnabled ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    aria-label="End date"
                    className="ev-input"
                    style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}
                    value={endDateStr}
                    min={startDateStr}
                    onChange={(e) => setEndDateStr(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="Remove end date"
                    className="ev-pressable"
                    onClick={() => setEndEnabled(false)}
                    style={{ border: 'none', background: 'transparent', color: EV.ink40, padding: 4 }}
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>
              ) : (
                <GhostChip icon={<PlusIcon size={14} />} onClick={() => setEndEnabled(true)}>
                  Add an end date
                </GhostChip>
              )}
            </Field>
          </div>
          <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 10, lineHeight: 1.45 }}>
            {scheduleSummary(unit, interval)} The first one posts on the start date.
          </p>
        </Card>

        {/* ---- preview ---- */}
        <SharePreview form={form} />

        {error && (
          <p
            role="alert"
            style={{ fontSize: 13, color: EV.clayDeep, background: EV.badgeBg, borderRadius: 10, padding: '10px 12px', marginTop: 16 }}
          >
            {error}
          </p>
        )}
      </div>

      {/* ---- sticky save bar ---- */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          background: `linear-gradient(180deg, rgba(var(--ev-paper-rgb),0) 0%, rgb(var(--ev-paper-rgb)) 28%)`,
          padding: '20px 24px calc(env(safe-area-inset-bottom, 10px) + 16px)',
        }}
      >
        <div className="mx-auto" style={{ maxWidth: 680 }}>
          <Surface variant="dock" style={{ padding: '13px 16px' }}>
            <div className="flex items-center gap-3">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {canSave ? (
                    <>
                      <CheckIcon size={15} strokeWidth={2.6} style={{ color: EV.sageDeep }} />
                      <span style={{ color: EV.sageDeep }}>Ready to schedule</span>
                    </>
                  ) : (
                    <span style={{ color: EV.clayDeep, lineHeight: 1.35 }}>{blockReason}</span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: EV.ink45, marginTop: 2, fontVariantNumeric: 'tabular-nums lining-nums' }}>
                  {formatMoney(form.amountMinor, form.currency)} · {scheduleSummary(unit, interval).toLowerCase()}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={onCancel} className="hidden sm:inline-flex">
                Cancel
              </Button>
              <Button size="sm" onClick={onSubmit} disabled={!canSave || submitting}>
                {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Schedule it'}
              </Button>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  )
}

function scheduleSummary(unit: Cadence['unit'], interval: number): string {
  const noun = unit === 'day' ? 'day' : unit === 'week' ? 'week' : 'month'
  return interval === 1 ? `Repeats every ${noun}.` : `Repeats every ${interval} ${noun}s.`
}

/* ----------------------------------------------------------- currency picker */

function CurrencySelect({ value, primary, onChange }: { value: string; primary: string; onChange: (v: string) => void }) {
  const options = CURRENCIES.some(([c]) => c === primary) ? CURRENCIES : [[primary, primary] as const, ...CURRENCIES]
  return (
    <Select value={value} onChange={onChange} ariaLabel="Currency">
      {options.map(([code, label]) => (
        <option key={code} value={code}>
          {code}
          {code === primary ? ' · group' : ` · ${label}`}
        </option>
      ))}
    </Select>
  )
}

/* ------------------------------------------------------------- category */

function CategoryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto" style={{ paddingBottom: 4, marginInline: -2, paddingInline: 2 }}>
      {CATEGORIES.map((c) => {
        const Icon = categoryIcon(c.id)
        const active = c.id === value
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-pressed={active}
            className="ev-pressable"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              padding: '9px 4px 7px',
              minWidth: 62,
              borderRadius: 13,
              border: active ? `1.5px solid ${EV.clay}` : '1.5px solid transparent',
              background: active ? EV.tileWarm : EV.fillGhost,
              color: active ? EV.clayDeep : EV.ink55,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Icon size={19} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>{c.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------- paid by */

function PaidBySection({ form }: { form: ExpenseFormState }) {
  const isTreat = form.splitType === 'treat'
  const multi = form.effectivePayerMode === 'multi'

  return (
    <div>
      {!multi ? (
        <Select value={form.singlePayerId} onChange={form.setSinglePayerId} ariaLabel="Who paid">
          {form.roster.map((r) => (
            <option key={r.id} value={r.id}>
              {r.isYou ? 'You' : r.name}
            </option>
          ))}
        </Select>
      ) : (
        <div className="flex flex-col gap-2">
          {form.roster.map((r) => (
            <div key={r.id} className="flex items-center gap-3">
              <Avatar id={r.id} name={r.name} size={28} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: EV.ink }}>{r.isYou ? 'You' : r.name}</span>
              <div style={{ width: 130 }}>
                <MoneyInput
                  value={form.multiPayerStr[r.id] ?? ''}
                  onChange={(v) => form.setMultiPayerStr({ ...form.multiPayerStr, [r.id]: v })}
                  currency={form.currency}
                  ariaLabel={`Amount paid by ${r.name}`}
                />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between" style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600 }}>
            <span style={{ color: EV.ink55 }}>Paid so far</span>
            <span
              style={{ color: form.paidByValid ? EV.sageDeep : EV.clayDeep, fontVariantNumeric: 'tabular-nums lining-nums' }}
            >
              {formatMoney(form.paidBySum, form.currency)} / {formatMoney(form.amountMinor, form.currency)}
            </span>
          </div>
        </div>
      )}

      {!isTreat && (
        <label className="flex items-center gap-2.5" style={{ marginTop: 12, fontSize: 13, color: EV.ink60, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={multi}
            onChange={(e) => form.setMultiPayer(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: EV.clay as unknown as string }}
          />
          Split the payment across multiple people
        </label>
      )}
      {isTreat && (
        <p style={{ fontSize: 12.5, color: EV.ink45, marginTop: 10, lineHeight: 1.45 }}>
          With a treat, the payer covers the whole thing and owes nothing back.
        </p>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- split (non-item) */

function ParticipantRow({ form }: { form: ExpenseFormState }) {
  const isTreat = form.splitType === 'treat'
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 9 }}>
        <span style={fieldLabel}>{isTreat ? 'Who is being treated' : 'Split between'}</span>
        <button
          type="button"
          className="ev-pressable"
          onClick={() =>
            form.setParticipantIds(
              form.participantIds.length === form.roster.length ? [] : form.roster.map((r) => r.id),
            )
          }
          style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: EV.clay, cursor: 'pointer' }}
        >
          {form.participantIds.length === form.roster.length ? 'Clear' : 'Everyone'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {form.roster.map((r) => {
          const isPayer = isTreat && r.id === form.singlePayerId
          return (
            <MemberToggle
              key={r.id}
              id={r.id}
              name={r.isYou ? 'You' : r.name}
              active={form.participantIds.includes(r.id) && !isPayer}
              onClick={isPayer ? undefined : () => form.toggleParticipant(r.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

function SplitSection({ form }: { form: ExpenseFormState }) {
  const { splitType } = form
  const participants = form.effectiveParticipants
  const nameOf = (id: MemberId) => form.roster.find((r) => r.id === id)?.name ?? 'Member'

  const exactSum = participants.reduce((s, id) => s + toMinorSafe(form.exactStr[id] ?? '', form.currency), 0)
  const exactRemaining = form.subtotalMinor - exactSum
  const percentSum = participants.reduce((s, id) => s + num(form.percentStr[id] ?? ''), 0)

  return (
    <div className="flex flex-col gap-4">
      <ParticipantRow form={form} />

      {splitType === 'exact' && (
        <div className="flex flex-col gap-2">
          {participants.map((id) => (
            <div key={id} className="flex items-center gap-3">
              <Avatar id={id} name={nameOf(id)} size={26} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: EV.ink }}>{nameOf(id)}</span>
              <div style={{ width: 130 }}>
                <MoneyInput
                  value={form.exactStr[id] ?? ''}
                  onChange={(v) => form.setExactStr({ ...form.exactStr, [id]: v })}
                  currency={form.currency}
                  ariaLabel={`Exact amount for ${nameOf(id)}`}
                />
              </div>
            </div>
          ))}
          <Remaining
            label={exactRemaining === 0 ? 'All assigned' : exactRemaining > 0 ? 'Left to assign' : 'Over by'}
            value={formatMoney(Math.abs(exactRemaining), form.currency)}
            ok={exactRemaining === 0}
          />
        </div>
      )}

      {splitType === 'percent' && (
        <div className="flex flex-col gap-2">
          {participants.map((id) => (
            <div key={id} className="flex items-center gap-3">
              <Avatar id={id} name={nameOf(id)} size={26} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: EV.ink }}>{nameOf(id)}</span>
              <div className="flex items-center gap-1.5" style={{ width: 110 }}>
                <input
                  className="ev-input"
                  inputMode="decimal"
                  style={{ ...inputStyle, textAlign: 'right', padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}
                  value={form.percentStr[id] ?? ''}
                  placeholder="0"
                  aria-label={`Percent for ${nameOf(id)}`}
                  onChange={(e) => form.setPercentStr({ ...form.percentStr, [id]: e.target.value })}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: EV.ink45 }}>%</span>
              </div>
            </div>
          ))}
          <Remaining label={percentSum === 100 ? 'Adds up' : 'Total'} value={`${round2(percentSum)}%`} ok={percentSum === 100} />
        </div>
      )}

      {splitType === 'shares' && (
        <div className="flex flex-col gap-2">
          {participants.map((id) => (
            <div key={id} className="flex items-center gap-3">
              <Avatar id={id} name={nameOf(id)} size={26} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: EV.ink }}>{nameOf(id)}</span>
              <div className="flex items-center gap-1.5">
                <input
                  className="ev-input"
                  inputMode="numeric"
                  style={{ ...inputStyle, width: 64, textAlign: 'center', padding: '10px 8px' }}
                  value={form.weightStr[id] ?? ''}
                  placeholder="1"
                  aria-label={`Shares for ${nameOf(id)}`}
                  onChange={(e) => form.setWeightStr({ ...form.weightStr, [id]: e.target.value })}
                />
                <span style={{ fontSize: 12.5, color: EV.ink45, width: 44 }}>
                  {form.preview.shares?.[id] != null ? formatMoney(form.preview.shares[id], form.currency) : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {(splitType === 'equal' || splitType === 'shares' || splitType === 'percent') && <AdjustmentsSection form={form} />}
    </div>
  )
}

function AdjustmentsSection({ form }: { form: ExpenseFormState }) {
  const nameOf = (id: MemberId) => form.roster.find((r) => r.id === id)?.name ?? 'Member'
  if (!form.adjustEnabled) {
    return (
      <GhostChip icon={<PlusIcon size={15} />} onClick={() => form.setAdjustEnabled(true)}>
        Add per-person adjustments
      </GhostChip>
    )
  }
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span style={fieldLabel}>Adjustments (+/−)</span>
        <button
          type="button"
          className="ev-pressable"
          onClick={() => form.setAdjustEnabled(false)}
          style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: EV.ink45, cursor: 'pointer' }}
        >
          Remove
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {form.effectiveParticipants.map((id) => (
          <div key={id} className="flex items-center gap-3">
            <Avatar id={id} name={nameOf(id)} size={26} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: EV.ink }}>{nameOf(id)}</span>
            <div style={{ width: 130 }}>
              <MoneyInput
                value={form.adjustStr[id] ?? ''}
                onChange={(v) => form.setAdjustStr({ ...form.adjustStr, [id]: v })}
                currency={form.currency}
                signed
                ariaLabel={`Adjustment for ${nameOf(id)}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- overhead */

const OVERHEAD_KINDS: { kind: 'tax' | 'tip' | 'fee' | 'discount'; label: string }[] = [
  { kind: 'tax', label: 'Tax' },
  { kind: 'tip', label: 'Tip' },
  { kind: 'fee', label: 'Fee' },
  { kind: 'discount', label: 'Discount' },
]

function OverheadSection({ form }: { form: ExpenseFormState }) {
  return (
    <div className="flex flex-col gap-2.5">
      {form.overheads.map((o) => (
        <div key={o.key} className="flex items-center gap-2 flex-wrap">
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: o.kind === 'discount' ? EV.sageDeep : EV.clayDeep,
              width: 64,
            }}
          >
            {o.kind}
          </span>
          <div style={{ width: 118 }}>
            <MoneyInput
              value={o.amountStr}
              onChange={(v) => form.updateOverhead(o.key, { amountStr: v })}
              currency={form.currency}
              ariaLabel={`${o.kind} amount`}
            />
          </div>
          <select
            className="ev-input"
            style={{ ...inputStyle, width: 'auto', padding: '9px 10px', cursor: 'pointer', fontSize: 12.5 }}
            value={o.mode}
            aria-label={`${o.kind} split mode`}
            onChange={(e) => form.updateOverhead(o.key, { mode: e.target.value as 'proportional' | 'even' })}
          >
            <option value="proportional">By share</option>
            <option value="even">Evenly</option>
          </select>
          {o.kind === 'tip' && (
            <select
              className="ev-input"
              style={{ ...inputStyle, width: 'auto', padding: '9px 10px', cursor: 'pointer', fontSize: 12.5 }}
              value={o.base}
              aria-label="Tip base"
              onChange={(e) => form.updateOverhead(o.key, { base: e.target.value as 'preTax' | 'postTax' })}
            >
              <option value="preTax">Pre-tax</option>
              <option value="postTax">Post-tax</option>
            </select>
          )}
          <button
            type="button"
            aria-label={`Remove ${o.kind}`}
            className="ev-pressable"
            onClick={() => form.removeOverhead(o.key)}
            style={{ border: 'none', background: 'transparent', color: EV.ink40, padding: 4, marginLeft: 'auto' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2" style={{ marginTop: form.overheads.length ? 4 : 0 }}>
        {OVERHEAD_KINDS.map((k) => (
          <GhostChip key={k.kind} icon={<PlusIcon size={14} />} onClick={() => form.addOverhead(k.kind)}>
            {k.label}
          </GhostChip>
        ))}
      </div>

      {form.overheadNet !== 0 && (
        <div className="flex items-center justify-between" style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: EV.ink55 }}>Total with extras</span>
          <span style={{ color: EV.ink, fontVariantNumeric: 'tabular-nums lining-nums' }}>
            {formatMoney(form.amountMinor, form.currency)}
          </span>
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- preview */

function SharePreview({ form }: { form: ExpenseFormState }) {
  const shares = form.preview.shares
  const nameOf = (id: MemberId) =>
    form.roster.find((r) => r.id === id)?.isYou ? 'You' : form.roster.find((r) => r.id === id)?.name ?? 'Guest'

  return (
    <Card style={{ background: EV.surface }}>
      <SectionLabel style={{ marginBottom: 12 }}>{splitTypeLabel(form.splitType)} · who owes what</SectionLabel>
      {!shares ? (
        <p style={{ fontSize: 13.5, color: EV.ink45, padding: '6px 0' }}>
          {form.preview.error ?? 'Fill in the amount and split to see the breakdown.'}
        </p>
      ) : (
        <div className="flex flex-col">
          {Object.entries(shares)
            .filter(([id, v]) => v !== 0 || form.effectiveParticipants.includes(id))
            .sort((a, b) => b[1] - a[1])
            .map(([id, v], i, arr) => (
              <div
                key={id}
                className="flex items-center gap-3"
                style={{ padding: '10px 0', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${EV.line}` }}
              >
                <Avatar id={id} name={nameOf(id)} size={28} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: EV.ink }}>{nameOf(id)}</span>
                <MoneyText amountMinor={v} currency={form.currency} tone="neutral" size={14.5} weight={600} />
              </div>
            ))}
        </div>
      )}
    </Card>
  )
}

/* ----------------------------------------------------------- small helpers */

function Remaining({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ marginTop: 2, fontSize: 12.5, fontWeight: 600 }}>
      <span style={{ color: EV.ink55 }}>{label}</span>
      <span style={{ color: ok ? EV.sageDeep : EV.clayDeep, fontVariantNumeric: 'tabular-nums lining-nums' }}>{value}</span>
    </div>
  )
}

function num(s: string): number {
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
