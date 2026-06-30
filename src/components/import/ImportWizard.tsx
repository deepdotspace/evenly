/**
 * ImportWizard — the 3-step Splitwise CSV import (CONTRACT §3.13).
 *
 *   1. Upload   pick / drop a CSV; help + "export from Splitwise" empty state.
 *   2. Map      auto-detect columns; map each person to a member / guest / you;
 *               pick or create the target group + its currency; foreign-currency
 *               rate prompts.
 *   3. Review   parsed expenses with duplicate flags + row errors; confirm import
 *               (exact duplicates skipped by default), with live progress.
 *
 * Parsing + reconstruction + the dedupe fingerprint live in `./csv` (shared with
 * the `importExpenses` action) so the preview is exactly what gets written. Large
 * files are imported in bounded chunks that drive the progress bar and stay under
 * the Worker subrequest ceiling; every chunk is idempotent on the fingerprint.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthToken, useAuth } from 'deepspace'
import {
  AlertIcon,
  ArrowRightIcon,
  Avatar,
  Button,
  CheckIcon,
  ChevronLeftIcon,
  EV,
  IconTile,
  InfoIcon,
  ReceiptIcon,
  SectionLabel,
  Surface,
  TagIcon,
  categoryIcon,
  formatMoney,
  useToast,
} from '../../design'
import { useContacts, useExpenses, useGroupMembers, useGroups, useProfile } from '../../hooks'
import {
  derivePayer,
  fingerprint,
  parseSplitwiseCsv,
  reconstruct,
} from './csv'
import type {
  Assignment,
  ImportChunkResult,
  ImportRowPayload,
  ParseResult,
  ParsedRow,
} from './types'

/* --------------------------------------------------------------- shared styles */

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
  fontSize: 14.5,
  fontWeight: 500,
  color: EV.ink,
  background: EV.paper,
  border: `1px solid ${EV.borderGhost}`,
  borderRadius: 12,
  padding: '11px 13px',
}

const selectStyle: CSSProperties = { ...inputStyle, cursor: 'pointer' }

const CURRENCIES: readonly (readonly [string, string])[] = [
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

const KNOWN_CODES = new Set(CURRENCIES.map(([c]) => c))

function newGuestId(): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `guest:${rnd}`
}

const norm = (s: string): string => s.trim().toLowerCase()

interface ActionResponse<T> {
  success?: boolean
  error?: string
  data?: T
}

async function callAction<T>(name: string, body: Record<string, unknown>): Promise<ActionResponse<T>> {
  try {
    const token = await getAuthToken()
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return (await res.json()) as ActionResponse<T>
  } catch {
    return { success: false, error: 'Could not reach the server. Check your connection and try again.' }
  }
}

/* --------------------------------------------------------------------- types */

type Step = 'upload' | 'map' | 'preview'

interface TargetState {
  mode: 'new' | 'existing'
  groupId: string
  newName: string
  currency: string
}

interface ImportProgress {
  running: boolean
  done: boolean
  total: number
  processed: number
  imported: number
  skipped: number
  errors: { description: string; reason: string }[]
}

const CHUNK = 12

/* --------------------------------------------------------------- the wizard */

