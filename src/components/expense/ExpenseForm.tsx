/**
 * ExpenseForm — the add / edit expense surface (CONTRACT §3.5).
 *
 * One controlled form over `useExpenseForm`. Every section writes into the hook;
 * the hook runs the real split engine so the preview + the reconcile bar are the
 * truth, not an approximation. Save is blocked until Σ paidBy === Σ splits ===
 * the grand total (the bar names exactly what is off). On save it calls the
 * `addExpense` / `editExpense` server actions (splits recomputed + asserted
 * server-side) and routes to the new detail.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  EV,
  IconTile,
  MoneyText,
  PillTabs,
  PlusIcon,
  SectionLabel,
  Surface,
  categoryIcon,
  formatMoney,
  useToast,
} from '../../design'
import { useFxResolver } from '../../hooks'
import type { Claims, MemberId, SplitConfig } from '../../lib/split'
import type { ParsedReceipt } from '../../lib/data/types'
import { useExpenseForm, type ExpenseDataWithNote, type ExpenseFormState } from './useExpenseForm'
import {
  CATEGORIES,
  CURRENCIES,
  callAction,
  toMinorSafe,
  type RosterMember,
  type SplitType,
} from './shared'
import { Field, GhostChip, MemberToggle, MoneyInput, Select, TextInput, fieldLabel, inputStyle } from './fields'

/* ------------------------------------------------------------------ props */

export interface ExpenseFormProps {
  mode: 'new' | 'edit'
  groupId: string
  primary: string
  roster: RosterMember[]
  youId: string
  isAdmin: boolean
  existing?: { id: string; data: ExpenseDataWithNote } | null
  receiptSeed?: { id: string; parsed: ParsedReceipt; claims: Claims } | null
  defaultSplit?: SplitConfig | null
}

const SPLIT_TABS: { id: SplitType; label: string }[] = [
  { id: 'equal', label: 'Equal' },
  { id: 'exact', label: 'Exact' },
  { id: 'percent', label: '%' },
  { id: 'shares', label: 'Shares' },
  { id: 'byitem', label: 'Items' },
  { id: 'treat', label: 'Treat' },
]

