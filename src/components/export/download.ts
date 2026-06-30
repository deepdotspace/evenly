/**
 * Client-side file download helpers (CONTRACT §3.4 export — read-only, no server).
 *
 * Triggers a real browser download from an in-memory string via a Blob + a
 * transient `<a download>` click, then revokes the object URL. No network, no
 * server action — the export is computed and delivered entirely on the client.
 */

/** A filesystem-safe slug from a group name (lowercased, hyphenated, trimmed). */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'group'
}

/** A `YYYY-MM-DD` stamp for the filename, in local time. */
export function dateStamp(ms: number = Date.now()): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** `evenly-<group>-<date>` — the shared stem for an export's filename. */
export function exportStem(groupName: string, ms?: number): string {
  return `evenly-${slugify(groupName)}-${dateStamp(ms)}`
}

/** Download `text` as a file. `mime` defaults to CSV. */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on the next tick so the click has committed the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
