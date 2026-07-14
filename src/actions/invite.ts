/**
 * Shareable-invite-link flow (CONTRACT §1.5, §1.6, §4 "Guest / placeholder members").
 *
 * The "join via link" model: an admin/member mints ONE group-level link; a friend
 * opens it, signs in, and either claims an existing placeholder ("who are you?") or
 * joins as a brand-new member. Three actions:
 *
 *   createInvite   mint (or rotate) the group's `inviteToken`. Any active member may
 *                  fetch/create the link; only an admin/creator may rotate (which
 *                  instantly kills the old link). Returns the raw token — the client
 *                  builds the URL so it is correct on any host (dev / prod).
 *   resolveInvite  token -> { groupName, roster, alreadyMember }. Gated by the token,
 *                  NOT membership (the friend is not a member yet). Returns display
 *                  identities only — never any balance / ledger data.
 *   acceptInvite   token + { claim } -> claim a placeholder (runClaimGuest rewrite) or
 *                  join as a new member (addMemberCore). Idempotent; the token is the
 *                  authorization (the caller's real userId comes from the verified JWT,
 *                  so nobody can claim/join "as" someone else).
 *
 * SECURITY: the token lives on the `groups` row, which is read:'shared' — a non-member
 * never receives it over the WS. The actions look the group up BY token via
 * `tools.query` (RBAC-bypassed), so the token only ever travels server-side. Only
 * UNCLAIMED placeholders are claimable; a claimed slot is locked. This is the
 * trust-based model (anyone with the link can join, like Splitwise) with the guardrails
 * that a claim binds to the caller's JWT identity and an admin can rotate to revoke.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import { enqueueJob } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { GroupData, GroupMemberData, MemberId, UserProfileData } from '../lib/data/types'
import {
  estimateGroupRowCount,
  runClaimGuest,
  type ClaimIdentity,
} from './claim'
import { addMemberCore } from './membership'
import {
  fail,
  isAdmin,
  isMember,
  LARGE_GROUP_ROW_THRESHOLD,
  loadGroup,
  loadRecord,
  logActivity,
  ok,
  queryAll,
  resolveDisplayName,
  type RecordEnvelope,
} from './helpers'

/** A 128-bit URL-safe token. Unguessable; the whole security of the link rests on it. */
function newInviteToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/** Find the (single) group whose current invite token matches, or null. tools.query
 *  bypasses RBAC, so this resolves a group for a caller who is NOT yet a member. */
async function groupForToken(
  tools: ActionTools,
  token: string,
): Promise<RecordEnvelope<GroupData> | null> {
  if (!token) return null
  const rows = await queryAll<GroupData>(tools, 'groups', { inviteToken: token })
  return rows[0] ?? null
}

/** True once a link has an expiry that is in the past. Expiry is forward-looking:
 *  createInvite mints non-expiring links today (Splitwise-style), but the check is
 *  wired so adding a TTL later is a one-line change, not new plumbing. */
function isExpired(g: RecordEnvelope<GroupData>): boolean {
  return !!g.data.inviteExpiresMs && g.data.inviteExpiresMs < Date.now()
}

/** An archived group is read-only: no new invites, no joining. */
function isArchived(g: RecordEnvelope<GroupData>): boolean {
  return !!g.data.archivedAt
}

/* --------------------------------------------------------------- createInvite */

export const createInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const groupId = params.groupId as string
  const rotate = params.rotate === true
  if (!groupId) return fail('groupId is required')

  const g = await loadGroup(tools, groupId)
  if (!g.ok) return fail(g.error)
  if (isArchived(g.record)) return fail('This group has been archived.')

  // Any active member can share the link; only an admin/creator can rotate it
  // (rotating kills every previously-shared link, so it is a privileged change).
  if (!isMember(g.record, userId)) return fail('Forbidden: only a member can invite')
  if (rotate && !isAdmin(g.record, userId)) {
    return fail('Forbidden: only an admin can regenerate the invite link')
  }

  const existing = g.record.data.inviteToken
  if (existing && !rotate) return ok({ token: existing, created: false })

  const token = newInviteToken()
  const upd = await tools.update('groups', groupId, { inviteToken: token, inviteExpiresMs: null })
  if (!upd.success) return upd
  return ok({ token, created: true, rotated: !!existing })
}

/* -------------------------------------------------------------- resolveInvite */

export interface InviteRosterSlot {
  guestId: string | null
  displayName: string
  avatarUrl: string | null
  /** An unclaimed placeholder the caller may claim as themselves. */
  claimable: boolean
  /** Already a real, signed-up member — shown locked. */
  claimed: boolean
}

export const resolveInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const token = params.token as string
  const g = await groupForToken(tools, token)
  if (!g) return fail('This invite link is invalid or has been turned off.')
  if (isExpired(g)) return fail('This invite link has expired.')
  if (isArchived(g)) return fail('This group has been archived.')

  const alreadyMember = (g.data.memberIds ?? []).includes(userId) || g.createdBy === userId

  const members = await queryAll<GroupMemberData>(tools, 'groupMembers', { groupId: g.recordId })
  const roster: InviteRosterSlot[] = members
    .filter((m) => m.data.status !== 'removed')
    .map((m) => {
      const isGuest = !!m.data.guestId && !m.data.userId
      return {
        guestId: isGuest ? (m.data.guestId as string) : null,
        displayName: m.data.displayName,
        avatarUrl: m.data.avatarUrl ?? null,
        claimable: isGuest && m.data.status === 'active',
        claimed: !!m.data.userId,
      }
    })
    .sort((a, b) => Number(a.claimed) - Number(b.claimed) || a.displayName.localeCompare(b.displayName))

  return ok({
    groupId: g.recordId,
    groupName: g.data.name,
    coverColor: g.data.coverColor ?? null,
    memberCount: roster.length,
    roster,
    alreadyMember,
  })
}

