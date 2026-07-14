/**
 * AppShell — the connected Evenly experience every /app/* route renders inside.
 *
 * Desktop (lg+): the prototype's 3-pane system — a warm left rail (logo, quick
 * nav, "Your groups" with each group's net, the user footer) beside the page
 * content (the page itself supplies any right panel, flush to the window edge).
 * Mobile: a slim top bar (logo → dashboard, profile) above the page; the
 * dashboard is the hub for switching groups. One coherent warm system across
 * breakpoints.
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import {
  Avatar,
  EV,
  EqualsIcon,
  HomeIcon,
  BellIcon,
  UsersIcon,
  PlusIcon,
  SettingsIcon,
  Logo,
  MoneyText,
  formatMoney,
} from '../../design'
import { useProfile, useEnsureIdentity } from '../../hooks'
import { useAuth, useAuthUser } from 'deepspace'
import { EVEN_TOLERANCE } from '../../lib/data'
import { useGroupSummaries, type GroupSummary } from './shell-data'
import { CreateGroupModal } from './CreateGroupModal'

const RAIL_NAV = [
  { to: '/app', label: 'Overview', Icon: HomeIcon, exact: true },
  { to: '/app/friends', label: 'Friends', Icon: UsersIcon },
  { to: '/app/activity', label: 'Activity', Icon: BellIcon },
] as const

export default function AppShell() {
  const [creating, setCreating] = useState(false)
  const { summaries, status } = useGroupSummaries()
  const { userId } = useAuth()
  const { user } = useAuthUser()
  const { record: profile } = useProfile()

  // Seed the caller's display identity + heal any placeholder membership rows,
  // once per session. Runs behind auth; no-op for a user already in good shape.
  useEnsureIdentity()

  const displayName =
    profile?.data.displayName || user?.fullName || user?.firstName || 'You'

  // Pair groups are the 1:1 friend ledgers — they live under Friends, not in
  // "Your groups". Filter them out of the rail here (a view concern), leaving
  // `useGroupSummaries` faithful so the dashboard's cross-group net stays whole.
  const railGroups = useMemo(
    () => summaries.filter((s) => s.group.data.kind !== 'pair'),
    [summaries],
  )
  const toSettle = railGroups.filter((s) => Math.abs(s.viewerNet) > EVEN_TOLERANCE).length

  return (
    <div className="h-full w-full flex min-h-0" style={{ background: EV.paper, color: EV.ink }}>
      {/* ---- desktop left rail ---- */}
      <aside
        data-testid="app-navigation"
        className="hidden lg:flex flex-col shrink-0 h-full"
        style={{ width: 244, background: EV.rail, padding: '24px 18px' }}
      >
        <Link to="/app" className="mb-7 inline-flex" aria-label="Evenly overview">
          <Logo size="md" />
        </Link>

        <div className="flex flex-col gap-0.5 mb-5">
          {RAIL_NAV.map((item) => (
            <RailNavLink key={item.to} {...item} />
          ))}
        </div>

        <div
          className="flex items-center justify-between mb-2.5"
          style={{ paddingLeft: 6 }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: EV.ink40,
              textTransform: 'uppercase',
            }}
          >
            Your groups
          </span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            aria-label="New group"
            className="ev-pressable inline-flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              border: 'none',
              background: EV.fillGhost,
              color: EV.ink55,
            }}
          >
            <PlusIcon size={15} strokeWidth={2.4} />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 -mx-1 px-1">
          {status === 'loading' && summaries.length === 0 ? (
            <RailSkeleton />
          ) : railGroups.length === 0 ? (
            <p style={{ fontSize: 12.5, color: EV.ink45, padding: '6px 12px', lineHeight: 1.5 }}>
              No groups yet. Create one to start splitting.
            </p>
          ) : (
            railGroups.map((s) => <RailGroupRow key={s.group.recordId} summary={s} />)
          )}
        </nav>

        <Link
          to="/app/settings"
          className="ev-row-link mt-4 flex items-center gap-2.5 rounded-xl"
          style={{ paddingTop: 18, borderTop: `1px solid ${EV.line}`, marginInline: -6, padding: '18px 6px 4px' }}
        >
          <Avatar id={userId ?? undefined} name={displayName} size={32} />
          <div className="min-w-0">
            <div
              data-testid="nav-user-name"
              style={{ fontSize: 13.5, fontWeight: 600, color: EV.ink }}
              className="truncate"
            >
              {displayName}
            </div>
            <div style={{ fontSize: 11.5, color: EV.ink45 }}>
              {railGroups.length} {railGroups.length === 1 ? 'group' : 'groups'}
              {toSettle > 0 ? ` · ${toSettle} to settle` : ' · all settled'}
            </div>
          </div>
          <SettingsIcon size={16} style={{ color: EV.ink35, marginLeft: 'auto' }} />
        </Link>
      </aside>

      {/* ---- content column ---- */}
      <div className="flex-1 min-w-0 flex flex-col h-full min-h-0">
        {/* mobile top bar */}
        <header
          className="lg:hidden flex items-center justify-between shrink-0"
          style={{ padding: '14px 18px', borderBottom: `1px solid ${EV.line}`, background: EV.paper }}
        >
          <Link to="/app" aria-label="Evenly overview">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreating(true)}
              aria-label="New group"
              className="ev-pressable inline-flex items-center justify-center"
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: 'none',
                background: EV.fillGhost,
                color: EV.ink70,
              }}
            >
              <PlusIcon size={18} strokeWidth={2.4} />
            </button>
            <Link to="/app/settings" aria-label="Your profile">
              <Avatar id={userId ?? undefined} name={displayName} size={34} />
            </Link>
          </div>
        </header>

        <div className="flex-1 min-h-0">
          <Outlet />
        </div>
      </div>

      <CreateGroupModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

