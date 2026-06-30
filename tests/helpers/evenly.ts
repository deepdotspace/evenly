/**
 * Evenly test helpers (Phase 6 e2e).
 *
 * Real auth + real server actions + real record store. Seeds data through the
 * app's own server actions (`POST /api/actions/<name>`, Bearer JWT) and asserts
 * against the GROUND-TRUTH record store via the SDK debug routes:
 *
 *   GET /api/debug/records/<collection>          -> every row (no RBAC)         [truth]
 *   GET /api/debug/query?collection&userId&role  -> rows VISIBLE to <userId>    [RBAC]
 *
 * Both are enabled only when ALLOW_DEBUG_ROUTES=true, which `deepspace dev`/
 * `deepspace test` writes to .dev.vars (stripped on deploy). The JWT comes from
 * the same `/api/auth/token` endpoint the SDK's getAuthToken() uses, so the call
 * is authenticated exactly as a signed-in browser would be.
 */
import { expect, type Page } from '@playwright/test'

export interface Envelope<T = Record<string, unknown>> {
  recordId: string
  data: T
  createdBy?: string
  createdAt?: string
}

export interface ActionResult<T = Record<string, unknown>> {
  success: boolean
  data?: T
  error?: string
}

/** Mint a Bearer JWT for the page's signed-in identity (same path as the SDK). */
export async function getToken(page: Page): Promise<string> {
  const res = await page.request.post('/api/auth/token')
  expect(res.ok(), `POST /api/auth/token -> ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { token?: string }
  expect(json.token, 'auth token present').toBeTruthy()
  return json.token as string
}

/** The signed-in userId, decoded from the JWT subject. */
export async function whoami(page: Page): Promise<string> {
  const token = await getToken(page)
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  ) as { sub?: string; userId?: string }
  const id = payload.userId ?? payload.sub
  expect(id, 'userId in JWT').toBeTruthy()
  return id as string
}

/** Call a server action; returns the raw {success,data,error} envelope. */
export async function act<T = Record<string, unknown>>(
  page: Page,
  name: string,
  body: Record<string, unknown>,
): Promise<ActionResult<T>> {
  const token = await getToken(page)
  const res = await page.request.post(`/api/actions/${name}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: body,
  })
  return (await res.json()) as ActionResult<T>
}

/** Call a server action and assert success; returns data. */
export async function actOk<T = Record<string, unknown>>(
  page: Page,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const r = await act<T>(page, name, body)
  expect(r.success, `action ${name} failed: ${r.error ?? '(no error)'}`).toBeTruthy()
  return r.data as T
}

/** Ground-truth: every row of a collection (no RBAC filter). */
export async function records<T = Record<string, unknown>>(
  page: Page,
  collection: string,
): Promise<Envelope<T>[]> {
  const res = await page.request.get(`/api/debug/records/${collection}`)
  expect(res.ok(), `GET /api/debug/records/${collection} -> ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { records?: Envelope<T>[] }
  return json.records ?? []
}

/** Ground-truth rows scoped to one group (data.groupId === groupId). */
export async function groupRows<T extends { groupId?: string } = { groupId?: string }>(
  page: Page,
  collection: string,
  groupId: string,
): Promise<Envelope<T>[]> {
  const all = await records<T>(page, collection)
  return all.filter((r) => r.data.groupId === groupId)
}

/** RBAC view: rows VISIBLE to <userId> over the (simulated) socket query. */
export async function queryAs<T = Record<string, unknown>>(
  page: Page,
  collection: string,
  userId: string,
  role: 'member' | 'admin' | 'viewer' = 'member',
): Promise<Envelope<T>[]> {
  const res = await page.request.get(
    `/api/debug/query?collection=${encodeURIComponent(collection)}&userId=${encodeURIComponent(userId)}&role=${role}`,
  )
  expect(res.ok(), `GET /api/debug/query ${collection} -> ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { records?: Envelope<T>[] }
  return json.records ?? []
}

/** A unique, recognizable test label. */
export function tag(label = 'evenly'): string {
  return `__test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}__ ${label}`
}

/** Best-effort cascade teardown of a group (admin/creator only). */
export async function cleanupGroup(page: Page, groupId: string | undefined): Promise<void> {
  if (!groupId) return
  try {
    await act(page, 'deleteGroupCascade', { groupId })
  } catch {
    /* swallow — teardown is best-effort */
  }
}

export function sum(map: Record<string, number>): number {
  return Object.values(map).reduce((a, b) => a + b, 0)
}

/** Console-error capture that ignores dev-only / non-app noise. */
export function captureAppErrors(page: Page): string[] {
  const errors: string[] = []
  const ignore = [
    '__chromium_devtools_metrics_reporter',
    'favicon.ico',
    'ResizeObserver',
    '[vite]',
    'Download the React DevTools',
    'WebSocket', // dev-only reconnect chatter
    'net::ERR_', // transient dev network
    'Failed to load resource', // dev asset/network transients
  ]
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (ignore.some((p) => text.includes(p))) return
    errors.push(text)
  })
  page.on('pageerror', (err) => {
    if (ignore.some((p) => err.message.includes(p))) return
    errors.push(err.message)
  })
  return errors
}