export function ImportWizard() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { record: profile } = useProfile()
  const { records: groups } = useGroups()
  const { records: contacts } = useContacts()
  const toast = useToast()

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [parse, setParse] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const [target, setTarget] = useState<TargetState>({ mode: 'new', groupId: '', newName: '', currency: 'USD' })
  const [mapping, setMapping] = useState<Record<string, Assignment>>({})
  const [manualRates, setManualRates] = useState<Record<string, string>>({})
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [imp, setImp] = useState<ImportProgress | null>(null)

  // Stable guest ids per CSV person so re-renders don't regenerate them.
  const guestIds = useRef<Map<string, string>>(new Map())
  const guestIdFor = (name: string): string => {
    const m = guestIds.current
    if (!m.has(name)) m.set(name, newGuestId())
    return m.get(name)!
  }
  // Persons the user re-mapped by hand (their choice survives auto re-matching).
  const manualEdits = useRef<Set<string>>(new Set())
  // The target the mapping was last auto-seeded against (mode:groupId).
  const seededKey = useRef<string>('')

  const myName = profile?.data.displayName || 'You'
  const { records: members } = useGroupMembers(target.mode === 'existing' ? target.groupId : undefined)
  const { records: existingExpenses } = useExpenses(target.mode === 'existing' ? target.groupId : undefined)

  const expenseRows = useMemo(() => (parse ? parse.rows.filter((r) => r.kind === 'expense') : []), [parse])
  const paymentRows = useMemo(() => (parse ? parse.rows.filter((r) => r.kind === 'payment') : []), [parse])

  /* ------------------------------------------------------------- file handling */

  async function ingest(file: File) {
    setParseError(null)
    setFileName(file.name)
    let text: string
    try {
      text = await file.text()
    } catch {
      setParseError('Could not read that file. Try exporting again from Splitwise.')
      return
    }
    const result = parseSplitwiseCsv(text)
    if (!result.recognized || (result.rows.length === 0 && result.errors.length === 0)) {
      setParse(null)
      setParseError(
        "That doesn't look like a Splitwise spreadsheet export. Make sure you exported the group as a CSV.",
      )
      return
    }
    setParse(result)
    setManualRates({})
    setIncludeDuplicates(false)
    const base = file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim()
    setTarget((t) => ({
      ...t,
      newName: base || 'Imported group',
      currency: result.currencies[0] || profile?.data.defaultCurrency || 'USD',
    }))
    setStep('map')
  }

  /* --------------------------------------------------------- default the mapping */

  // Seed / refresh the person → member mapping. Re-runs as the target or its
  // members load, so an existing group's members get matched (which is what makes
  // dedupe work). A manual choice survives — until the target itself changes, when
  // those choices no longer apply and everything is auto-matched afresh.
  useEffect(() => {
    if (!parse) return
    const key = `${target.mode}:${target.groupId}`
    const keyChanged = key !== seededKey.current
    if (keyChanged) {
      manualEdits.current = new Set()
      seededKey.current = key
    }
    const auto = (person: string): Assignment => {
      // Auto-detect "you" by display name.
      if (userId && norm(person) === norm(myName)) return { id: userId, name: myName, isNew: false }
      // Existing group: match an active member by name (gives a stable, dedupe-able id).
      if (target.mode === 'existing') {
        const m = members.find((r) => r.data.status !== 'removed' && norm(r.data.displayName) === norm(person))
        if (m) return { id: m.data.userId ?? m.data.guestId ?? m.recordId, name: m.data.displayName, isNew: false }
      }
      // Otherwise a new guest named after the CSV person.
      return { id: guestIdFor(person), name: person, isNew: true }
    }
    setMapping((prev) => {
      const next: Record<string, Assignment> = {}
      for (const person of parse.people) {
        next[person] = !keyChanged && manualEdits.current.has(person) && prev[person] ? prev[person] : auto(person)
      }
      return next
    })
  }, [parse, target.mode, target.groupId, members, userId, myName])

  function setAssignment(person: string, value: string) {
    manualEdits.current.add(person)
    let a: Assignment
    if (value === 'you') {
      a = { id: userId ?? 'me', name: myName, isNew: false }
    } else if (value === 'guest') {
      a = { id: guestIdFor(person), name: person, isNew: true }
    } else if (value.startsWith('member:')) {
      const id = value.slice(7)
      const m = members.find((r) => (r.data.userId ?? r.data.guestId ?? r.recordId) === id)
      a = { id, name: m?.data.displayName ?? person, isNew: false }
    } else if (value.startsWith('contact:')) {
      const cid = value.slice(8)
      const c = contacts.find((r) => (r.data.contactUserId ?? r.data.contactGuestId ?? r.recordId) === cid)
      const id = c?.data.contactUserId ?? c?.data.contactGuestId ?? cid
      const isMember = target.mode === 'existing' && members.some(
        (r) => (r.data.userId ?? r.data.guestId ?? r.recordId) === id,
      )
      a = { id, name: c?.data.cachedName ?? person, isNew: !isMember }
    } else {
      a = { id: guestIdFor(person), name: person, isNew: true }
    }
    setMapping((prev) => ({ ...prev, [person]: a }))
  }

  function selectValueFor(person: string): string {
    const a = mapping[person]
    if (!a) return 'guest'
    if (userId && a.id === userId) return 'you'
    if (target.mode === 'existing' && members.some((r) => (r.data.userId ?? r.data.guestId ?? r.recordId) === a.id))
      return `member:${a.id}`
    if (a.id.startsWith('guest:') && a.isNew) return 'guest'
    const c = contacts.find((r) => (r.data.contactUserId ?? r.data.contactGuestId) === a.id)
    if (c) return `contact:${a.id}`
    return 'guest'
  }

  /* ------------------------------------------------------------ preview compute */

  const targetCurrency = target.mode === 'existing'
    ? groups.find((g) => g.recordId === target.groupId)?.data.primaryCurrency ?? target.currency
    : target.currency

  const foreignCurrencies = useMemo(
    () => (parse ? parse.currencies.filter((c) => c !== targetCurrency) : []),
    [parse, targetCurrency],
  )

  const allMapped = parse ? parse.people.every((p) => mapping[p]?.id) : false
  const targetReady = target.mode === 'new' ? target.newName.trim().length > 0 : !!target.groupId

  // Map a row's name-keyed nets onto member ids (summing any collisions).
  function netsToMembers(row: ParsedRow): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [person, v] of Object.entries(row.nets)) {
      const id = mapping[person]?.id
      if (!id) continue
      out[id] = (out[id] ?? 0) + v
    }
    return out
  }

  const existingFingerprints = useMemo(() => {
    const set = new Set<string>()
    for (const e of existingExpenses) {
      const ms = e.data.expenseAtMs ?? Date.parse(e.createdAt) ?? Date.now()
      set.add(
        fingerprint({
          dateMs: ms,
          amountMinor: e.data.amountMinor,
          description: e.data.description,
          payerId: derivePayer(e.data.paidBy),
        }),
      )
    }
    return set
  }, [existingExpenses])

  interface PreviewRow {
    row: ParsedRow
    payerName: string
    splitWays: number
    valid: boolean
    duplicate: boolean
  }

  const preview: PreviewRow[] = useMemo(() => {
    if (!parse) return []
    const seenInBatch = new Set<string>()
    return expenseRows.map((row) => {
      const nets = netsToMembers(row)
      const recon = reconstruct(nets, row.amountMinor)
      if (!recon) {
        return { row, payerName: '–', splitWays: 0, valid: false, duplicate: false }
      }
      const payerId = derivePayer(recon.paidBy)
      const payerName = payerId ? mapping[nameForId(payerId)]?.name ?? memberName(payerId) : '–'
      const fp = fingerprint({ dateMs: row.dateMs, amountMinor: row.amountMinor, description: row.description, payerId })
      const duplicate = existingFingerprints.has(fp) || seenInBatch.has(fp)
      seenInBatch.add(fp)
      return {
        row,
        payerName,
        splitWays: Object.keys(recon.splitConfig.exactAmounts ?? {}).length,
        valid: true,
        duplicate,
      }
    })
  }, [parse, expenseRows, mapping, existingFingerprints])

  function nameForId(id: string): string {
    // Reverse-lookup the CSV person whose assignment is this member id.
    for (const [person, a] of Object.entries(mapping)) if (a.id === id) return person
    return id
  }
  function memberName(id: string): string {
    if (id === userId) return myName
    const m = members.find((r) => (r.data.userId ?? r.data.guestId ?? r.recordId) === id)
    return m?.data.displayName ?? 'Member'
  }

  const dupCount = preview.filter((p) => p.duplicate).length
  const invalidCount = preview.filter((p) => !p.valid).length
  const willImport = preview.filter((p) => p.valid && (includeDuplicates || !p.duplicate)).length

  /* ----------------------------------------------------------------- run import */

  async function runImport() {
    if (!parse) return
    const parsedRates: Record<string, number> = {}
    for (const [cur, str] of Object.entries(manualRates)) {
      const n = Number.parseFloat(str)
      if (Number.isFinite(n) && n > 0) parsedRates[cur] = n
    }

    setImp({ running: true, done: false, total: willImport, processed: 0, imported: 0, skipped: 0, errors: [] })

    // 1) Resolve the target group, creating it + any new members first.
    let groupId = target.groupId
    try {
      if (target.mode === 'new') {
        const guests = Object.values(mapping)
          .filter((a) => a.isNew && a.id.startsWith('guest:'))
          .map((a) => ({ guestId: a.id, displayName: a.name }))
        const res = await callAction<{ groupId: string }>('createGroup', {
          name: target.newName.trim(),
          primaryCurrency: target.currency,
          kind: 'group',
          guests,
        })
        if (!res.success || !res.data?.groupId) {
          finishWithError(res.error ?? 'Could not create the group.')
          return
        }
        groupId = res.data.groupId
        // Non-guest contacts (real users) need to be added explicitly.
        for (const a of Object.values(mapping)) {
          if (!a.isNew || a.id.startsWith('guest:') || a.id === userId) continue
          await callAction('addGroupMember', { groupId, memberId: a.id, displayName: a.name, role: 'member' })
        }
      } else {
        const memberSet = new Set(members.map((r) => r.data.userId ?? r.data.guestId ?? r.recordId))
        for (const a of Object.values(mapping)) {
          if (a.id === userId || memberSet.has(a.id)) continue
          await callAction('addGroupMember', { groupId, memberId: a.id, displayName: a.name, role: 'member' })
        }
      }
    } catch {
      finishWithError('Could not prepare the group members.')
      return
    }

    // 2) Build member-id-keyed rows and import in bounded, idempotent chunks.
    const rows: ImportRowPayload[] = expenseRows.map((row) => ({
      dateMs: row.dateMs,
      description: row.description,
      category: row.category,
      currency: row.currency,
      amountMinor: row.amountMinor,
      nets: netsToMembers(row),
    }))

    const acc: ImportProgress = {
      running: true,
      done: false,
      total: rows.length,
      processed: 0,
      imported: 0,
      skipped: 0,
      errors: [],
    }

    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const res = await callAction<ImportChunkResult>('importExpenses', {
        groupId,
        rows: slice,
        includeDuplicates,
        manualRates: parsedRates,
      })
      if (res.success && res.data) {
        acc.imported += res.data.imported
        acc.skipped += res.data.skippedDuplicates
        for (const e of res.data.errors) acc.errors.push({ description: e.description, reason: e.reason })
      } else {
        for (const r of slice) acc.errors.push({ description: r.description, reason: res.error ?? 'Import failed' })
      }
      acc.processed = Math.min(i + slice.length, rows.length)
      setImp({ ...acc })
    }

    acc.running = false
    acc.done = true
    setImp({ ...acc })

    if (acc.imported > 0) {
      toast.success(
        `Imported ${acc.imported} ${acc.imported === 1 ? 'expense' : 'expenses'}`,
        acc.skipped > 0 ? `${acc.skipped} duplicate${acc.skipped === 1 ? '' : 's'} skipped.` : 'Balances are up to date.',
      )
      navigate(`/app/g/${groupId}`)
    } else if (acc.errors.length > 0) {
      toast.error('Nothing imported', `${acc.errors.length} row${acc.errors.length === 1 ? '' : 's'} could not be imported.`)
    } else {
      toast.info('Nothing to import', 'Everything in this file was already in the group.')
    }
  }

  function finishWithError(reason: string) {
    setImp((p) => (p ? { ...p, running: false, done: true, errors: [...p.errors, { description: 'Setup', reason }] } : null))
    toast.error('Import failed', reason)
  }

  /* -------------------------------------------------------------------- render */

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-9 lg:px-10 lg:py-12" style={{ maxWidth: 760 }}>
        <Header step={step} />

        {step === 'upload' && (
          <StepUpload onFile={ingest} fileName={fileName} error={parseError} />
        )}

        {step === 'map' && parse && (
          <StepMap
            parse={parse}
            people={parse.people}
            mapping={mapping}
            target={target}
            groups={groups.map((g) => ({ id: g.recordId, name: g.data.name, currency: g.data.primaryCurrency }))}
            members={members.map((r) => ({
              id: r.data.userId ?? r.data.guestId ?? r.recordId,
              name: r.data.displayName,
              removed: r.data.status === 'removed',
            }))}
            contacts={contacts.map((r) => ({
              id: r.data.contactUserId ?? r.data.contactGuestId ?? r.recordId,
              name: r.data.cachedName,
            }))}
            myName={myName}
            foreignCurrencies={foreignCurrencies}
            targetCurrency={targetCurrency}
            manualRates={manualRates}
            expenseCount={expenseRows.length}
            paymentCount={paymentRows.length}
            errorCount={parse.errors.length}
            onTarget={setTarget}
            onAssign={setAssignment}
            valueFor={selectValueFor}
            onRate={(cur, v) => setManualRates((m) => ({ ...m, [cur]: v }))}
            onBack={() => setStep('upload')}
            onNext={() => setStep('preview')}
            canNext={allMapped && targetReady}
          />
        )}

        {step === 'preview' && parse && (
          <StepPreview
            preview={preview}
            paymentCount={paymentRows.length}
            parseErrors={parse.errors}
            includeDuplicates={includeDuplicates}
            dupCount={dupCount}
            invalidCount={invalidCount}
            willImport={willImport}
            targetLabel={target.mode === 'new' ? target.newName.trim() : groups.find((g) => g.recordId === target.groupId)?.data.name ?? 'group'}
            imp={imp}
            onToggleDuplicates={() => setIncludeDuplicates((v) => !v)}
            onBack={() => setStep('map')}
            onConfirm={runImport}
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ sub-views */

function Header({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'map', label: 'Map' },
    { id: 'preview', label: 'Review' },
  ]
  const activeIdx = steps.findIndex((s) => s.id === step)
  return (
    <header style={{ marginBottom: 28 }}>
      <div className="flex items-center gap-3">
        <IconTile size={44} radius={14} tone="honey">
          <TagIcon size={22} />
        </IconTile>
        <div>
          <SectionLabel>Import</SectionLabel>
          <h1
            style={{
              fontFamily: EV.fontDisplay,
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: EV.ink,
              marginTop: 2,
            }}
          >
            Bring your Splitwise history over
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2" style={{ marginTop: 22 }}>
        {steps.map((s, i) => {
          const done = i < activeIdx
          const active = i === activeIdx
          return (
            <div key={s.id} className="flex items-center gap-2" style={{ flex: i < steps.length - 1 ? 1 : undefined }}>
              <span
                className="inline-flex items-center justify-center"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  fontSize: 12,
                  fontWeight: 700,
                  background: active ? EV.clay : done ? EV.tileHoney : EV.fillGhost,
                  color: active ? EV.paper : done ? EV.honey : EV.ink45,
                }}
              >
                {done ? <CheckIcon size={13} /> : i + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: active ? EV.ink : EV.ink45 }}>{s.label}</span>
              {i < steps.length - 1 && (
                <span style={{ flex: 1, height: 2, borderRadius: 2, background: done ? EV.tileHoney : EV.line, marginLeft: 4 }} />
              )}
            </div>
          )
        })}
      </div>
    </header>
  )
}

