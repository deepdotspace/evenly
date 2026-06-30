/**
 * recurringExpenses actions + the materialization engine (CONTRACT §1.12, §3.11, §4).
 *
 * A `recurringExpenses` row is a TEMPLATE (description/category/currency/amount/
 * paidBy/splitConfig) plus a cadence, a timezone, a `nextRunAtMs`, an optional
 * `endsAtMs`, and an `active` flag. The cron tick (and the manual "run now") turn
 * a due template into a normal `expenses` row carrying `recurringId`, via the SAME
 * path `addExpense` uses: recompute `splits` with the engine, snapshot FX at entry
 * (D4), assert Σ paidBy === Σ splits === amount, write the row, append `activity`.
 *
 * Idempotency: an occurrence is keyed on `(recurringId, occurrenceDayKey)` — a
 * retry (or a manual run that collides with a scheduled one) never double-creates.
 *
 * Departed members: at materialization, inactive/removed members are dropped and
 * the occurrence is re-split among the survivors; if no one is left (or the payer
 * has gone) the template is PAUSED rather than posting a wrong charge (§4).
 *
 * Authorization mirrors the ledger actions: any active member may manage a group's
 * recurring templates (D8). The cron path runs as the app owner (bypasses RBAC).
 *
 * Keep the `recurringActions` export name (index.ts binds to it).
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { snapshotFxRate } from '../lib/fx'
import { truthy } from '../lib/data/types'
import type {
  ExpenseData,
  FxRatesData,
  GroupData,
  GroupMemberData,
  RecurringExpenseData,
  RecurringTemplate,
  Cadence,
} from '../lib/data/types'
import {
  computeNextRun,
  occurrenceDayKey,
  planOccurrence,
  toNoonDay,
  validateTemplate,
  type MemberLite,
} from '../components/recurring/schedule'
import { fail, isMember, loadGroup, loadRecord, logActivity, ok } from './helpers'

/* ------------------------------------------------------------- record I/O port */

/**
 * The minimal record surface the materializer needs, in one uniform UNWRAPPED
 * shape so the logic is written once and runs over both an HTTP action's
 * `ActionTools` and the cron `ctx.records` (different envelopes/return shapes).
 */
export interface RecRecordIO {
  get<T>(collection: string, recordId: string): Promise<{ recordId: string; data: T } | null>
  query<T>(collection: string, where?: Record<string, unknown>): Promise<{ recordId: string; data: T }[]>
  create(collection: string, data: Record<string, unknown>): Promise<string>
  update(collection: string, recordId: string, data: Record<string, unknown>): Promise<void>
}

/** Adapt an HTTP action's `ActionTools` to the uniform port. */
function toolsIO(tools: ActionTools): RecRecordIO {
  return {
    async get(collection, recordId) {
      const res = await tools.get(collection, recordId)
      if (!res.success) return null
      const rec = (res.data as { record?: { recordId: string; data: unknown } }).record
      return rec ? { recordId: rec.recordId, data: rec.data as never } : null
    },
    async query(collection, where) {
      const res = await tools.query(collection, where ? { where } : undefined)
      if (!res.success) return []
      const records = (res.data as { records: { recordId: string; data: unknown }[] }).records
      return records.map((r) => ({ recordId: r.recordId, data: r.data as never }))
    },
    async create(collection, data) {
      const res = await tools.create(collection, data)
      if (!res.success) throw new Error(res.error)
      return (res.data as { recordId: string }).recordId
    },
    async update(collection, recordId, data) {
      const res = await tools.update(collection, recordId, data)
      if (!res.success) throw new Error(res.error)
    },
  }
}

/* ----------------------------------------------------------- the materializer */

type Outcome = 'created' | 'duplicate' | 'paused' | 'error'

/** Bound on catch-up creations per row per tick (a dormant daily template). */
const MAX_CATCHUP = 60

function membersFor(rows: { recordId: string; data: GroupMemberData }[]): MemberLite[] {
  return rows.map((r) => ({
    id: r.data.userId ?? r.data.guestId ?? r.recordId,
    status: r.data.status,
  }))
}

/**
 * Materialize ONE occurrence of a recurring row at `occurrenceMs`. Idempotent on
 * `(recurringId, day)`; snapshots FX at entry; appends a `recurring.materialized`
 * activity row. `actorId` is the caller (manual run) or the app owner (cron).
 */
