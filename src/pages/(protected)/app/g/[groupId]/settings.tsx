/**
 * Group settings / members (`/app/g/:groupId/settings`) — CONTRACT §3.14, D8.
 *
 * Admin-gated group-structure controls: details (name, preset icon, cover color
 * + image, primary currency, the simplify-debts default, the remembered split),
 * the member roster with role + the settle-then-remove flow (§4, A5), and
 * archive / delete. Members get the same surface read-only.
 *
 * Balances feeding the per-member figures + the settle-then-remove edges are
 * derived from the ledger (D2) via the pure selectors, using each row's stored
 * FX snapshot — the same numbers the group and settle screens show.
 */

import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth, useR2Files } from 'deepspace'
import { Button, ChevronLeftIcon, EV, SectionLabel } from '../../../../../design'
import { useGroup, useGroupMembers, useExpenses, useSettlements } from '../../../../../hooks'
import { groupNet, memberIdentityMap, settlePlan, type MemberId, type SettleEdge } from '../../../../../lib/data'
import { useToast } from '../../../../../design'
import {
  DangerZone,
  DetailsSection,
  MembersSection,
  type GroupSettingsData,
} from '../../../../../components/group-settings'
import { ExportMenu } from '../../../../../components/export'

export default function GroupSettingsPage() {
  const { groupId } = useParams()
  const { userId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)
  const { upload, getUrl } = useR2Files({ scope: 'app' })

  const data = group.record?.data as GroupSettingsData | undefined
  const createdBy = group.record?.createdBy ?? ''
  const isAdmin = useMemo(() => {
    if (!data || !userId) return false
    return (data.adminIds ?? []).includes(userId) || createdBy === userId
  }, [data, userId, createdBy])

  const primary = data?.primaryCurrency ?? 'USD'

  const net = useMemo<Record<MemberId, number>>(
    () => (group.record ? groupNet(group.record, expenses.records, settlements.records) : {}),
    [group.record, expenses.records, settlements.records],
  )

  const directEdges = useMemo<SettleEdge[]>(
    () => (group.record ? settlePlan(group.record, expenses.records, settlements.records, false) : []),
    [group.record, expenses.records, settlements.records],
  )

  const identities = useMemo(() => memberIdentityMap(members.records), [members.records])
  const nameFor = useMemo(
    () =>
      (id: string | undefined): string => {
        if (!id) return 'Someone'
        return identities.get(id)?.displayName ?? (id.startsWith('guest:') ? 'Guest' : 'Someone')
      },
    [identities],
  )

  function onToast(kind: 'success' | 'error', title: string, body?: string) {
    if (kind === 'success') toast.success(title, body)
    else toast.error(title, body)
  }

  const backTo = groupId ? `/app/g/${groupId}` : '/app'
  const groupName = data?.name ?? 'Group'

  /* ------------------------------------------------------------- load/error */
  const errored = group.status === 'error'
  const notFound = group.status === 'ready' && !group.record
  const loading = group.status === 'loading' && !group.record

  if (errored) {
    return (
      <CenterState
        title="Couldn't load settings"
        body="Something interrupted the connection."
        action={<Button onClick={() => window.location.reload()}>Retry</Button>}
      />
    )
  }
  if (notFound) {
    return (
      <CenterState
        title="Group not found"
        body="It may have been deleted, or you're no longer a member."
        action={
          <Link to="/app">
            <Button variant="secondary">Back to overview</Button>
          </Link>
        }
      />
    )
  }
  if (loading || !group.record || !data) return <SettingsSkeleton backTo={backTo} groupName={groupName} />

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 640 }}>
        {/* back */}
        <Link
          to={backTo}
          className="ev-pressable"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: EV.ink55, fontSize: 14, fontWeight: 600, marginBottom: 16 }}
        >
          <ChevronLeftIcon size={18} />
          {groupName}
        </Link>

        <SectionLabel>Group settings</SectionLabel>
        <h1
          style={{
            fontFamily: EV.fontDisplay,
            fontSize: 'clamp(26px, 4vw, 34px)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: EV.ink,
            marginTop: 4,
          }}
        >
          {groupName}
        </h1>

        {!isAdmin && (
          <div
            role="note"
            style={{
              marginTop: 16,
              fontSize: 13.5,
              lineHeight: 1.5,
              color: EV.ink60,
              background: EV.fillGhost,
              borderRadius: 14,
              padding: '13px 15px',
            }}
          >
            You're a member of this group. Only an admin can change its settings or members.
          </div>
        )}

        <div className="flex flex-col" style={{ gap: 18, marginTop: 22 }}>
          <DetailsSection
            groupId={groupId as string}
            group={data}
            isAdmin={isAdmin}
            upload={upload}
            getUrl={getUrl}
          />

          <MembersSection
            groupId={groupId as string}
            group={data}
            createdBy={createdBy}
            members={members.records}
            isAdmin={isAdmin}
            currentUserId={userId ?? null}
            net={net}
            directEdges={directEdges}
            primary={primary}
            nameFor={nameFor}
            onToast={onToast}
          />

          <ExportMenu groupId={groupId} variant="block" />

          <DangerZone
            groupId={groupId as string}
            group={data}
            isAdmin={isAdmin}
            onToast={onToast}
            onDeleted={() => navigate('/app')}
          />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- empty / load */

function CenterState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col items-center text-center" style={{ paddingTop: 'clamp(48px, 14vh, 140px)' }}>
        <div style={{ fontFamily: EV.fontDisplay, fontSize: 24, fontWeight: 500, color: EV.ink }}>{title}</div>
        <p style={{ fontSize: 14, color: EV.ink55, marginTop: 6, maxWidth: 360 }}>{body}</p>
        <div style={{ marginTop: 18 }}>{action}</div>
      </div>
    </div>
  )
}

function Bar({ w, h = 14, mt = 0, radius = 6 }: { w: number | string; h?: number; mt?: number; radius?: number }) {
  return <div style={{ width: w, height: h, borderRadius: radius, background: EV.fillGhost, marginTop: mt }} />
}

function SettingsSkeleton({ backTo, groupName }: { backTo: string; groupName: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 640 }}>
        <Link
          to={backTo}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: EV.ink55, fontSize: 14, fontWeight: 600, marginBottom: 16 }}
        >
          <ChevronLeftIcon size={18} />
          {groupName}
        </Link>
        <Bar w={120} h={11} />
        <Bar w={220} h={32} mt={10} />
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ background: EV.surface, borderRadius: 20, boxShadow: 'var(--ev-shadow-soft)', padding: 22 }}>
              <Bar w={140} h={16} />
              <Bar w="100%" h={44} mt={16} radius={12} />
              <Bar w="100%" h={44} mt={12} radius={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
