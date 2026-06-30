/**
 * Recurring expenses (`/app/g/:groupId/recurring`) — CONTRACT §3.11, §1.12, §4.
 *
 * The regulars that post themselves: rent, subscriptions, utilities. Lists each
 * `recurringExpenses` template (description / amount / currency, cadence in words,
 * next run, last posted, active toggle) and lets a member create, edit, pause,
 * resume, delete, or "run now". Create/edit reuse the §3.5 expense form (via
 * RecurringEditor) plus a cadence picker + optional end date. Materialized
 * occurrences are normal expenses (carrying recurringId) in the group feed.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, type RecordData } from 'deepspace'
import {
  BellIcon,
  Button,
  ChevronLeftIcon,
  EV,
  IconTile,
  PlusIcon,
  SectionLabel,
  useToast,
} from '../../../../../design'
import { useGroup, useGroupMembers, useRecurring } from '../../../../../hooks'
import { memberIdentityMap, type MemberId, type RecurringExpenseData } from '../../../../../lib/data'
import { callAction, rosterFrom } from '../../../../../components/expense/shared'
import { RecurringCard, RecurringEditor } from '../../../../../components/recurring'

type Editing = { mode: 'new' } | { mode: 'edit'; row: RecordData<RecurringExpenseData> } | null

export default function RecurringPage() {
  const { groupId } = useParams()
  const { userId } = useAuth()
  const toast = useToast()

  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const recurring = useRecurring(groupId)

  const [editing, setEditing] = useState<Editing>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const primary = group.record?.data.primaryCurrency ?? 'USD'
  const groupName = group.record?.data.name ?? 'Group'
  const backTo = groupId ? `/app/g/${groupId}` : '/app'

  const roster = useMemo(() => rosterFrom(members.records, userId ?? undefined), [members.records, userId])
  const identities = useMemo(() => memberIdentityMap(members.records), [members.records])
  const nameOf = (id: string | undefined): string => {
    if (!id) return 'Someone'
    if (id === userId) return 'You'
    return identities.get(id as MemberId)?.displayName ?? (id.startsWith('guest:') ? 'Guest' : 'Someone')
  }

  const rows = useMemo(
    () =>
      [...recurring.records].sort((a, b) => {
        const aa = a.data.active ? 0 : 1
        const bb = b.data.active ? 0 : 1
        if (aa !== bb) return aa - bb
        return (a.data.nextRunAtMs ?? 0) - (b.data.nextRunAtMs ?? 0)
      }),
    [recurring.records],
  )

  /* ---- editor mode ---- */
  if (editing) {
    return (
      <RecurringEditor
        key={editing.mode === 'edit' ? `edit:${editing.row.recordId}` : 'new'}
        mode={editing.mode}
        groupId={groupId ?? ''}
        primary={primary}
        roster={roster}
        youId={userId ?? ''}
        existing={editing.mode === 'edit' ? { id: editing.row.recordId, data: editing.row.data } : null}
        onCancel={() => setEditing(null)}
        onDone={() => {
          setEditing(null)
          toast.success(editing.mode === 'edit' ? 'Recurring expense updated' : 'Recurring expense scheduled')
        }}
      />
    )
  }

  /* ---- actions ---- */
  async function runNow(row: RecordData<RecurringExpenseData>) {
    setBusyId(row.recordId)
    const res = await callAction<{ created?: boolean; message?: string }>('runRecurringNow', { recurringId: row.recordId })
    setBusyId(null)
    if (!res.success) {
      toast.error(res.error ?? 'Could not post this occurrence.')
      return
    }
    if (res.data?.created === false) toast.info(res.data?.message ?? 'Already posted today.')
    else toast.success('Posted to the group')
  }

  async function toggleActive(row: RecordData<RecurringExpenseData>) {
    setBusyId(row.recordId)
    const next = !row.data.active
    const res = await callAction('updateRecurring', { recurringId: row.recordId, patch: { active: next } })
    setBusyId(null)
    if (!res.success) toast.error(res.error ?? 'Could not update this.')
    else toast.success(next ? 'Resumed' : 'Paused')
  }

  async function remove(row: RecordData<RecurringExpenseData>) {
    if (!window.confirm(`Delete the recurring "${row.data.template.description}"? Already-posted expenses stay.`)) return
    setBusyId(row.recordId)
    const res = await callAction('deleteRecurring', { recurringId: row.recordId })
    setBusyId(null)
    if (!res.success) toast.error(res.error ?? 'Could not delete this.')
    else toast.success('Recurring expense removed')
  }

  /* ---- load / error / not-found ---- */
  const notFound = group.status === 'ready' && !group.record
  const errored = group.status === 'error' || recurring.status === 'error'
  const loading = (group.status === 'loading' && !group.record) || (recurring.status === 'loading' && rows.length === 0)

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 720 }}>
        <Link
          to={backTo}
          className="ev-pressable"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: EV.ink55, fontSize: 14, fontWeight: 600, marginBottom: 18 }}
        >
          <ChevronLeftIcon size={18} />
          {groupName}
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <SectionLabel>Recurring</SectionLabel>
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
              Automate the regulars
            </h1>
            <p style={{ fontSize: 14, color: EV.ink55, marginTop: 4, lineHeight: 1.5 }}>
              Rent, subscriptions and utilities that post themselves, split the way you set.
            </p>
          </div>
          {!loading && !errored && rows.length > 0 && (
            <Button size="sm" icon={<PlusIcon size={17} />} onClick={() => setEditing({ mode: 'new' })} className="shrink-0">
              New
            </Button>
          )}
        </div>

        {errored ? (
          <CardState
            title="Couldn't load recurring expenses"
            body="Something interrupted the connection."
            action={<Button onClick={() => window.location.reload()}>Retry</Button>}
          />
        ) : loading ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <EmptyRecurring onNew={() => setEditing({ mode: 'new' })} />
        ) : (
          <div className="flex flex-col gap-3" style={{ marginTop: 26 }}>
            {rows.map((row) => (
              <RecurringCard
                key={row.recordId}
                row={row}
                primary={primary}
                nameOf={nameOf}
                busy={busyId === row.recordId}
                onRunNow={() => runNow(row)}
                onEdit={() => setEditing({ mode: 'edit', row })}
                onToggleActive={() => toggleActive(row)}
                onDelete={() => remove(row)}
              />
            ))}
            <p style={{ fontSize: 12, color: EV.ink42, marginTop: 6, lineHeight: 1.5 }}>
              Each posting lands in the group feed as a normal expense.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- empty */

function EmptyRecurring({ onNew }: { onNew: () => void }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ marginTop: 26, padding: '44px 24px', borderRadius: 20, background: EV.surface, boxShadow: 'var(--ev-shadow-soft)' }}
    >
      <IconTile size={56} radius={18} tone="honey">
        <BellIcon size={26} />
      </IconTile>
      <div style={{ fontFamily: EV.fontDisplay, fontSize: 22, fontWeight: 500, color: EV.ink, marginTop: 16 }}>
        No recurring expenses yet
      </div>
      <p style={{ fontSize: 14, color: EV.ink55, marginTop: 6, maxWidth: 360, lineHeight: 1.5 }}>
        Automate rent, subscriptions and utilities. Set the amount, the split and the schedule once.
      </p>
      <div style={{ marginTop: 18 }}>
        <Button icon={<PlusIcon size={17} />} onClick={onNew}>
          New recurring expense
        </Button>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- load/error */

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

