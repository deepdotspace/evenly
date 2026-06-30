/**
 * Collection Schemas — Evenly
 *
 * All collections with columns and RBAC permissions. Single source of truth,
 * imported by both worker and frontend. See docs/founder/CONTRACT.md §1.
 *
 * MEMBER-SCOPING (D1, the load-bearing architecture): every group-scoped
 * collection carries a denormalized `memberIds: string[]` used as the
 * `collaboratorsField` with read:'shared'. The DO's canRead() filters on it
 * server-side before any row ships over the WebSocket. No role gets read:true on
 * group data (admin is NOT a firehose). `fxRates` is the only public-read
 * collection. See src/schemas/_shared.ts for the mechanism.
 */

import type { CollectionSchema } from 'deepspace/worker'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { contactsSchema } from './schemas/contacts-schema'
import { groupsSchema } from './schemas/groups-schema'
import { groupMembersSchema } from './schemas/group-members-schema'
import { expensesSchema } from './schemas/expenses-schema'
import { settlementsSchema } from './schemas/settlements-schema'
import { receiptsSchema } from './schemas/receipts-schema'
import { commentsSchema } from './schemas/comments-schema'
import { activitySchema } from './schemas/activity-schema'
import { recurringExpensesSchema } from './schemas/recurring-expenses-schema'
import { fxRatesSchema } from './schemas/fx-rates-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  contactsSchema,
  groupsSchema,
  groupMembersSchema,
  expensesSchema,
  settlementsSchema,
  receiptsSchema,
  commentsSchema,
  activitySchema,
  recurringExpensesSchema,
  fxRatesSchema,
]