export function splitTypeLabel(t: SplitType): string {
  switch (t) {
    case 'equal':
      return 'Split equally'
    case 'exact':
      return 'Exact amounts'
    case 'percent':
      return 'By percentage'
    case 'shares':
      return 'By shares'
    case 'byitem':
      return 'By item'
    case 'treat':
      return 'Treat'
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

/* ------------------------------------------------------------- the form */

export function ExpenseForm(props: ExpenseFormProps) {
  const { mode, groupId, roster, youId, isAdmin, existing, receiptSeed, defaultSplit, primary } = props
  const navigate = useNavigate()
  const toast = useToast()
  const { resolver, fetchedAtMs } = useFxResolver()

  const form = useExpenseForm({
    primary,
    roster,
    youId,
    existing,
    receiptSeed,
    defaultSplit,
    resolver,
    fetchedAtMs,
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const backTo = existing ? `/app/g/${groupId}/expense/${existing.id}` : `/app/g/${groupId}`

  async function onSubmit() {
    if (!form.canSave || submitting) return
    setSubmitting(true)
    setError(null)
    const draft = form.buildDraft()

    let expenseId: string | undefined
    let res
    if (mode === 'edit' && existing) {
      res = await callAction('editExpense', { expenseId: existing.id, patch: draft })
      expenseId = existing.id
    } else {
      res = await callAction<{ expenseId: string }>('addExpense', { groupId, draft })
      expenseId = res.data?.expenseId
    }

    if (!res.success) {
      setError(res.error ?? 'Could not save this expense. Please try again.')
      setSubmitting(false)
      return
    }

    // "Remember as group default" is an admin/creator power (updateGroup).
    if (form.rememberDefault && isAdmin) {
      await callAction('updateGroup', { groupId, defaultSplit: form.splitConfig })
    }

    toast.success(mode === 'edit' ? 'Expense updated' : 'Expense added')
    navigate(expenseId ? `/app/g/${groupId}/expense/${expenseId}` : `/app/g/${groupId}`)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 680, paddingBottom: 40 }}>
        <Link
          to={backTo}
          className="ev-pressable inline-flex items-center gap-1.5"
          style={{ fontSize: 14, fontWeight: 600, color: EV.ink55, marginBottom: 18 }}
        >
          <ChevronLeftIcon size={18} />
          {existing ? 'Expense' : 'Group'}
        </Link>

        <h1
          style={{
            fontFamily: EV.fontDisplay,
            fontSize: 'clamp(26px, 4vw, 32px)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: EV.ink,
          }}
        >
          {mode === 'edit' ? 'Edit expense' : 'Add an expense'}
        </h1>

        {/* ---- essentials ---- */}
        <Card>
          <Field label="What was it for?" htmlFor="ev-desc" style={{ marginBottom: 16 }}>
            <TextInput
              id="ev-desc"
              value={form.description}
              onChange={form.setDescription}
              placeholder="Dinner at Trattoria, train tickets…"
              autoFocus={!existing}
              style={{ fontSize: 16 }}
            />
          </Field>

          {form.splitType !== 'byitem' ? (
            <div className="flex gap-3" style={{ marginBottom: 16 }}>
              <Field label="Amount" style={{ flex: 1.4 }}>
                <MoneyInput value={form.amountStr} onChange={form.setAmountStr} currency={form.currency} ariaLabel="Amount" />
              </Field>
              <Field label="Currency" style={{ flex: 1 }}>
                <CurrencySelect value={form.currency} primary={primary} onChange={form.setCurrency} />
              </Field>
            </div>
          ) : (
            <div className="flex gap-3" style={{ marginBottom: 16 }}>
              <Field label="Subtotal (from items)" style={{ flex: 1.4 }}>
                <div style={{ ...inputStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums lining-nums', color: EV.ink, background: EV.fillGhost }}>
                  {formatMoney(form.subtotalMinor, form.currency)}
                </div>
              </Field>
              <Field label="Currency" style={{ flex: 1 }}>
                <CurrencySelect value={form.currency} primary={primary} onChange={form.setCurrency} />
              </Field>
            </div>
          )}

          {form.foreign && <ForeignRate form={form} />}

          <Field label="Category" style={{ marginBottom: 16 }}>
            <CategoryPicker value={form.category} onChange={form.setCategory} />
          </Field>

          <Field label="Date" htmlFor="ev-date">
            <input
              id="ev-date"
              type="date"
              className="ev-input"
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.dateStr}
              onChange={(e) => form.setDateStr(e.target.value)}
            />
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
          {form.splitType === 'byitem' ? <ItemizedSection form={form} groupId={groupId} /> : <SplitSection form={form} />}
        </Card>

        {/* ---- extras: overhead + note ---- */}
        <Card>
          <SectionLabel style={{ marginBottom: 12 }}>Tax, tip & extras</SectionLabel>
          <OverheadSection form={form} />
          <div style={{ marginTop: 18 }}>
            <Field label="Note (optional)" htmlFor="ev-note">
              <textarea
                id="ev-note"
                className="ev-input"
                style={{ ...inputStyle, minHeight: 70, resize: 'vertical', lineHeight: 1.5 }}
                value={form.note}
                placeholder="Anything worth remembering about this one"
                onChange={(e) => form.setNote(e.target.value)}
              />
            </Field>
          </div>
        </Card>

        {/* ---- live preview ---- */}
        <SharePreview form={form} />

        {/* ---- options ---- */}
        {isAdmin && !existing && (
          <label
            className="flex items-center gap-2.5"
            style={{ marginTop: 16, fontSize: 13.5, color: EV.ink60, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={form.rememberDefault}
              onChange={(e) => form.setRememberDefault(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: EV.clay as unknown as string }}
            />
            Remember this split as the group default
          </label>
        )}

        {error && (
          <p
            role="alert"
            style={{ fontSize: 13, color: EV.clayDeep, background: EV.badgeBg, borderRadius: 10, padding: '10px 12px', marginTop: 16 }}
          >
            {error}
          </p>
        )}
      </div>

      {/* ---- sticky reconcile + save bar ---- */}
      <ReconcileBar form={form} submitting={submitting} onSubmit={onSubmit} backTo={backTo} mode={mode} />
    </div>
  )
}

/* ----------------------------------------------------------- currency + fx */

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

function ForeignRate({ form }: { form: ExpenseFormState }) {
  const rateDate = form.fetchedAtMs ? new Date(form.fetchedAtMs).toLocaleDateString() : null
  if (form.liveRate != null) {
    return (
      <div
        className="flex items-center justify-between gap-2 flex-wrap"
        style={{ marginBottom: 16, padding: '10px 13px', borderRadius: 11, background: EV.tileHoney }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: EV.honey, fontVariantNumeric: 'tabular-nums lining-nums' }}>
          ≈ {form.convertedMinor != null ? formatMoney(form.convertedMinor, form.primary) : '–'}
          <span style={{ color: EV.ink45, fontWeight: 500 }}> in {form.primary}</span>
        </span>
        <span style={{ fontSize: 11, color: EV.ink45 }}>
          1 {form.currency} = {form.liveRate.toFixed(4)} {form.primary}
          {rateDate ? ` · rate as of ${rateDate}` : ''}
        </span>
      </div>
    )
  }
  // Pair unavailable -> manual fallback (never blocks creation, CONTRACT §3.5 / §4).
  return (
    <Field
      label={`Exchange rate (1 ${form.currency} → ${form.primary})`}
      hint={`We don't have a live rate for ${form.currency}. Enter today's rate to convert and snapshot it.`}
      style={{ marginBottom: 16 }}
    >
      <TextInput
        value={form.manualRateStr}
        onChange={form.setManualRateStr}
        placeholder="e.g. 1.08"
        inputMode="decimal"
        ariaLabel="Manual exchange rate"
      />
      {form.convertedMinor != null && (
        <p style={{ fontSize: 12, color: EV.honey, marginTop: 6, fontWeight: 600 }}>
          ≈ {formatMoney(form.convertedMinor, form.primary)} in {form.primary}
        </p>
      )}
    </Field>
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
        <Select
          value={form.singlePayerId}
          onChange={form.setSinglePayerId}
          ariaLabel="Who paid"
        >
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
          <div
            className="flex items-center justify-between"
            style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600 }}
          >
            <span style={{ color: EV.ink55 }}>Paid so far</span>
            <span
              style={{
                color: form.paidByValid ? EV.sageDeep : EV.clayDeep,
                fontVariantNumeric: 'tabular-nums lining-nums',
              }}
            >
              {formatMoney(form.paidBySum, form.currency)} / {formatMoney(form.amountMinor, form.currency)}
            </span>
          </div>
        </div>
      )}

      {!isTreat && (
        <label
          className="flex items-center gap-2.5"
          style={{ marginTop: 12, fontSize: 13, color: EV.ink60, cursor: 'pointer' }}
        >
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
  const nameOf = (id: MemberId) => {
    const r = form.roster.find((r) => r.id === id)
    return r ? (r.isYou ? 'You' : r.name) : 'Member'
  }

  // exact: live remaining against the subtotal
  const exactSum = participants.reduce((s, id) => s + toMinorSafe(form.exactStr[id] ?? '', form.currency), 0)
  const exactRemaining = form.subtotalMinor - exactSum
  // percent: live sum
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

      {(splitType === 'equal' || splitType === 'shares' || splitType === 'percent') && (
        <AdjustmentsSection form={form} />
      )}
    </div>
  )
}

function AdjustmentsSection({ form }: { form: ExpenseFormState }) {
  const nameOf = (id: MemberId) => {
    const r = form.roster.find((r) => r.id === id)
    return r ? (r.isYou ? 'You' : r.name) : 'Member'
  }
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
      <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 8, lineHeight: 1.45 }}>
        A carve-out before the rest is split, e.g. one person's extra drink.
      </p>
    </div>
  )
}

