/**
 * Owner-scoped `ActionTools` for code that runs OUTSIDE an HTTP action -- Jobs and
 * any background worker path that needs the same record + integration surface the
 * server actions get. Mirrors `createActionTools` in worker.ts but stamps the app
 * OWNER as the acting user (X-User-Id), so it runs "as the app" and bypasses RBAC.
 *
 * Reuse this from `src/jobs.ts` so a large guest-claim re-stamp uses exactly the
 * same `runClaimGuest` orchestration as the inline action.
 */

import { apiWorkerFetch } from 'deepspace/worker'
import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { integrations } from '../integrations'

export function createOwnerTools(env: Env): ActionTools {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.APP_NAME}`))

  async function execTool<TData>(tool: string, params: Record<string, unknown>): Promise<ActionResult<TData>> {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': env.OWNER_USER_ID,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({ tool, params }),
      }),
    )
    return res.json() as Promise<ActionResult<TData>>
  }

  async function callIntegration<T>(endpoint: string, data?: unknown): Promise<ActionResult<T>> {
    const integrationName = endpoint.split('/')[0]
    const billingMode = integrations[integrationName]?.billing ?? 'developer'
    // Background work bills the owner regardless; user-billed endpoints are not
    // meaningful here (no caller JWT), so always use the owner JWT.
    void billingMode
    const res = await apiWorkerFetch(env, `/api/integrations/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.APP_OWNER_JWT}` },
      body: JSON.stringify(data ?? {}),
    })
    return res.json() as Promise<ActionResult<T>>
  }

  return {
    create: (collection, data, recordId) => execTool('records.create', { collection, data, recordId }),
    update: (collection, recordId, data) => execTool('records.update', { collection, recordId, data }),
    remove: (collection, recordId) => execTool('records.delete', { collection, recordId }),
    get: (collection, recordId) => execTool('records.get', { collection, recordId }),
    query: (collection, options) => execTool('records.query', { collection, ...options }),
    integration: callIntegration,
    registerUser: (opts) => execTool('users.register', { ...opts }),
  }
}