async function materializeOne(
  io: RecRecordIO,
  row: { recordId: string; data: RecurringExpenseData },
  occurrenceMs: number,
  actorId: string,
): Promise<Outcome> {
  const rec = row.data

  const group = await io.get<GroupData>('groups', rec.groupId)
  if (!group) return 'paused' // group gone -> stop trying

  const members = membersFor(await io.query<GroupMemberData>('groupMembers', { groupId: rec.groupId }))
  const plan = planOccurrence(rec.template, members)
  if (!plan.ok || !plan.splits || !plan.paidBy || !plan.splitConfig) return 'paused'

  // Idempotency: has an occurrence for this day already been posted? Unbounded
  // query (no limit) returns the WHOLE ledger, so the dedupe can't miss an existing
  // occurrence past some page boundary (see queryAll's note on 0.4.3 query semantics).
  const dayKey = occurrenceDayKey(occurrenceMs)
  const existing = await io.query<ExpenseData>('expenses', { groupId: rec.groupId })
  const dup = existing.some(
    (e) =>
      e.data.recurringId === row.recordId &&
      !e.data.deletedAt &&
      e.data.expenseAtMs != null &&
      occurrenceDayKey(e.data.expenseAtMs) === dayKey,
  )
  if (dup) return 'duplicate'

  // FX snapshot (same currency -> rate 1; foreign + no cached rate -> retry later).
  const fxRows = (await io.query<FxRatesData>('fxRates')).map((r) => r.data)
  const snap = snapshotFxRate({
    currency: rec.template.currency,
    primaryCurrency: group.data.primaryCurrency,
    rows: fxRows,
  })
  if (!snap) return 'error'

  const memberIds = group.data.memberIds
  const expenseId = await io.create('expenses', {
    groupId: rec.groupId,
    memberIds,
    description: rec.template.description,
    category: rec.template.category || 'other',
    currency: rec.template.currency,
    amountMinor: rec.template.amountMinor,
    fxRate: snap.fxRate,
    fxAsOf: snap.fxAsOf,
    paidBy: plan.paidBy,
    splits: plan.splits,
    splitConfig: plan.splitConfig,
    expenseAtMs: occurrenceMs,
    receiptId: null,
    isReimbursement: false,
    recurringId: row.recordId,
    note: null,
    deletedAt: null,
  })

  await io.create('activity', {
    groupId: rec.groupId,
    memberIds,
    type: 'recurring.materialized',
    actorId,
    targetId: expenseId,
    payload: {
      after: {
        description: rec.template.description,
        amountMinor: rec.template.amountMinor,
        currency: rec.template.currency,
      },
      summary: `Recurring "${rec.template.description}" posted`,
    },
  })

  return 'created'
}

/**
 * Scan every recurring row and materialize all DUE occurrences (catch-up bounded
 * per row), advancing `nextRunAtMs`/`lastRunAtMs` and pausing the template when a
 * change makes it un-postable. Runs as the app owner from cron (CONTRACT §4 cron
 * owner-billing: creating expenses is idempotent per day, so retries are safe).
 *
 * NOTE (footgun #4): a DeepSpace CronRoom never fires until WARMED, so this only
 * runs after the deploy warm step — the "Run now" button is the always-reliable
 * manual path.
 */
export async function materializeDueRecurring(
  io: RecRecordIO,
  nowMs: number,
  actorId: string,
): Promise<{ created: number; paused: number }> {
  const rows = await io.query<RecurringExpenseData>('recurringExpenses')
  let created = 0
  let paused = 0

  for (const row of rows) {
    const rec = row.data
    if (!truthy(rec.active)) continue
    if (!rec.nextRunAtMs) continue

    let nextMs = rec.nextRunAtMs
    let lastRun: number | null = rec.lastRunAtMs ?? null
    let active = true
    let changed = false
    let guard = 0

    while (active && nextMs <= nowMs && guard < MAX_CATCHUP) {
      if (rec.endsAtMs && nextMs > rec.endsAtMs) {
        active = false
        break
      }
      const outcome = await materializeOne(io, row, nextMs, actorId)
      if (outcome === 'paused') {
        active = false
        paused += 1
        break
      }
      if (outcome === 'error') {
        // Transient (e.g. FX not yet cached) -> stop, keep nextMs, retry next tick.
        break
      }
      if (outcome === 'created') {
        created += 1
        lastRun = nowMs
      }
      nextMs = computeNextRun(nextMs, rec.cadence)
      changed = true
      guard += 1
      if (rec.endsAtMs && nextMs > rec.endsAtMs) {
        active = false
        break
      }
    }

    if (changed || !active) {
      await io.update('recurringExpenses', row.recordId, {
        nextRunAtMs: nextMs,
        lastRunAtMs: lastRun,
        active: active ? rec.active : false,
      })
    }
  }

  return { created, paused }
}

/* ------------------------------------------------------------------ actions */

interface CreateParams {
  groupId: string
  template: RecurringTemplate
  cadence: Cadence
  timezone?: string
  nextRunAtMs: number
  endsAtMs?: number | null
  active?: boolean
}

const createRecurring: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const p = params as unknown as CreateParams
  if (!p.groupId || !p.template || !p.cadence || !p.nextRunAtMs) {
    return fail('groupId, template, cadence and a start date are required')
  }
  const g = await loadGroup(tools, p.groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  const invalid = validateTemplate(p.template)
  if (invalid) return fail(invalid)

  const created = await tools.create('recurringExpenses', {
    groupId: p.groupId,
    memberIds: g.record.data.memberIds,
    template: p.template,
    cadence: p.cadence,
    timezone: p.timezone || 'UTC',
    nextRunAtMs: p.nextRunAtMs,
    lastRunAtMs: null,
    endsAtMs: p.endsAtMs ?? null,
    active: p.active ?? true,
  })
  if (!created.success) return created

  await logActivity(tools, {
    groupId: p.groupId,
    memberIds: g.record.data.memberIds,
    type: 'recurring.created',
    actorId: userId,
    targetId: created.data.recordId,
    payload: {
      after: {
        description: p.template.description,
        amountMinor: p.template.amountMinor,
        currency: p.template.currency,
      },
      summary: `Set up recurring "${p.template.description}"`,
    },
  })

  return ok({ recurringId: created.data.recordId })
}

