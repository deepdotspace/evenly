/**
 * Subscription plan declarations.
 *
 * Evenly is free and open-source with no paid plans, so this list is empty and
 * `deepspace deploy` syncs zero plans to Stripe. The scaffold's placeholder
 * "Pro" tier ($9/mo, $90/yr) was never wired to any UI and is removed rather
 * than left to sync a product nobody can buy.
 *
 * To add a plan later: each entry needs a stable `slug`, a `name`, and
 * `priceCents` (free plans use 0 and never hit Stripe).
 */

export const subscriptionPlans = [] as const

export type SubscriptionPlanSlug = (typeof subscriptionPlans)[number] extends never
  ? string
  : (typeof subscriptionPlans)[number]['slug']