/* ----------------------------------------------------------- itemized */

function ItemizedSection({ form, groupId }: { form: ExpenseFormState; groupId: string }) {
  const nameOf = (id: MemberId) => {
    const r = form.roster.find((r) => r.id === id)
    return r ? (r.isYou ? 'You' : r.name) : 'Member'
  }
  const scanned = !!form.receiptId

  return (
    <div className="flex flex-col gap-3">
      {scanned && (
        <div
          className="flex items-center gap-3"
          style={{ padding: '11px 13px', borderRadius: 12, background: EV.tileWarm }}
        >
          <IconTile tone="warm" size={34}>
            <CameraIcon size={17} />
          </IconTile>
          <div style={{ flex: 1, fontSize: 12.5, color: EV.clayDeep, fontWeight: 600 }}>
            Itemized from a scanned receipt
          </div>
          <Link to={`/app/g/${groupId}/scan`} style={{ fontSize: 12.5, fontWeight: 600, color: EV.clay }}>
            Re-scan
          </Link>
        </div>
      )}

      {form.lineItems.map((li) => (
        <div key={li.id} style={{ padding: '12px 13px', borderRadius: 13, background: EV.fillGhost }}>
          <div className="flex items-center gap-2">
            <input
              className="ev-input"
              style={{ ...inputStyle, flex: 1, padding: '9px 12px', background: EV.surface }}
              value={li.name}
              placeholder="Item name"
              aria-label="Item name"
              onChange={(e) => form.updateLineItem(li.id, { name: e.target.value })}
            />
            <div style={{ width: 116 }}>
              <MoneyInput
                value={li.amountStr}
                onChange={(v) => form.updateLineItem(li.id, { amountStr: v })}
                currency={form.currency}
                ariaLabel="Item price"
              />
            </div>
            <button
              type="button"
              aria-label="Remove item"
              className="ev-pressable"
              onClick={() => form.removeLineItem(li.id)}
              style={{ border: 'none', background: 'transparent', color: EV.ink40, padding: 4 }}
            >
              <CloseIcon size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
            {form.roster.map((r) => {
              const active = (form.claims[li.id] ?? []).includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => form.toggleClaim(li.id, r.id)}
                  aria-pressed={active}
                  title={r.name}
                  className="ev-pressable"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 9px 3px 3px',
                    borderRadius: 999,
                    border: active ? `1.5px solid ${EV.clay}` : `1.5px dashed ${EV.dash}`,
                    background: active ? EV.surface : 'transparent',
                    color: active ? EV.ink : EV.ink45,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Avatar id={r.id} name={r.name} size={18} />
                  {r.isYou ? 'You' : r.name.split(' ')[0]}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <GhostChip icon={<PlusIcon size={15} />} onClick={form.addLineItem}>
        Add an item
      </GhostChip>

      <Field label="Unclaimed items" hint="Items nobody tapped are spread this way." style={{ marginTop: 4 }}>
        <Select
          value={form.unclaimedPolicy}
          onChange={(v) => form.setUnclaimedPolicy(v as ExpenseFormState['unclaimedPolicy'])}
          ariaLabel="Unclaimed policy"
        >
          <option value="even">Split evenly among everyone</option>
          <option value="proportional">Proportional to what each claimed</option>
          <option value="payer">Charged to the payer</option>
          <option value="manual">Leave unassigned (must clear to save)</option>
        </Select>
      </Field>
      {form.preview.shares == null && (
        <p style={{ fontSize: 12, color: EV.ink45 }}>Assign people to items to see the split.</p>
      )}
      {/* who's sharing the unclaimed pool / participants */}
      <div>
        <span style={fieldLabel}>Participants for unclaimed</span>
        <div className="flex flex-wrap gap-2" style={{ marginTop: 2 }}>
          {form.roster.map((r) => (
            <MemberToggle
              key={r.id}
              id={r.id}
              name={r.isYou ? 'You' : r.name}
              active={form.participantIds.includes(r.id)}
              onClick={() => form.toggleParticipant(r.id)}
            />
          ))}
        </div>
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
  const nameOf = (id: MemberId) => (form.roster.find((r) => r.id === id)?.isYou ? 'You' : form.roster.find((r) => r.id === id)?.name ?? 'Guest')

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
          <RoundingNote form={form} />
        </div>
      )}
    </Card>
  )
}

function RoundingNote({ form }: { form: ExpenseFormState }) {
  const shares = form.preview.shares
  if (!shares || form.splitType !== 'equal' || form.scope !== 'simple') return null
  const ids = Object.keys(shares)
  if (ids.length < 2) return null
  const min = Math.min(...ids.map((id) => shares[id]))
  const extra = ids.filter((id) => shares[id] > min)
  if (extra.length === 0 || extra.length === ids.length) return null
  const names = extra
    .map((id) => (form.roster.find((r) => r.id === id)?.isYou ? 'You' : form.roster.find((r) => r.id === id)?.name ?? 'Guest'))
    .join(', ')
  return (
    <p style={{ fontSize: 11.5, color: EV.ink45, marginTop: 10, lineHeight: 1.45 }}>
      It didn&apos;t divide evenly. {names} {extra.length === 1 ? 'covers' : 'cover'} the extra {form.currency === form.primary ? '' : `${form.currency} `}cent.
    </p>
  )
}

/* ----------------------------------------------------------- reconcile bar */

function ReconcileBar({
  form,
  submitting,
  onSubmit,
  backTo,
  mode,
}: {
  form: ExpenseFormState
  submitting: boolean
  onSubmit: () => void
  backTo: string
  mode: 'new' | 'edit'
}) {
  const ready = form.canSave
  return (
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
                {ready ? (
                  <>
                    <CheckIcon size={15} strokeWidth={2.6} style={{ color: EV.sageDeep }} />
                    <span style={{ color: EV.sageDeep }}>Everything reconciles</span>
                  </>
                ) : (
                  <span style={{ color: EV.clayDeep, lineHeight: 1.35 }}>{form.blockReason}</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: EV.ink45, marginTop: 2, fontVariantNumeric: 'tabular-nums lining-nums' }}>
                Total {formatMoney(form.amountMinor, form.currency)}
                {form.foreign && form.convertedMinor != null ? ` · ≈ ${formatMoney(form.convertedMinor, form.primary)}` : ''}
              </div>
            </div>
            <Link to={backTo} className="hidden sm:inline-flex">
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </Link>
            <Button size="sm" onClick={onSubmit} disabled={!ready || submitting}>
              {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add expense'}
            </Button>
          </div>
        </Surface>
      </div>
    </div>
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