/* --------------------------------------------------------------- rail pieces */

function RailNavLink({
  to,
  label,
  Icon,
  exact,
}: {
  to: string
  label: string
  Icon: typeof HomeIcon
  exact?: boolean
}) {
  const { pathname } = useLocation()
  const active = exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 10,
    fontSize: 13.5,
    fontWeight: 600,
    color: active ? EV.ink : EV.ink55,
    background: active ? EV.surface : 'transparent',
    boxShadow: active ? 'var(--ev-shadow-soft)' : undefined,
  }
  return (
    <Link to={to} className={active ? '' : 'ev-row-link'} style={style} aria-current={active ? 'page' : undefined}>
      <Icon size={17} style={{ color: active ? EV.clayDeep : EV.ink40 }} />
      {label}
    </Link>
  )
}

function RailGroupRow({ summary }: { summary: GroupSummary }) {
  const { pathname } = useLocation()
  const id = summary.group.recordId
  const active = pathname === `/app/g/${id}` || pathname.startsWith(`/app/g/${id}/`)
  const { name, primaryCurrency } = summary.group.data
  const v = summary.viewerNet
  const even = Math.abs(v) <= EVEN_TOLERANCE

  return (
    <Link
      to={`/app/g/${id}`}
      className={active ? '' : 'ev-row-link'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 11,
        background: active ? EV.surface : 'transparent',
        boxShadow: active ? 'var(--ev-shadow-soft)' : undefined,
      }}
      aria-current={active ? 'page' : undefined}
    >
      <span
        className="truncate"
        style={{ fontSize: 13.5, fontWeight: active ? 600 : 500, color: active ? EV.ink : EV.ink70 }}
      >
        {name}
      </span>
      {even ? (
        <EqualsIcon size={16} strokeWidth={2.6} style={{ color: EV.honey, flexShrink: 0 }} />
      ) : (
        <MoneyText
          tone={v > 0 ? 'owed' : 'owe'}
          size={12}
          weight={600}
          style={{ flexShrink: 0 }}
        >
          {`${v < 0 ? '−' : ''}${formatMoney(v, primaryCurrency)}`}
        </MoneyText>
      )}
    </Link>
  )
}

function RailSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-1.5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 18,
            borderRadius: 6,
            background: EV.fillGhost,
            width: `${90 - i * 12}%`,
          }}
        />
      ))}
    </div>
  )
}
