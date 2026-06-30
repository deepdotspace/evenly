/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; the DO records executions and pushes status to admin clients
 * via the `/ws/cron/:roomId` WebSocket.
 *
 * SDK footgun #4: a DeepSpace CronRoom NEVER fires until it is WARMED (any fetch
 * to the CRON_ROOMS DO runs `ensureInitialized()` -> `scheduleNextAlarm()` and arms
 * the first alarm). worker.ts now warms it from a once-per-isolate `app.use('*')`
 * poke (self-perpetuating across isolate restarts / redeploys), so `fx-refresh` and
 * `recurring-materialize` fire on schedule. "Run now" stays the manual fallback for
 * recurring; until the first FX refresh lands, the FX helpers degrade to the
 * manual-rate prompt.
 */

import type { CronTask } from 'deepspace/worker'
import { buildCronContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { refreshFxRates } from './lib/fx'
import { materializeDueRecurring, type RecRecordIO } from './actions/recurring'

export const tasks: CronTask[] = [
  // Daily FX cache refresh (CONTRACT §1.13). 06:00 UTC.
  { name: 'fx-refresh', schedule: '0 6 * * *', timezone: 'UTC' },
  // Materialize due recurring expenses into the ledger (CONTRACT §1.12, §3.11).
  // Hourly so a template "starting today" posts within the hour of a warm cron.
  { name: 'recurring-materialize', schedule: '0 * * * *', timezone: 'UTC' },
]

/** Adapt the cron context's record surface to the recurring materializer port. */
function cronRecordIO(ctx: ReturnType<typeof buildCronContext>): RecRecordIO {
  return {
    async get(collection, recordId) {
      const rows = await ctx.records.query(collection, {})
      const rec = rows.find((r) => r.recordId === recordId)
      return rec ? { recordId: rec.recordId, data: rec.data as never } : null
    },
    async query(collection, where) {
      const rows = await ctx.records.query(collection, where ? { where } : {})
      return rows.map((r) => ({ recordId: r.recordId, data: r.data as never }))
    },
    async create(collection, data) {
      const res = await ctx.records.create(collection, data)
      return res.recordId
    },
    async update(collection, recordId, data) {
      await ctx.records.update(collection, recordId, data)
    },
  }
}

export async function runTask(name: string, env: Env): Promise<void> {
  const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.APP_NAME}`)
  if (name === 'fx-refresh') {
    await refreshFxRates({
      query: (collection, opts) => ctx.records.query(collection, opts),
      create: (collection, data) => ctx.records.create(collection, data),
      update: (collection, recordId, data) => ctx.records.update(collection, recordId, data),
    })
  } else if (name === 'recurring-materialize') {
    await materializeDueRecurring(cronRecordIO(ctx), Date.now(), env.OWNER_USER_ID)
  }
}
