/**
 * Profile / settings actions (CONTRACT §1.3, §3.12).
 *
 *  - updateProfile: the caller edits their OWN `users` row (displayName, avatarUrl,
 *    defaultCurrency, paymentHandles, notifyPrefs). `users` is `read:'own'` so
 *    co-members never read it directly; the identity they DO see (displayName /
 *    avatarUrl / opted-in paymentHandles) is denormalized onto each `groupMembers`
 *    row. So after writing the profile we RE-STAMP those three fields onto every
 *    membership row where the caller is the member, keeping co-members in sync.
 *
 * The re-stamp does a bounded number of writes inline; for a user in many groups
 * the remainder is handed to a chunked, idempotent `restamp-identity` Job
 * (`ctx.continue`) so the fan-out never crosses the Worker subrequest ceiling (D5).
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import { enqueueJob } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { GroupMemberData, NotifyPrefs, PaymentHandles, UserProfileData } from '../lib/data/types'
import { fail, LARGE_GROUP_ROW_THRESHOLD, loadRecord, ok, queryAll } from './helpers'

/** ISO-4217 codes we offer in the picker -- guards against a junk default currency. */
const CURRENCY_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR', 'MXN', 'BRL', 'CHF', 'CNY', 'KRW',
  'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'ZAR', 'AED', 'THB', 'PHP', 'IDR', 'MYR',
])

const HANDLE_MAX = 80
const NAME_MAX = 60

/** Trim a handle, drop it if blank or absurdly long. */
function cleanHandle(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (!t) return undefined
  return t.slice(0, HANDLE_MAX)
}

/** Normalize the opt-in payment handles -> object, or null when nothing is set. */
function normalizeHandles(input: unknown): PaymentHandles | null {
  if (input === null) return null
  if (typeof input !== 'object') return null
  const src = input as Record<string, unknown>
  const out: PaymentHandles = {}
  const venmo = cleanHandle(src.venmo)
  const paypalMe = cleanHandle(src.paypalMe)
  const cashtag = cleanHandle(src.cashtag)
  const upiId = cleanHandle(src.upiId)
  if (venmo) out.venmo = venmo
  if (paypalMe) out.paypalMe = paypalMe
  if (cashtag) out.cashtag = cashtag
  if (upiId) out.upiId = upiId
  return Object.keys(out).length > 0 ? out : null
}

/** Coerce the notify toggles to a complete, boolean-clean object. */
function normalizePrefs(input: unknown, prev?: NotifyPrefs | null): NotifyPrefs {
  const src = (typeof input === 'object' && input ? input : {}) as Record<string, unknown>
  const base: NotifyPrefs = prev ?? {
    added: true,
    settled: true,
    comments: true,
    reminders: true,
    weekly: false,
  }
  const pick = (k: keyof NotifyPrefs): boolean =>
    typeof src[k] === 'boolean' ? (src[k] as boolean) : base[k]
  return {
    added: pick('added'),
    settled: pick('settled'),
    comments: pick('comments'),
    reminders: pick('reminders'),
    weekly: pick('weekly'),
  }
}

export interface RestampIdentityArgs {
  userId: string
  identityPatch: Record<string, unknown>
}

/** True when a membership row already carries the exact identity fields we'd write. */
function identityMatches(data: GroupMemberData, patch: Record<string, unknown>): boolean {
  const row = data as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) {
    const cur = row[k]
    if (k === 'paymentHandles') {
      if (JSON.stringify(cur ?? null) !== JSON.stringify(v ?? null)) return false
    } else if (cur !== v) {
      return false
    }
  }
  return true
}

/**
 * Re-stamp the caller's co-member-visible identity (displayName / avatarUrl /
 * paymentHandles) onto every `groupMembers` row where they are the member.
 * Idempotent: a row already matching is skipped, so a Job that yields and resumes
 * makes forward progress and never double-writes. `opts.maxWrites` bounds writes
 * per pass (`done:false` => more rows remain).
 */
