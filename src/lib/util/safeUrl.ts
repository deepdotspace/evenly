/**
 * safeUrl - scheme-allowlist a (possibly user-controlled) URL before it reaches
 * an href / src sink, so a stored `javascript:`, `data:text/html`, `vbscript:`
 * or `file:` URL can never execute in a victim's authenticated session.
 *
 * Why this exists: the DeepSpace SDK stores `{kind:'url'}` columns verbatim (it
 * does not sanitize them), and React does not sanitize `href`. A member can set a
 * receipt's `imageUrl` (or a group cover, or their avatar) to `javascript:...`;
 * when a co-member opens that record and the value lands in an `<a href>`, the
 * payload runs. Every render site that interpolates a stored URL into href/src
 * must pass it through here first.
 *
 * Returns the URL unchanged when its scheme is allowed, otherwise `undefined`
 * (so the attribute renders empty / inert rather than dangerous).
 *
 *   safeUrl(x)                 -> links:  http, https, mailto, same-origin / relative.
 *   safeUrl(x, { image: true }) -> the above PLUS `blob:` and `data:image/*` for
 *                                 in-browser image previews. Still rejects every
 *                                 script-bearing scheme.
 *
 * Parsing (not regex) is used for the scheme check so control-character tricks
 * like `java\nscript:` - which the URL parser strips before resolving - cannot
 * slip a dangerous scheme past the allowlist.
 */

const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

export function safeUrl(
  raw: string | null | undefined,
  opts: { image?: boolean } = {},
): string | undefined {
  if (typeof raw !== 'string') return undefined
  const url = raw.trim()
  if (!url) return undefined

  // Clearly-relative / same-origin references (leading /, #, ?, ./, ../) carry no
  // scheme and are always safe to render.
  if (/^(?:[/#?]|\.{1,2}\/)/.test(url)) return url

  // Image sinks may also carry an in-browser blob preview or an inline image.
  // `data:image/*` cannot execute script; `data:text/html` and friends are rejected.
  if (opts.image) {
    if (/^blob:/i.test(url)) return url
    if (/^data:image\//i.test(url)) return url
  }

  // Everything else must resolve to an explicitly-allowed scheme. Resolving
  // against our origin means a scheme-less value (e.g. "files/x") becomes
  // http(s) and is allowed; an explicit dangerous scheme keeps its protocol and
  // is rejected.
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  let scheme: string
  try {
    scheme = new URL(url, base).protocol.toLowerCase()
  } catch {
    return undefined
  }

  return LINK_SCHEMES.has(scheme) ? url : undefined
}
