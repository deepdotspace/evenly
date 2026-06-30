/**
 * Client wrappers for the settlement server actions (CONTRACT §1.8, §3.7, D5).
 *
 * Ledger writes never go through client `put` -- they call the privileged,
 * validated `recordSettlement` / `deleteSettlement` actions with the user's JWT.
 * The action authorizes the caller, snapshots FX, writes atomically, and appends
 * an audit row; balances re-derive live from the new ledger entry.
 */

import { getAuthToken } from 'deepspace'
import type { SettlementMethod } from '../../lib/data/types'

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface RecordSettlementInput {
  groupId: string
  fromUserId: string
  toUserId: string
  /** Integer minor units in `currency`. */
  amountMinor: number
  currency?: string
  method?: SettlementMethod
  note?: string | null
  settledAtMs?: number
  /** Supplied only when the FX cache lacks the pair (CONTRACT §4). */
  manualRate?: number | null
}

async function callAction<T>(name: string, params: Record<string, unknown>): Promise<ActionResult<T>> {
  const token = await getAuthToken()
  if (!token) return { success: false, error: 'You need to be signed in to record a payment.' }
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

/** Record a payment (full or partial -- the remainder simply carries). */
export function recordSettlement(input: RecordSettlementInput): Promise<ActionResult<{ settlementId: string }>> {
  return callAction<{ settlementId: string }>('recordSettlement', { ...input })
}

/** Soft-delete a settlement (revertible audit). */
export function deleteSettlement(settlementId: string): Promise<ActionResult<{ settlementId: string; deleted: boolean }>> {
  return callAction<{ settlementId: string; deleted: boolean }>('deleteSettlement', { settlementId })
}
