/**
 * Client wrappers for the group-settings server actions (CONTRACT §3.14, D5, D8).
 *
 * Every group-structure mutation is a privileged, validated action called with
 * the caller's JWT — never a client `put`. The server re-checks admin/creator on
 * the structure changes (rename, currency, members, archive, delete) and appends
 * an audit row; the live record sync refreshes the UI. The settle-then-remove
 * flow (A5) composes the existing `recordSettlement` action with `removeMember`.
 */

import { getAuthToken } from 'deepspace'
import type { GroupData, SplitConfig } from '../../lib/data/types'

/** `groups.icon` / `groups.coverImageKey` (schema §1.5/§7 A4) aren't on the base
 *  type yet; the settings surface reads them through this narrow extension. */
export type GroupSettingsData = GroupData & {
  icon?: string | null
  coverImageKey?: string | null
}

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

async function callAction<T>(name: string, params: Record<string, unknown>): Promise<ActionResult<T>> {
  const token = await getAuthToken()
  if (!token) return { success: false, error: 'You need to be signed in to make this change.' }
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

/** Fields an admin can patch on the group (only changed keys are sent). */
export interface UpdateGroupInput {
  groupId: string
  name?: string
  primaryCurrency?: string
  simplifyDefault?: boolean
  coverColor?: string | null
  icon?: string | null
  coverImageKey?: string | null
  defaultSplit?: SplitConfig | null
  adminIds?: string[]
}

export function updateGroup(input: UpdateGroupInput): Promise<ActionResult<{ groupId: string }>> {
  return callAction<{ groupId: string }>('updateGroup', { ...input })
}

export function archiveGroup(groupId: string, archived: boolean): Promise<ActionResult<{ groupId: string; archived: boolean }>> {
  return callAction<{ groupId: string; archived: boolean }>('archiveGroup', { groupId, archived })
}

export function deleteGroupCascade(groupId: string): Promise<ActionResult<{ removed: number }>> {
  return callAction<{ removed: number }>('deleteGroupCascade', { groupId })
}

export interface AddMemberInput {
  groupId: string
  memberId: string
  displayName: string
  avatarUrl?: string | null
  role?: 'member' | 'admin'
}

export function addGroupMember(input: AddMemberInput): Promise<ActionResult<{ memberIds: string[] }>> {
  return callAction<{ memberIds: string[] }>('addGroupMember', { ...input })
}

export function removeMember(
  groupId: string,
  memberId: string,
  mode: 'remove' | 'inactive',
): Promise<ActionResult<{ memberId: string; status: string }>> {
  return callAction<{ memberId: string; status: string }>('removeMember', { groupId, memberId, mode })
}