interface UpdateParams {
  recurringId: string
  patch: Partial<{
    template: RecurringTemplate
    cadence: Cadence
    timezone: string
    nextRunAtMs: number
    endsAtMs: number | null
    active: boolean
  }>
}

const updateRecurring: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const p = params as unknown as UpdateParams
  if (!p.recurringId) return fail('recurringId is required')

  const rec = await loadRecord<RecurringExpenseData>(tools, 'recurringExpenses', p.recurringId)
  if (!rec.ok) return fail(rec.error)
  const g = await loadGroup(tools, rec.record.data.groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  const patch = p.patch ?? {}
  const update: Record<string, unknown> = {}
  if (patch.template !== undefined) {
    const invalid = validateTemplate(patch.template)
    if (invalid) return fail(invalid)
    update.template = patch.template
  }
  if (patch.cadence !== undefined) update.cadence = patch.cadence
  if (patch.timezone !== undefined) update.timezone = patch.timezone
  if (patch.nextRunAtMs !== undefined) update.nextRunAtMs = patch.nextRunAtMs
  if (patch.endsAtMs !== undefined) update.endsAtMs = patch.endsAtMs
  if (patch.active !== undefined) update.active = patch.active

  if (Object.keys(update).length === 0) return ok({ recurringId: p.recurringId })

  const res = await tools.update('recurringExpenses', p.recurringId, update)
  if (!res.success) return res
  return ok({ recurringId: p.recurringId })
}

const deleteRecurring: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const recurringId = params.recurringId as string
  if (!recurringId) return fail('recurringId is required')

  const rec = await loadRecord<RecurringExpenseData>(tools, 'recurringExpenses', recurringId)
  if (!rec.ok) return fail(rec.error)
  const g = await loadGroup(tools, rec.record.data.groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  // Hard delete: the template is a schedule, not a ledger fact. Already-posted
  // expenses (with recurringId) stay — they are real charges and revertible on
  // their own. Removing the template only stops future runs.
  const res = await tools.remove('recurringExpenses', recurringId)
  if (!res.success) return res
  return ok({ deleted: true })
}

const runRecurringNow: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const recurringId = params.recurringId as string
  if (!recurringId) return fail('recurringId is required')

  const rec = await loadRecord<RecurringExpenseData>(tools, 'recurringExpenses', recurringId)
  if (!rec.ok) return fail(rec.error)
  const g = await loadGroup(tools, rec.record.data.groupId)
  if (!g.ok) return fail(g.error)
  if (!isMember(g.record, userId)) return fail('Forbidden: not a group member')

  // Materialize the currently-DUE occurrence — at the SCHEDULED `nextRunAtMs`, NOT
  // at "today". This is what closes the cross-day double-post (money review P2):
  // run-now and the cron tick now key the occurrence on the SAME `nextRunAtMs` day,
  // so materializeOne's (recurringId, occurrenceDayKey) dedupe makes them idempotent
  // with each other even when run-now is clicked on a different calendar day. We do
  // NOT advance `nextRunAtMs` here: that keeps repeat run-now clicks idempotent (the
  // 2nd dedupes), and lets the cron tick advance the schedule once — when it reaches
  // this occurrence it sees the dup, skips it, and moves nextRunAtMs forward. Fall
  // back to today only if a template somehow has no nextRunAtMs.
  const io = toolsIO(tools)
  const occurrenceMs = rec.record.data.nextRunAtMs ?? toNoonDay(Date.now())
  const outcome = await materializeOne(io, { recordId: recurringId, data: rec.record.data }, occurrenceMs, userId)

  if (outcome === 'paused') {
    await tools.update('recurringExpenses', recurringId, { active: false })
    return fail(
      'No active members remain to split this with (or the payer has left). This recurring expense was paused — edit it and resume.',
    )
  }
  if (outcome === 'error') {
    return fail(
      "Couldn't post this right now — no exchange rate is available for its currency yet. It will retry automatically.",
    )
  }
  if (outcome === 'duplicate') {
    return ok({ created: false, message: 'This occurrence has already been posted.' })
  }

  // Record the run; leave nextRunAtMs to the cron tick (see comment above).
  await tools.update('recurringExpenses', recurringId, { lastRunAtMs: Date.now() })
  return ok({ created: true })
}

export const recurringActions: Record<string, ActionHandler<Env>> = {
  createRecurring,
  updateRecurring,
  deleteRecurring,
  runRecurringNow,
}
