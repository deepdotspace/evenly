/**
 * Receipt-photo downscale (CONTRACT §3.6 A6).
 *
 * A modern phone photo is often 8-20 MB, which exceeds the vision API's per-image
 * byte limit: the upload then fails outright, and the base64 fallback would hold the
 * full bytes in Worker memory. The parser only needs roughly ~1500px on the long
 * edge to read line items, so we cap the long edge at 1600px and re-encode as JPEG.
 * That keeps the resolution vision needs while bringing the bytes well under the cap.
 *
 * One pass, no tiers, no retries. Fail-OPEN: if the image is already small enough,
 * or anything in the decode/encode fails (an unsupported format, no canvas), the
 * ORIGINAL file is returned unchanged so the scan flow is never blocked.
 */

const MAX_EDGE = 1600
/** Below this, and within the dimension cap, the original is already fine. */
const SIZE_THRESHOLD = 1_500_000
const JPEG_QUALITY = 0.85

type Decoded = { draw: CanvasImageSource; width: number; height: number; release: () => void }

async function decode(file: File): Promise<Decoded> {
  // Prefer createImageBitmap (off-DOM, applies EXIF orientation so OCR sees it upright).
  if (typeof createImageBitmap === 'function') {
    try {
      // `from-image` applies EXIF orientation; cast loosely since older DOM libs
      // type imageOrientation as only 'none' | 'flipY'.
      const opts = { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions
      const bmp = await createImageBitmap(file, opts)
      return { draw: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() }
    } catch {
      /* fall through to the <img> path (e.g. browsers without bitmap orientation) */
    }
  }
  return await new Promise<Decoded>((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () =>
      resolve({
        draw: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image decode failed'))
    }
    img.src = url
  })
}

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  let decoded: Decoded | null = null
  try {
    decoded = await decode(file)
    const { draw, width, height } = decoded
    const longEdge = Math.max(width, height)
    if (longEdge <= MAX_EDGE && file.size <= SIZE_THRESHOLD) return file

    const scale = Math.min(1, MAX_EDGE / longEdge)
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // Flatten any alpha onto white so a re-encode to JPEG never blackens the page.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(draw, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file // never hand back something larger

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    decoded?.release()
  }
}
