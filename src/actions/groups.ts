/**
 * Group lifecycle actions (CONTRACT §1.5, §3.3, §3.14, D6, D8).
 *
 * Group-STRUCTURE changes (rename, primary currency, simplify default, archive)
 * require the admin/creator role; creation seeds the creator as the sole admin.
 * Everything is a "group" under the hood -- `kind` is presentation only (D6).
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { GroupKind, UserProfileData } from '../lib/data/types'
import {
  fail,
  isAdmin,
  loadGroup,
  loadRecord,
  logActivity,
  ok,
  resolveDisplayName,
} from './helpers'

interface GuestSeed {
  guestId: string
  displayName: string
  avatarUrl?: string | null
}

export const createGroup: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const name = (params.name as string)?.trim()
  if (!name) return fail('name is required')
  const kind = ((params.kind as GroupKind) ?? 'group') as GroupKind

  // Pull profile defaults (currency / identity) for the creator's member row.
  const profileRes = await loadRecord<UserProfileData>(tools, 'users', userId)
  const profile = profileRes.ok ? profileRes.record.data : null

  const primaryCurrency =
    (params.primaryCurrency as string) || profile?.defaultCurrency || 'USD'
  const guests = (params.guests as GuestSeed[] | undefined) ?? []
  const memberIds = [userId, ...guests.map((g) => g.guestId)]

  const created = await tools.create('groups', {
    name,
    kind,
    primaryCurrency,
    memberIds,
    adminIds: [userId],
    simplifyDefault: Boolean(params.simplifyDefault),
    defaultSplit: (params.defaultSplit as unknown) ?? null,
    coverColor: (params.coverColor as string) ?? null,
    archivedAt: null,
  })
  if (!created.success) return created
  const groupId = created.data.recordId

  // Creator membership row (admin) + any guest placeholder rows.
  await tools.create('groupMembers', {
    groupId,
    memberIds,
    userId,
    guestId: null,
    role: 'admin',
    status: 'active',
    displayName: (params.creatorDisplayName as string)?.trim() || resolveDisplayName(profile),
    avatarUrl: (params.creatorAvatarUrl as string) ?? profile?.avatarUrl ?? null,
    paymentHandles: (params.creatorPaymentHandles as unknown) ?? profile?.paymentHandles ?? null,
    joinedAtMs: Date.now(),
  })
  for (const g of guests) {
    await tools.create('groupMembers', {
      groupId,
      memberIds,
      userId: null,
      guestId: g.guestId,
      role: 'member',
      status: 'active',
      displayName: g.displayName || 'Guest',
      avatarUrl: g.avatarUrl ?? null,
      joinedAtMs: Date.now(),
    })
  }

  await logActivity(tools, {
    groupId,
    memberIds,
    type: 'group.created',
    actorId: userId,
    targetId: groupId,
    payload: { summary: `Created "${name}"` },
  })

  return ok({ groupId, memberIds })
}

export const updateGroup: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const groupId = params.groupId as string
  if (!groupId) return fail('groupId is required')
  const g = await loadGroup(tools, groupId)
  if (!g.ok) return fail(g.error)
  if (!isAdmin(g.record, userId)) return fail('Forbidden: admin only')

  const patch: Record<string, unknown> = {}
  if (typeof params.name === 'string') patch.name = params.name.trim()
  if (typeof params.primaryCurrency === 'string') patch.primaryCurrency = params.primaryCurrency
  if (params.simplifyDefault !== undefined) patch.simplifyDefault = Boolean(params.simplifyDefault)
  if (params.coverColor !== undefined) patch.coverColor = params.coverColor ?? null
  if (params.icon !== undefined) patch.icon = params.icon ?? null
  if (params.coverImageKey !== undefined) patch.coverImageKey = params.coverImageKey ?? null
  if (params.defaultSplit !== undefined) patch.defaultSplit = params.defaultSplit ?? null
  if (Array.isArray(params.adminIds)) {
    // Admins may promote/demote, but only current members can be admins, and a
    // group must always keep at least one admin (no lock-out, no phantom admin).
    const memberSet = new Set(g.record.data.memberIds)
    const nextAdmins = (params.adminIds as string[]).filter((id) => memberSet.has(id))
    if (nextAdmins.length === 0) return fail('A group must have at least one admin who is a member')
    patch.adminIds = nextAdmins
  }

  if (Object.keys(patch).length === 0) return ok({ groupId, unchanged: true })

  const before = { name: g.record.data.name, primaryCurrency: g.record.data.primaryCurrency }
  const updated = await tools.update('groups', groupId, patch)
  if (!updated.success) return updated

  if (typeof patch.name === 'string' && patch.name !== before.name) {
    await logActivity(tools, {
      groupId,
      memberIds: g.record.data.memberIds,
      type: 'group.renamed',
      actorId: userId,
      targetId: groupId,
      payload: { before: { name: before.name }, after: { name: patch.name }, summary: `Renamed to "${patch.name}"` },
    })
  }

  return ok({ groupId })
}

export const archiveGroup: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const groupId = params.groupId as string
  if (!groupId) return fail('groupId is required')
  const archived = params.archived === undefined ? true : Boolean(params.archived)

  const g = await loadGroup(tools, groupId)
  if (!g.ok) return fail(g.error)
  if (!isAdmin(g.record, userId)) return fail('Forbidden: admin only')

  const updated = await tools.update('groups', groupId, {
    archivedAt: archived ? Date.now() : null,
  })
  if (!updated.success) return updated
  return ok({ groupId, archived })
}

export const groupActions: Record<string, ActionHandler<Env>> = {
  createGroup,
  updateGroup,
  archiveGroup,
}