function CardState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ marginTop: 26, padding: '40px 24px', borderRadius: 20, background: EV.surface, boxShadow: 'var(--ev-shadow-soft)' }}
    >
      <div style={{ fontFamily: EV.fontDisplay, fontSize: 20, fontWeight: 500, color: EV.ink }}>{title}</div>
      <p style={{ fontSize: 13.5, color: EV.ink55, marginTop: 6, maxWidth: 340, lineHeight: 1.5 }}>{body}</p>
      <div style={{ marginTop: 16 }}>{action}</div>
    </div>
  )
}

function Bar({ w, h = 14, mt = 0, radius = 6 }: { w: number | string; h?: number; mt?: number; radius?: number }) {
  return <div style={{ width: w, height: h, borderRadius: radius, background: EV.fillGhost, marginTop: mt }} />
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" style={{ marginTop: 26 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: EV.surface, borderRadius: 18, boxShadow: 'var(--ev-shadow-soft)', padding: 20 }}>
          <div className="flex items-center gap-3.5">
            <div style={{ width: 44, height: 44, borderRadius: 14, background: EV.fillGhost }} />
            <div className="flex-1">
              <Bar w="46%" h={14} />
              <Bar w="62%" h={11} mt={9} />
            </div>
            <Bar w={64} h={18} />
          </div>
          <Bar w="100%" h={32} mt={16} radius={10} />
        </div>
      ))}
    </div>
  )
}
