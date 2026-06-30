/**
 * Client-side image downscale for group cover uploads (CONTRACT §7 UX patterns —
 * "downscale before upload for avatars + group covers", NOT receipts). Keeps R2
 * objects small and the cover crisp at banner sizes. Falls back to the original
 * file if the browser can't decode it.
 */

/** Downscale an image File to a JPEG Blob no larger than `maxDim` on its long edge. */
export async function downscaleImage(file: File, maxDim = 1280, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = Math.min(1, maxDim / longEdge)
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    return blob ?? file
  } finally {
    bitmap.close?.()
  }
}
