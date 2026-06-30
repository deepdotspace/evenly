/**
 * Background-job handler — invoked by AppJobRoom (worker.ts) for every job picked
 * up from the queue. Dispatch on `job.type`; return a result or throw to fail.
 *
 * Jobs run as the app owner; record I/O uses owner-scoped ActionTools
 * (`createOwnerTools`) so a job reuses the exact same orchestration the inline
 * server actions use. Enqueue from a worker path via `enqueueJob` (see
 * src/actions/members.ts claimGuest, src/actions/index.ts addGroupMember,
 * src/actions/profile.ts updateProfile).
 *
 * CHUNKING (D5, subrequest ceiling): the membership fan-outs (guest claim,
 * member re-stamp, profile-identity re-stamp) can touch far more rows than a
 * single Worker request's subrequest budget allows. Each handler does a BOUNDED
 * number of writes per tick (`RESTAMP_CHUNK`), then `ctx.continue(...)` to yield
 * to the next alarm. Every pass is idempotent (already-applied rows are skipped),
 * so resuming with the same payload always makes forward progress and never
 * double-applies.
 */

import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { createOwnerTools } from './actions/owner-tools'
import {
  RESTAMP_CHUNK,
  restampMemberIds,
  runClaimGuest,
  type ClaimGuestArgs,
} from './actions/claim'
import { restampIdentity, type RestampIdentityArgs } from './actions/profile'

interface RestampMemberArgs {
  groupId: string
  memberId: string
  nextMemberIds: string[]
}

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  if (job.type === 'claim-guest') {
    const tools = createOwnerTools(env)
    const result = await runClaimGuest(tools, job.payload as ClaimGuestArgs, { maxWrites: RESTAMP_CHUNK })
    if (result.error) throw new Error(result.error)
    if (!result.done) {
      ctx.progress(0.5, 'Rewriting guest across the group')
      ctx.continue(job.payload) // another idempotent pass on the next tick
      return result
    }
    ctx.progress(1, 'Claim complete')
    return result
  }

  if (job.type === 'restamp-member') {
    const tools = createOwnerTools(env)
    const result = await restampMemberIds(tools, job.payload as RestampMemberArgs, { maxWrites: RESTAMP_CHUNK })
    if (!result.done) {
      ctx.progress(0.5, 'Sharing existing items with the new member')
      ctx.continue(job.payload)
      return result
    }
    ctx.progress(1, 'Member added to all items')
    return result
  }

  if (job.type === 'restamp-identity') {
    const tools = createOwnerTools(env)
    const result = await restampIdentity(tools, job.payload as RestampIdentityArgs, { maxWrites: RESTAMP_CHUNK })
    if (!result.done) {
      ctx.progress(0.5, 'Updating your name across groups')
      ctx.continue(job.payload)
      return result
    }
    ctx.progress(1, 'Profile synced everywhere')
    return result
  }

  throw new Error(`Unknown job type: ${job.type}`)
}
