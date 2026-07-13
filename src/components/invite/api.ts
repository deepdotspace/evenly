/**
 * Client wrappers for the shareable-invite server actions (src/actions/invite.ts).
 *
 * Same shape as the other action clients: a JWT-authed POST to /api/actions/:name.
 * The invite link URL is built on the client from `window.location.origin`, so it
 * is correct on any host (localhost in dev, evenly.app.space in prod) — the server
 * only ever mints and returns the raw token.
 */

import { getAuthToken } from 'deepspace'

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

async function callAction<T>(name: string, params: Record<string, unknown>): Promise<ActionResult<T>> {
  const token = await getAuthToken()
  if (!token) return { success: false, error: 'You need to be signed in.' }
  try {
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const json = (await res.json().catch(() => null)) as ActionResult<T> | null
    if (!json) return { success: false, error: `Request failed (${res.status})` }
    if (!res.ok && json.success !== false) {
      return { success: false, error: json.error ?? `Request failed (${res.status})` }
    }
    return json
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/** One roster row on the join screen. Names only — never any balance data. */
export interface InviteRosterSlot {
  guestId: string | null
  displayName: string
  avatarUrl: string | null
  claimable: boolean
  claimed: boolean
}

export interface InviteResolution {
  groupId: string
  groupName: string
  coverColor: string | null
  memberCount: number
  roster: InviteRosterSlot[]
  alreadyMember: boolean
}

export interface AcceptResult {
  groupId: string
  alreadyMember?: boolean
  claimed?: string
  joined?: boolean
  pending?: boolean
}

/** Mint (or fetch) the group's invite token. `rotate` regenerates it (admin only). */
export function createInvite(groupId: string, rotate = false): Promise<ActionResult<{ token: string; created: boolean; rotated?: boolean }>> {
  return callAction('createInvite', { groupId, rotate })
}

/** Resolve a token to the group + roster (gated by the token, not membership). */
export function resolveInvite(token: string): Promise<ActionResult<InviteResolution>> {
  return callAction('resolveInvite', { token })
}

/** Claim a placeholder (`guest:<uuid>`) or join as a new member (`'new'`). */
export function acceptInvite(token: string, claim: string | 'new'): Promise<ActionResult<AcceptResult>> {
  return callAction('acceptInvite', { token, claim })
}

/** Build the shareable URL for a token from the current origin. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/join/${token}`
}