/* ---- step 1: upload ---- */

function StepUpload({ onFile, fileName, error }: { onFile: (f: File) => void; fileName: string; error: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onFile(f)
        }}
        className="ev-pressable"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 12,
          padding: '48px 24px',
          borderRadius: 20,
          border: `1.5px dashed ${dragging ? EV.clay : EV.dash}`,
          background: dragging ? EV.tileHoney : EV.surface,
          boxShadow: 'var(--ev-shadow-soft)',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        <IconTile size={56} radius={18} tone="warm">
          <ReceiptIcon size={28} />
        </IconTile>
        <div style={{ fontFamily: EV.fontDisplay, fontSize: 19, fontWeight: 500, color: EV.ink }}>
          {fileName ? fileName : 'Drop your Splitwise CSV here'}
        </div>
        <div style={{ fontSize: 13.5, color: EV.ink55 }}>or click to choose a file</div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
      </button>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5"
          style={{ fontSize: 13.5, color: EV.clayDeep, background: EV.badgeBg, borderRadius: 12, padding: '12px 14px' }}
        >
          <AlertIcon size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <Surface variant="card" style={{ padding: 18, boxShadow: 'var(--ev-shadow-soft)' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <InfoIcon size={17} style={{ color: EV.honey }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: EV.ink }}>How to export from Splitwise</span>
        </div>
        <ol style={{ fontSize: 13.5, color: EV.ink55, lineHeight: 1.7, paddingLeft: 18, listStyle: 'decimal' }}>
          <li>Open the group on Splitwise (web).</li>
          <li>Click the gear / settings icon, then <b style={{ color: EV.ink }}>Export as spreadsheet</b>.</li>
          <li>Choose CSV, then drop the downloaded file above.</li>
        </ol>
        <p style={{ fontSize: 12.5, color: EV.ink45, marginTop: 10, lineHeight: 1.5 }}>
          We read the date, description, category, cost, currency, and each person's column. Settle-up rows are skipped, and
          exact duplicates are flagged before anything is written.
        </p>
      </Surface>
    </div>
  )
}

