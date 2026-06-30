/**
 * DemoSplit — the live, client-only "try it before signup" split (CONTRACT §3.1).
 *
 * A scanned receipt the visitor taps faces onto, line by line. Every per-person
 * share is computed by the REAL engine (`allocateItemized` from src/lib/split) —
 * the exact code the app runs — so the demo is the product, not a mockup. The
 * split always reconciles to the printed total to the cent (largest-remainder),
 * unclaimed lines fall back to an even split with a visible banner, and nothing
 * is ever persisted or sent over the network (pure browser state).
 */

import { useMemo, useState } from 'react'
import { allocateItemized } from '../../lib/split'
import {
  Avatar,
  Chip,
  EV,
  EqualsIcon,
  CheckIcon,
  SectionLabel,
  Surface,
  formatMoney,
  tintForId,
} from '../../design'
import {
  DEMO_CURRENCY,
  DEMO_ITEMS,
  DEMO_LOCATION,
  DEMO_MEMBERS,
  DEMO_MERCHANT,
  DEMO_SEED_CLAIMS,
  DEMO_TOTAL_MINOR,
} from './demoData'

const MEMBER_IDS = DEMO_MEMBERS.map((m) => m.id)
const money = (minor: number) => formatMoney(minor, DEMO_CURRENCY)

function splitNote(claimers: string[]): string {
  if (claimers.length === 0) return 'no one yet'
  if (claimers.length === MEMBER_IDS.length) return 'shared by everyone'
  if (claimers.length === 1) return DEMO_MEMBERS.find((m) => m.id === claimers[0])?.name ?? 'one person'
  return `shared by ${claimers.length}`
}

export function DemoSplit() {
  const [claims, setClaims] = useState<Record<string, string[]>>(() => ({ ...DEMO_SEED_CLAIMS }))

  function toggle(itemId: string, memberId: string) {
    setClaims((prev) => {
      const current = prev[itemId] ?? []
      const next = current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
      return { ...prev, [itemId]: next }
    })
  }

  // THE REAL ENGINE. Itemized allocation with the default 'even' unclaimed
  // policy — the same function the receipt-scan flow calls on save.
  const { subtotals, unclaimed, unclaimedItemIds } = useMemo(
    () =>
      allocateItemized(DEMO_ITEMS, claims, 'even', { participants: MEMBER_IDS }),
    [claims],
  )

  const maxShare = Math.max(1, ...MEMBER_IDS.map((id) => subtotals[id] ?? 0))

  return (
    <div
      className="grid items-start gap-6 lg:gap-10"
      style={{ gridTemplateColumns: 'minmax(0,1fr)' }}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10">
        {/* ── receipt: tap who had what ───────────────────────────── */}
        <Surface
          variant="receipt"
          radius={20}
          style={{ overflow: 'hidden' }}
        >
          <div style={{ padding: 'clamp(20px, 2.4vw, 28px)' }}>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: EV.fontDisplay,
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: EV.ink,
                }}
              >
                {DEMO_MERCHANT}
              </div>
              <div style={{ fontSize: 11.5, color: EV.ink45, marginTop: 2, letterSpacing: '0.06em' }}>
                {DEMO_LOCATION}
              </div>
            </div>

            <div style={{ borderTop: '1.5px dashed var(--ev-receipt-rule)', margin: '16px 0 4px' }} />

            <div style={{ fontSize: 12.5, color: EV.ink50, textAlign: 'center', padding: '8px 0 4px' }}>
              Tap a face on each line. Tap several to share it.
            </div>

            <div>
              {DEMO_ITEMS.map((item) => {
                const claimers = claims[item.id] ?? []
                const isUnclaimed = claimers.length === 0
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '13px 0',
                      borderTop: '1px solid var(--ev-line)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 600, color: EV.ink }}>{item.name}</span>
                      <span style={{ fontSize: 14, color: EV.ink70, fontVariantNumeric: 'tabular-nums lining-nums' }}>
                        {money(item.lineTotalMinor)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 9 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {DEMO_MEMBERS.map((m) => (
                          <Chip
                            key={m.id}
                            id={m.id}
                            name={m.name}
                            active={claimers.includes(m.id)}
                            size={30}
                            onClick={() => toggle(item.id, m.id)}
                          />
                        ))}
                      </div>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 500,
                          color: isUnclaimed ? EV.clayDeep : EV.ink45,
                        }}
                      >
                        {splitNote(claimers)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ borderTop: '1.5px dashed var(--ev-receipt-rule)', margin: '6px 0 12px' }} />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 15.5,
                fontWeight: 700,
                color: EV.ink,
                fontVariantNumeric: 'tabular-nums lining-nums',
              }}
            >
              <span>TOTAL</span>
              <span>{money(DEMO_TOTAL_MINOR)}</span>
            </div>
          </div>
        </Surface>

        {/* ── live shares ─────────────────────────────────────────── */}
        <div>
          <SectionLabel
            right={
              <span style={{ fontSize: 11.5, color: EV.ink45, fontVariantNumeric: 'tabular-nums lining-nums' }}>
                {money(DEMO_TOTAL_MINOR)} total
              </span>
            }
          >
            Each person pays
          </SectionLabel>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {DEMO_MEMBERS.map((m) => {
              const share = subtotals[m.id] ?? 0
              const widthPct = share === 0 ? 0 : Math.max(7, (share / maxShare) * 100)
              const tint = tintForId(m.id)
              return (
                <div key={m.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar id={m.id} name={m.name} size={28} />
                      <span style={{ fontSize: 15, fontWeight: 600, color: EV.ink }}>
                        {m.name}
                        {m.you && <span style={{ color: EV.ink40, fontWeight: 500 }}> you</span>}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: EV.ink,
                        fontVariantNumeric: 'tabular-nums lining-nums',
                      }}
                    >
                      {money(share)}
                    </span>
                  </div>
                  <div style={{ height: 10, borderRadius: 6, background: EV.track, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${widthPct}%`,
                        borderRadius: 6,
                        background: tint.bg,
                        transition: 'width 0.55s var(--ev-ease-bar)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* reconciliation note — the no-lost-penny pitch, made visible */}
          {unclaimed > 0 ? (
            <div
              style={{
                marginTop: 20,
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                background: EV.tileHoney,
                borderRadius: 13,
                padding: '12px 14px',
              }}
            >
              <EqualsIcon size={18} strokeWidth={2.6} style={{ color: EV.honey, marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: EV.ink70, lineHeight: 1.5 }}>
                {unclaimedItemIds.length} line{unclaimedItemIds.length === 1 ? '' : 's'} not tapped yet
                {' '}({money(unclaimed)}), split evenly for now. It still adds up to {money(DEMO_TOTAL_MINOR)}.
              </span>
            </div>
          ) : (
            <div
              style={{
                marginTop: 20,
                display: 'flex',
                gap: 9,
                alignItems: 'center',
                color: EV.sageDeep,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <CheckIcon size={17} strokeWidth={2.6} />
              <span>Adds up to {money(DEMO_TOTAL_MINOR)}, to the cent.</span>
            </div>
          )}

          <p style={{ marginTop: 16, fontSize: 12.5, color: EV.ink45, lineHeight: 1.55 }}>
            Live math, in your browser. Nothing is saved or sent anywhere.
          </p>
        </div>
      </div>
    </div>
  )
}