export async function restampIdentity(
  tools: ActionTools,
  args: RestampIdentityArgs,
  opts?: { maxWrites?: number },
): Promise<{ done: boolean; written: number }> {
  const { userId, identityPatch } = args
  const cap = opts?.maxWrites
  const rows = await queryAll<GroupMemberData>(tools, 'groupMembers', { userId })
  const mine = rows.filter((r) => r.data.userId === userId)
  let written = 0
  for (const r of mine) {
    if (identityMatches(r.data, identityPatch)) continue
    const res = await tools.update('groupMembers', r.recordId, identityPatch)
    if (res.success) written++
    if (cap && written >= cap) return { done: false, written }
  }
  return { done: true, written }
}

export const updateProfile: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const existing = await loadRecord<UserProfileData>(tools, 'users', userId)
  const prev = existing.ok ? existing.record.data : null

  // Build a partial patch from only the fields the caller actually sent.
  const patch: Record<string, unknown> = {}

  if (params.displayName !== undefined) {
    const name = String(params.displayName).trim().slice(0, NAME_MAX)
    if (!name) return fail('Your name cannot be empty.')
    patch.displayName = name
  }
  if (params.avatarUrl !== undefined) {
    patch.avatarUrl = params.avatarUrl ? String(params.avatarUrl) : null
  }
  if (params.defaultCurrency !== undefined) {
    const code = String(params.defaultCurrency).toUpperCase()
    if (!CURRENCY_CODES.has(code)) return fail(`Unsupported currency: ${code}`)
    patch.defaultCurrency = code
  }
  if (params.paymentHandles !== undefined) {
    patch.paymentHandles = normalizeHandles(params.paymentHandles)
  }
  if (params.notifyPrefs !== undefined) {
    patch.notifyPrefs = normalizePrefs(params.notifyPrefs, prev?.notifyPrefs ?? null)
  }

  if (Object.keys(patch).length === 0) return ok({ userId, unchanged: true, restamped: 0 })

  // Upsert the caller's own `users` row (row id = auth userId). Update when it
  // already exists so we never clobber the SDK-managed base columns; create with
  // the explicit key only on the rare missing-row path.
  if (existing.ok) {
    const updated = await tools.update('users', userId, patch)
    if (!updated.success) return updated
  } else {
    const created = await tools.create('users', { createdAtMs: Date.now(), ...patch }, userId)
    if (!created.success) return created
  }

  // Re-stamp the co-member-visible identity onto the caller's membership rows.
  // Only displayName / avatarUrl / paymentHandles are denormalized (CONTRACT §1.3);
  // currency + notify prefs stay private to `users`.
  const identityPatch: Record<string, unknown> = {}
  if ('displayName' in patch) identityPatch.displayName = patch.displayName
  if ('avatarUrl' in patch) identityPatch.avatarUrl = patch.avatarUrl
  if ('paymentHandles' in patch) identityPatch.paymentHandles = patch.paymentHandles

  let restamped = 0
  let pending = false
  if (Object.keys(identityPatch).length > 0) {
    // Bounded inline re-stamp; if the user is in more groups than that, hand the
    // remainder to the chunked, idempotent `restamp-identity` Job (D5).
    const res = await restampIdentity(tools, { userId, identityPatch }, { maxWrites: LARGE_GROUP_ROW_THRESHOLD })
    restamped = res.written
    if (!res.done) {
      await enqueueJob(
        env.JOB_ROOMS,
        `app:${env.APP_NAME}`,
        'restamp-identity',
        { userId, identityPatch },
        { maxAttempts: 3, enqueuedBy: userId },
      )
      pending = true
    }
  }

  return ok({ userId, restamped, ...(pending ? { pending: true } : {}) })
}

export const profileActions: Record<string, ActionHandler<Env>> = {
  updateProfile,
}