/* ---- step 2: map ---- */

interface MemberOpt {
  id: string
  name: string
  removed?: boolean
}
interface GroupOpt {
  id: string
  name: string
  currency: string
}

function StepMap(props: {
  parse: ParseResult
  people: string[]
  mapping: Record<string, Assignment>
  target: TargetState
  groups: GroupOpt[]
  members: MemberOpt[]
  contacts: { id: string; name: string }[]
  myName: string
  foreignCurrencies: string[]
  targetCurrency: string
  manualRates: Record<string, string>
  expenseCount: number
  paymentCount: number
  errorCount: number
  onTarget: (t: TargetState) => void
  onAssign: (person: string, value: string) => void
  valueFor: (person: string) => string
  onRate: (cur: string, v: string) => void
  onBack: () => void
  onNext: () => void
  canNext: boolean
}) {
  const {
    people, mapping, target, groups, members, contacts, myName, foreignCurrencies, targetCurrency,
    manualRates, expenseCount, paymentCount, errorCount, onTarget, onAssign, valueFor, onRate, onBack, onNext, canNext,
  } = props

  return (
    <div className="flex flex-col gap-7">
      <p style={{ fontSize: 13.5, color: EV.ink55, lineHeight: 1.55, marginTop: -8 }}>
        Found <b style={{ color: EV.ink }}>{expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}</b>
        {paymentCount > 0 && <> · {paymentCount} settle-up{paymentCount === 1 ? '' : 's'} (skipped)</>}
        {errorCount > 0 && <> · {errorCount} unreadable row{errorCount === 1 ? '' : 's'}</>}.
      </p>

      {/* target group */}
      <section>
        <SectionLabel>Import into</SectionLabel>
        <div className="flex gap-2" style={{ marginTop: 10 }}>
          <SegBtn active={target.mode === 'new'} onClick={() => onTarget({ ...target, mode: 'new' })}>
            New group
          </SegBtn>
          <SegBtn
            active={target.mode === 'existing'}
            disabled={groups.length === 0}
            onClick={() => onTarget({ ...target, mode: 'existing', groupId: target.groupId || groups[0]?.id || '' })}
          >
            Existing group
          </SegBtn>
        </div>

        {target.mode === 'new' ? (
          <div className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 14 }}>
            <div>
              <label style={fieldLabel}>Group name</label>
              <input
                className="ev-input"
                style={inputStyle}
                value={target.newName}
                placeholder="Italy 2026"
                onChange={(e) => onTarget({ ...target, newName: e.target.value })}
              />
            </div>
            <div>
              <label style={fieldLabel}>Primary currency</label>
              <select
                className="ev-input"
                style={selectStyle}
                value={target.currency}
                onChange={(e) => onTarget({ ...target, currency: e.target.value })}
              >
                {[...new Set([target.currency, ...CURRENCIES.map(([c]) => c)])].map((code) => {
                  const label = CURRENCIES.find(([c]) => c === code)?.[1]
                  return (
                    <option key={code} value={code}>
                      {code}{label ? ` · ${label}` : ''}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>Group</label>
            <select
              className="ev-input"
              style={selectStyle}
              value={target.groupId}
              onChange={(e) => onTarget({ ...target, groupId: e.target.value })}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.currency}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* people mapping */}
      <section>
        <SectionLabel right={<span style={{ fontSize: 11.5, color: EV.ink45 }}>{people.length} from the file</span>}>
          Match people
        </SectionLabel>
        <Surface variant="card" style={{ padding: 6, marginTop: 10, boxShadow: 'var(--ev-shadow-soft)' }}>
          {people.map((person, i) => {
            const a = mapping[person]
            return (
              <div
                key={person}
                className="flex items-center gap-3"
                style={{ padding: '10px 12px', borderTop: i === 0 ? 'none' : `1px solid ${EV.line}` }}
              >
                <Avatar id={a?.id ?? person} name={a?.name ?? person} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ fontSize: 14, fontWeight: 600, color: EV.ink }}>{person}</div>
                  {a?.isNew && (
                    <div style={{ fontSize: 11.5, color: EV.honey, fontWeight: 600 }}>new guest</div>
                  )}
                </div>
                <select
                  className="ev-input"
                  style={{ ...selectStyle, width: 180, padding: '9px 11px', fontSize: 13.5 }}
                  value={valueFor(person)}
                  onChange={(e) => onAssign(person, e.target.value)}
                >
                  <option value="you">You ({myName})</option>
                  {target.mode === 'existing' &&
                    members
                      .filter((m) => !m.removed)
                      .map((m) => (
                        <option key={m.id} value={`member:${m.id}`}>
                          {m.name}
                        </option>
                      ))}
                  {contacts.map((c) => (
                    <option key={c.id} value={`contact:${c.id}`}>
                      {c.name} (contact)
                    </option>
                  ))}
                  <option value="guest">New guest: {person}</option>
                </select>
              </div>
            )
          })}
        </Surface>
      </section>

      {/* foreign currencies */}
      {foreignCurrencies.length > 0 && (
        <section>
          <SectionLabel>Other currencies</SectionLabel>
          <p style={{ fontSize: 12.5, color: EV.ink45, marginTop: 6, lineHeight: 1.5 }}>
            Some expenses aren't in {targetCurrency}. Set a rate to convert them, or leave blank to use today's rate if
            available. Rows we can't convert are reported, never guessed.
          </p>
          <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
            {foreignCurrencies.map((cur) => (
              <div key={cur} className="flex items-center gap-2" style={{ fontSize: 13.5, color: EV.ink70 }}>
                <span style={{ width: 46, fontWeight: 600 }}>1 {cur}</span>
                <span style={{ color: EV.ink40 }}>=</span>
                <input
                  className="ev-input"
                  style={{ ...inputStyle, width: 120, padding: '9px 11px' }}
                  inputMode="decimal"
                  placeholder="rate"
                  value={manualRates[cur] ?? ''}
                  onChange={(e) => onRate(cur, e.target.value)}
                />
                <span style={{ fontWeight: 600 }}>{targetCurrency}</span>
                {!KNOWN_CODES.has(cur) && (
                  <span style={{ fontSize: 11.5, color: EV.clayDeep, marginLeft: 4 }}>unrecognized code</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <FooterNav
        onBack={onBack}
        backLabel="Back"
        next={
          <Button onClick={onNext} disabled={!canNext} iconRight={<ArrowRightIcon size={17} />}>
            Review {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
          </Button>
        }
      />
    </div>
  )
}

/* ---- step 3: preview ---- */

interface PreviewRowView {
  row: ParsedRow
  payerName: string
  splitWays: number
  valid: boolean
  duplicate: boolean
}

function StepPreview(props: {
  preview: PreviewRowView[]
  paymentCount: number
  parseErrors: { line: number; reason: string }[]
  includeDuplicates: boolean
  dupCount: number
  invalidCount: number
  willImport: number
  targetLabel: string
  imp: ImportProgress | null
  onToggleDuplicates: () => void
  onBack: () => void
  onConfirm: () => void
}) {
  const {
    preview, paymentCount, parseErrors, includeDuplicates, dupCount, invalidCount, willImport,
    targetLabel, imp, onToggleDuplicates, onBack, onConfirm,
  } = props

  const running = imp?.running ?? false

  return (
    <div className="flex flex-col gap-6">
      {/* summary chips */}
      <div className="flex flex-wrap gap-2.5">
        <Stat value={willImport} label="to import" tone="sage" />
        {dupCount > 0 && (
          <Stat
            value={dupCount}
            label={`${dupCount === 1 ? 'duplicate' : 'duplicates'} (${includeDuplicates ? 'included' : 'skipped'})`}
            tone="honey"
          />
        )}
        {paymentCount > 0 && <Stat value={paymentCount} label={`settle-up${paymentCount === 1 ? '' : 's'} skipped`} tone="neutral" />}
        {invalidCount > 0 && <Stat value={invalidCount} label="cannot import" tone="clay" />}
        {parseErrors.length > 0 && <Stat value={parseErrors.length} label={`unreadable row${parseErrors.length === 1 ? '' : 's'}`} tone="clay" />}
      </div>

      {dupCount > 0 && (
        <label
          className="flex items-center gap-2.5"
          style={{ fontSize: 13.5, color: EV.ink70, cursor: 'pointer', userSelect: 'none' }}
        >
          <input type="checkbox" checked={includeDuplicates} onChange={onToggleDuplicates} style={{ width: 16, height: 16, accentColor: EV.clay }} />
          {dupCount === 1
            ? 'Also import the 1 expense that already looks like a duplicate.'
            : `Also import the ${dupCount} expenses that already look like duplicates.`}
        </label>
      )}

      {/* the list */}
      <Surface variant="card" style={{ padding: 4, boxShadow: 'var(--ev-shadow-soft)', maxHeight: 420, overflowY: 'auto' }}>
        {preview.length === 0 ? (
          <p style={{ fontSize: 13.5, color: EV.ink45, padding: '20px 14px', textAlign: 'center' }}>
            No expenses to import from this file.
          </p>
        ) : (
          preview.map((p, i) => {
            const Icon = categoryIcon(p.row.category)
            const muted = !p.valid || (p.duplicate && !includeDuplicates)
            return (
              <div
                key={`${p.row.line}-${i}`}
                className="flex items-center gap-3"
                style={{ padding: '11px 12px', borderTop: i === 0 ? 'none' : `1px solid ${EV.line}`, opacity: muted ? 0.55 : 1 }}
              >
                <IconTile size={34} tone="neutral">
                  <Icon size={17} />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ fontSize: 14, fontWeight: 600, color: EV.ink }}>{p.row.description}</div>
                  <div style={{ fontSize: 12, color: EV.ink45 }} className="truncate">
                    {fmtDate(p.row.dateMs)}
                    {p.valid ? <> · paid by {p.payerName} · split {p.splitWays} {p.splitWays === 1 ? 'way' : 'ways'}</> : ' · could not build a split'}
                  </div>
                </div>
                <div className="flex flex-col items-end" style={{ gap: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: EV.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(p.row.amountMinor, p.row.currency)}
                  </span>
                  {!p.valid ? (
                    <Tag tone="clay">error</Tag>
                  ) : p.duplicate ? (
                    <Tag tone="honey">duplicate</Tag>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </Surface>

      {parseErrors.length > 0 && (
        <details>
          <summary style={{ fontSize: 13, fontWeight: 600, color: EV.clayDeep, cursor: 'pointer' }}>
            {parseErrors.length} row{parseErrors.length === 1 ? '' : 's'} couldn't be read
          </summary>
          <div style={{ marginTop: 8, fontSize: 12.5, color: EV.ink55, lineHeight: 1.6 }}>
            {parseErrors.slice(0, 12).map((e) => (
              <div key={e.line}>Line {e.line}: {e.reason}</div>
            ))}
            {parseErrors.length > 12 && <div>…and {parseErrors.length - 12} more.</div>}
          </div>
        </details>
      )}

      {/* progress / errors during import */}
      {imp && (imp.running || imp.done) && (
        <div>
          <div style={{ height: 8, borderRadius: 6, background: EV.fillGhost, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${imp.total ? Math.round((imp.processed / imp.total) * 100) : 100}%`,
                background: EV.clay,
                transition: 'width 0.2s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 12.5, color: EV.ink55, marginTop: 7 }}>
            {imp.running
              ? `Importing… ${imp.processed} of ${imp.total}`
              : `Done · ${imp.imported} imported${imp.skipped ? ` · ${imp.skipped} skipped` : ''}${imp.errors.length ? ` · ${imp.errors.length} failed` : ''}`}
          </div>
          {imp.done && imp.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: EV.clayDeep, lineHeight: 1.6 }}>
              {imp.errors.slice(0, 6).map((e, i) => (
                <div key={i}>{e.description}: {e.reason}</div>
              ))}
              {imp.errors.length > 6 && <div>…and {imp.errors.length - 6} more.</div>}
            </div>
          )}
        </div>
      )}

      <FooterNav
        onBack={running ? undefined : onBack}
        backLabel="Back"
        next={
          <Button onClick={onConfirm} disabled={running || willImport === 0} icon={running ? undefined : <CheckIcon size={17} />}>
            {running ? 'Importing…' : `Import ${willImport} into ${trim(targetLabel, 18)}`}
          </Button>
        }
      />
    </div>
  )
}

/* ----------------------------------------------------------------- small bits */

function SegBtn({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '11px 14px',
        borderRadius: 12,
        border: `1px solid ${active ? 'transparent' : EV.borderGhost}`,
        background: active ? EV.clay : EV.surface,
        color: active ? EV.paper : disabled ? EV.ink35 : EV.ink70,
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: active ? 'var(--ev-shadow-btn)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

function Stat({ value, label, tone }: { value: number; label: string; tone: 'sage' | 'honey' | 'clay' | 'neutral' }) {
  const color = tone === 'sage' ? EV.sageDeep : tone === 'honey' ? EV.honey : tone === 'clay' ? EV.clayDeep : EV.ink55
  const bg = tone === 'sage' ? 'rgba(156,175,136,0.16)' : tone === 'honey' ? EV.tileHoney : tone === 'clay' ? EV.badgeBg : EV.fillGhost
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '8px 13px' }}>
      <span style={{ fontSize: 17, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 12.5, color: EV.ink55, marginLeft: 7 }}>{label}</span>
    </div>
  )
}

function Tag({ tone, children }: { tone: 'honey' | 'clay'; children: ReactNode }) {
  const color = tone === 'honey' ? EV.honey : EV.clayDeep
  const bg = tone === 'honey' ? EV.tileHoney : EV.badgeBg
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color, background: bg, borderRadius: 999, padding: '2px 8px' }}>
      {children}
    </span>
  )
}

function FooterNav({ onBack, backLabel, next }: { onBack?: () => void; backLabel: string; next: ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="ev-pressable inline-flex items-center gap-1.5"
          style={{ fontSize: 14, fontWeight: 600, color: EV.ink55, background: 'transparent', border: 'none' }}
        >
          <ChevronLeftIcon size={17} />
          {backLabel}
        </button>
      ) : (
        <span />
      )}
      {next}
    </div>
  )
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function trim(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
