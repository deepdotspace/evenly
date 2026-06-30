// Generouted, changes to this file will be overridden
/* eslint-disable */

import { components, hooks, utils } from '@generouted/react-router/client'

export type Path =
  | `*`
  | `/`
  | `/api-status`
  | `/app`
  | `/app/activity`
  | `/app/friends`
  | `/app/g/:groupId`
  | `/app/g/:groupId/expense/:expenseId`
  | `/app/g/:groupId/expense/:expenseId/edit`
  | `/app/g/:groupId/expense/new`
  | `/app/g/:groupId/insights`
  | `/app/g/:groupId/recurring`
  | `/app/g/:groupId/scan`
  | `/app/g/:groupId/settings`
  | `/app/g/:groupId/settle`
  | `/app/import`
  | `/app/settings`
  | `/design`
  | `/dev-spike`

export type Params = {
  '/*': { '*': string }
  '/app/g/:groupId': { groupId: string }
  '/app/g/:groupId/expense/:expenseId': { groupId: string; expenseId: string }
  '/app/g/:groupId/expense/:expenseId/edit': { groupId: string; expenseId: string }
  '/app/g/:groupId/expense/new': { groupId: string }
  '/app/g/:groupId/insights': { groupId: string }
  '/app/g/:groupId/recurring': { groupId: string }
  '/app/g/:groupId/scan': { groupId: string }
  '/app/g/:groupId/settings': { groupId: string }
  '/app/g/:groupId/settle': { groupId: string }
}

export type ModalPath = never

export const { Link, Navigate } = components<Path, Params>()
export const { useModals, useNavigate, useParams } = hooks<Path, Params, ModalPath>()
export const { redirect } = utils<Path, Params>()
