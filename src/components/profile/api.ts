/**
 * Client wrappers for the profile surface (CONTRACT §1.3, §3.12, D5).
 *
 * The profile edit never goes through client `put`: it calls the privileged
 * `updateProfile` action (which also re-stamps the caller's denormalized identity
 * onto every `groupMembers` row). The avatar is uploaded to R2 at `scope:'app'`
 * (so co-members can render it on a public URL) -- downscaled in the browser first
 * so we ship a small square, not a 12MP phone photo.
 */

import { getAuthToken } from 'deepspace'
import type { NotifyPrefs, PaymentHandles } from '../../lib/data/types'

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface ProfilePatch {
  displayName?: string
  avatarUrl?: string | null
  defaultCurrency?: string
  paymentHandles?: PaymentHandles | null
  notifyPrefs?: NotifyPrefs
}

async function callAction<T>(name: string, params: Record<string, unknown>): Promise<ActionResult<T>> {
  const token = await getAuthToken()
  if (!token) return { success: false, error: 'You need to be signed in to save your profile.' }
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

/** Save the profile + re-stamp identity. `restamped` = membership rows updated. */
export function updateProfile(patch: ProfilePatch): Promise<ActionResult<{ userId: string; restamped: number }>> {
  return callAction<{ userId: string; restamped: number }>('updateProfile', { ...patch })
}

/** The R2 upload fn shape from `useR2Files({ scope: 'app' })`. */
export type UploadFn = (
  file: File | Blob,
  name?: string,
) => Promise<{ success: boolean; key?: string; url?: string; error?: string }>

/**
 * Downscale an image to a square <= `size`px JPEG before upload. Avatars never
 * need more than a couple hundred px, and a phone photo is multiple MB -- this
 * keeps the upload fast and the stored asset tiny. Falls back to the original
 * file if the canvas path is unavailable.
 */
export async function downscaleAvatar(file: File, size = 320): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    return blob ?? file
  } catch {
    return file
  }
}
