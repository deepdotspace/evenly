/**
 * AssignView -- CONTRACT §3.6 step 4. Each line item gets a row of member face
 * chips; tap one to claim the whole item, tap several to share it (split equally
 * among the tappers via the engine's allocateItemized on save). A per-item split
 * note mirrors the prototype ("tap who shared this" / "whole item" / "X each · N
 * sharing"). The live AssignDock tracks claimed vs the items subtotal.
 */

import { useMemo } from 'react'
import { Avatar, ChipRow, EV, formatMoney } from '../../design'
import type { AssignMember } from './types'
import type { ReceiptScanController } from './useReceiptScan'
import { AssignDock } from './AssignDock'
import { BackLink, ScreenHeading } from './parts'

function noteFor(lineTotalMinor: number, count: number, currency: string): { text: string; color: string } {
  if (count === 0) return { text: 'tap who shared this', color: EV.clayDeep }
  if (count === 1) return { text: 'whole item', color: EV.ink50 }
  return { text: `${formatMoney(Math.round(lineTotalMinor / count), currency)} each · ${count} sharing`, color: EV.ink50 }
}

export function AssignView({ scan, members }: { scan: ReceiptScanController; members: AssignMember[] }) {
  const { parsed } = scan
  const currency = parsed?.currency ?? 'USD'
  const chipMembers = useMemo(() => members.map((m) => ({ id: m.id, name: m.name })), [members])
  const payerName = members.find((m) => m.id === scan.payerId)?.name

  if (!parsed) return null

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 620, paddingBottom: 260 }}>
          <BackLink label="Receipt" onClick={scan.goReview} />
          <ScreenHeading title="Who had what?" subtitle="Tap a face on each item. Tap several to share it." />

          {payerName && (
            <div className="flex items-center gap-2" style={{ marginTop: 14, fontSize: 13, color: EV.ink55 }}>
              <Avatar id={scan.payerId} name={payerName} size={22} />
              <span>
                <span style={{ fontWeight: 600, color: EV.ink }}>{payerName}</span> paid · overhead splits with the items
              </span>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            {parsed.items.map((it) => {
              const claimers = scan.claims[it.id] ?? []
              const note = noteFor(it.lineTotalMinor, claimers.length, currency)
              return (
                <div key={it.id} data-testid="assign-item" style={{ padding: '14px 0', borderBottom: `1px solid ${EV.lineSoft}` }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span style={{ fontSize: 15, fontWeight: 600, color: EV.ink }}>{it.name || 'Item'}</span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: EV.ink70,
                        fontVariantNumeric: 'tabular-nums lining-nums',
                        flexShrink: 0,
                      }}
                    >
                      {formatMoney(it.lineTotalMinor, currency)}
                    </span>
                  </div>
                  {(it.modifiers ?? []).length > 0 && (
                    <div style={{ fontSize: 12, color: EV.ink45, marginTop: 2 }}>
                      {(it.modifiers ?? []).map((m) => m.name).join(' · ')}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: note.color, marginTop: 3 }}>{note.text}</div>
                  <ChipRow
                    members={chipMembers}
                    selected={claimers}
                    onToggle={(id) => scan.toggleClaim(it.id, id)}
                    style={{ marginTop: 11 }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <AssignDock
        claimedMinor={scan.claimedMinor}
        subtotalMinor={scan.itemsSubtotalMinor}
        currency={currency}
        unclaimedCount={scan.unclaimedCount}
        unclaimedMinor={scan.unclaimedMinor}
        policy={scan.policy}
        onPolicy={scan.setPolicy}
        saving={scan.saving}
        onSave={scan.save}
      />

      {scan.error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: 200,
            fontSize: 13,
            color: EV.clayDeep,
            background: EV.badgeBg,
            borderRadius: 10,
            padding: '10px 12px',
            textAlign: 'center',
          }}
        >
          {scan.error}
        </div>
      )}
    </div>
  )
}