/* --------------------------------------------------------------- acceptInvite */

export const acceptInvite: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const token = params.token as string
  // `claim` is a `guest:<uuid>` to claim that placeholder, or 'new'/null to join fresh.
  const claim = (params.claim as string | null | undefined) ?? null

  const g = await groupForToken(tools, token)
  if (!g) return fail('This invite link is invalid or has been turned off.')
  if (isExpired(g)) return fail('This invite link has expired.')
  if (isArchived(g)) return fail('This group has been archived.')
  const groupId = g.recordId

  // Idempotent: already in the group -> just route them in.
  if ((g.data.memberIds ?? []).includes(userId) || g.createdBy === userId) {
    return ok({ groupId, alreadyMember: true })
  }

  // Resolve intent explicitly so a garbled `claim` (typo, wrong case) is a hard
  // error, never a silent fall-through into "join as new" (which would strand the
  // placeholder's balance and mint a duplicate member).
  const wantsNew = claim === null || claim === 'new'
  if (!wantsNew && !(claim ?? '').startsWith('guest:')) {
    return fail('That invite selection is not valid.')
  }

  const profileRes = await loadRecord<UserProfileData>(tools, 'users', userId)
  const profile = profileRes.ok ? profileRes.record.data : null

  /* --- claim an existing placeholder ------------------------------------- */
  if (!wantsNew) {
    const guestId = claim as string // validated above: non-null, `guest:`-prefixed.
    const members = await queryAll<GroupMemberData>(tools, 'groupMembers', { groupId })
    const guestRow = members.find((m) => m.data.guestId === guestId)
    // Require the slot be an ACTIVE placeholder — the same rule resolveInvite uses to
    // mark it claimable, so the two entry points can't drift (a claim must never
    // resurrect an intentionally-inactivated identity, D8).
    if (!guestRow || guestRow.data.status !== 'active') return fail('That spot is no longer available.')
    if (guestRow.data.userId) return fail('That spot has already been claimed by someone else.')

    // Keep the placeholder's human-picked name unless the claimer has a real
    // identity of their own (a name they set, or the one the SDK holds). We do
    // NOT fall through to the email handle here: a meaningful placeholder like
    // "Priya" beats "heidi.serendipity" when the claimer never set a name.
    const claimName = profile?.displayName?.trim() || profile?.name?.trim() || undefined
    const identity: ClaimIdentity = {
      displayName: claimName,
      avatarUrl: profile?.avatarUrl ?? null,
      paymentHandles: profile?.paymentHandles ?? null,
    }
    const summary = `${identity.displayName ?? guestRow.data.displayName} joined and claimed their spot`

    // Membership after the rewrite (guest id -> real userId), for the audit row.
    const postMemberIds: MemberId[] = (g.data.memberIds ?? []).map((id) => (id === guestId ? userId : id))

    // ACCEPTED RACE (documented, not locked): two different new users claiming the
    // SAME slot within one round-trip can both pass the checks above. The `noop`
    // guard below turns the loser's inline attempt into an honest error; the true
    // simultaneous split-brain is the same "two members mutate at the same instant"
    // event the codebase deliberately chose NOT to CAS-lock (over-engineering for a
    // Σ-conserving, admin-recoverable consistency blip). No SDK conditional-write
    // primitive exists to close it cheaply.

    // Large fan-out -> background Job (D5, subrequest ceiling); the group's memberIds
    // flip happens in the final idempotent pass, so the member appears once it lands.
    const rowCount = await estimateGroupRowCount(tools, groupId)
    if (rowCount > LARGE_GROUP_ROW_THRESHOLD) {
      const jobId = await enqueueJob(
        env.JOB_ROOMS,
        `app:${env.APP_NAME}`,
        'claim-guest',
        { groupId, guestId, userId, identity },
        { maxAttempts: 3, enqueuedBy: userId },
      )
      // Audit the join now (parity with the inline path) — the Job only finishes the
      // idempotent row rewrite; it does not own the feed entry.
      await logActivity(tools, { groupId, memberIds: postMemberIds, type: 'member.added', actorId: userId, targetId: groupId, payload: { summary } })
      return ok({ groupId, claimed: guestId, pending: true, jobId })
    }

    const result = await runClaimGuest(tools, { groupId, guestId, userId, identity })
    if (result.error) return fail(result.error)
    if (result.noop) return fail('That spot was just claimed by someone else. Pick another, or join as new.')
    await logActivity(tools, { groupId, memberIds: postMemberIds, type: 'member.added', actorId: userId, targetId: groupId, payload: { summary } })
    return ok({ groupId, claimed: guestId })
  }

  /* --- join as a brand-new member ---------------------------------------- */
  // A new member with no set name still gets their real identity (SDK name /
  // email handle), never the bare "Member" placeholder.
  const displayName = resolveDisplayName(profile)
  const res = await addMemberCore(tools, env, {
    groupId,
    memberId: userId,
    role: 'member',
    displayName,
    avatarUrl: profile?.avatarUrl ?? null,
    paymentHandles: profile?.paymentHandles ?? null,
    enqueuedBy: userId,
  })
  if (!res.ok) return fail(res.error)
  await logActivity(tools, {
    groupId,
    memberIds: res.memberIds,
    type: 'member.added',
    actorId: userId,
    targetId: groupId,
    payload: { summary: `${displayName} joined the group` },
  })
  return ok({ groupId, joined: true })
}

export const inviteActions: Record<string, ActionHandler<Env>> = {
  createInvite,
  resolveInvite,
  acceptInvite,
}
