/**
 * AssignDock -- the floating live total on the assign screen (CONTRACT §3.6
 * step 4). When every item is claimed it is the pure MatchDock magic moment
 * (clay -> sage, "Matches the total · add to group"). While items are still
 * unclaimed it shows the mandatory "N unclaimed items" banner + the unclaimed
 * policy control (even / proportional / payer / manual); overhead always
 * auto-distributes proportionally to the claimed subtotals on save (engine §2.6).
 */

import { AlertIcon, Button, CheckIcon, EV, MatchDock, formatMoney } from '../../design'
import type { UnclaimedPolicy } from './types'

const POLICIES: { id: UnclaimedPolicy; label: string }[] = [
  { id: 'even', label: 'Split evenly' },
  { id: 'proportional', label: 'By share' },
  { id: 'payer', label: 'On payer' },
  { id: 'manual', label: "I'll assign" },
]

const POLICY_TAIL: Record<UnclaimedPolicy, string> = {
  even: 'rest split evenly',
  proportional: 'rest by share',
  payer: 'rest on the payer',
  manual: '',
}

export function AssignDock({
  claimedMinor,
  subtotalMinor,
  currency,
  unclaimedCount,
  unclaimedMinor,
  policy,
  onPolicy,
  saving,
  onSave,
}: {
  claimedMinor: number
  subtotalMinor: number
  currency: string
  unclaimedCount: number
  unclaimedMinor: number
  policy: UnclaimedPolicy
  onPolicy: (p: UnclaimedPolicy) => void
  saving: boolean
  onSave: () => void
}) {
  const wrap = {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    padding: '14px 20px 30px',
    background: 'linear-gradient(180deg, rgba(var(--ev-paper-rgb),0) 0%, rgb(var(--ev-paper-rgb)) 22%)',
  }

  // Everything claimed -> the signature MatchDock match (sage CTA).
  if (unclaimedMinor === 0 && subtotalMinor > 0) {
    return (
      <div style={wrap}>
        <MatchDock
          floating={false}
          assignedMinor={subtotalMinor}
          totalMinor={subtotalMinor}
          currency={currency}
          matchLabel={saving ? 'Adding to the group…' : 'Matches the total · add to group'}
          onConfirm={saving ? undefined : onSave}
        />
      </div>
    )
  }

  const pct = subtotalMinor > 0 ? Math.min(100, (claimedMinor / subtotalMinor) * 100) : 0
  const tail = POLICY_TAIL[policy]

  return (
    <div style={wrap}>
      <div
        style={{
          background: EV.surface,
          borderRadius: 18,
          boxShadow: 'var(--ev-shadow-card)',
          padding: '14px 16px',
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 9 }}>
          <span style={{ fontSize: 13, color: EV.ink60 }}>Assigned</span>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: EV.clay,
              fontVariantNumeric: 'tabular-nums lining-nums',
            }}
          >
            {formatMoney(claimedMinor, currency)} / {formatMoney(subtotalMinor, currency)}
          </span>
        </div>
        <div
          style={{
            position: 'relative',
            height: 7,
            borderRadius: 4,
            background: EV.trackStrong,
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              borderRadius: 4,
              width: `${pct}%`,
              background: EV.clay,
              transition: 'width 0.35s ease',
            }}
          />
        </div>

        {/* mandatory unclaimed banner */}
        <div
          className="flex items-center gap-2"
          style={{ fontSize: 12.5, fontWeight: 600, color: EV.clayDeep, marginBottom: 10 }}
        >
          <AlertIcon size={15} />
          <span>
            {unclaimedCount} {unclaimedCount === 1 ? 'item' : 'items'} unclaimed · {formatMoney(unclaimedMinor, currency)}
          </span>
        </div>

        {/* unclaimed policy control */}
        <div className="flex" style={{ background: EV.fillGhost, borderRadius: 11, padding: 3, gap: 3, marginBottom: 12 }}>
          {POLICIES.map((p) => {
            const active = p.id === policy
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPolicy(p.id)}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: 9,
                  padding: '7px 4px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: active ? EV.surface : 'transparent',
                  color: active ? EV.ink : EV.ink55,
                  boxShadow: active ? 'var(--ev-shadow-soft)' : undefined,
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {policy === 'manual' ? (
          <div
            style={{
              width: '100%',
              textAlign: 'center',
              background: EV.fillGhost,
              color: EV.ink50,
              borderRadius: 13,
              padding: 14,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Assign the last {formatMoney(unclaimedMinor, currency)} to continue
          </div>
        ) : (
          <Button
            fullWidth
            size="md"
            style={{ borderRadius: 13, padding: 14 }}
            icon={<CheckIcon size={17} strokeWidth={2.4} />}
            disabled={saving}
            onClick={onSave}
          >
            {saving ? 'Adding to the group…' : `Add to group · ${tail}`}
          </Button>
        )}
      </div>
    </div>
  )
}
