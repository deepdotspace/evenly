/**
 * Hero — the positioning + the equals motif (CONTRACT §3.1).
 *
 * Big editorial Fraunces headline on the left; a living group card on the right
 * whose balance bars resolve to even when you press "Settle up" (the signature
 * beat: the bars slide to zero and the "=" lands). The settle motion is pure
 * client state — a taste of the product before any signup.
 */

import { useState } from 'react'
import {
  BalanceLadderRow,
  Button,
  EV,
  EqualsMark,
  OwesOwedLegend,
  SectionLabel,
  type LadderStatus,
} from '../../design'

interface HeroProps {
  onGetStarted: () => void
  onSignIn: () => void
}

const LADDER: { id: string; name: string; you?: boolean; status: LadderStatus; amountMinor: number; widthPct: number }[] = [
  { id: 'mara', name: 'Mara', you: true, status: 'owed', amountMinor: 4250, widthPct: 50 },
  { id: 'theo', name: 'Theo', status: 'owes', amountMinor: 2800, widthPct: 33 },
  { id: 'sofia', name: 'Sofia', status: 'owes', amountMinor: 3650, widthPct: 43 },
  { id: 'diego', name: 'Diego', status: 'owed', amountMinor: 2200, widthPct: 26 },
]

export function Hero({ onGetStarted, onSignIn }: HeroProps) {
  const [settled, setSettled] = useState(false)

  return (
    <section
      className="mx-auto grid items-center gap-12 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16"
      style={{ maxWidth: 1200, padding: 'clamp(28px, 6vw, 76px) clamp(20px, 5vw, 56px) clamp(48px, 6vw, 80px)' }}
    >
      {/* copy */}
      <div>
        <SectionLabel>Split the bill · settle to even</SectionLabel>
        <h1
          style={{
            fontFamily: EV.fontDisplay,
            fontWeight: 500,
            fontSize: 'clamp(42px, 6.4vw, 76px)',
            lineHeight: 1.0,
            letterSpacing: '-0.03em',
            marginTop: 16,
            color: EV.ink,
          }}
        >
          Share the cost.
          <br />
          Land on{' '}
          <span style={{ color: EV.sageDeep, whiteSpace: 'nowrap' }}>
            even
            <EqualsMark
              size={52}
              bg="transparent"
              markColor={EV.honey}
              markSize={44}
              markStroke={2.6}
              style={{ display: 'inline-flex', verticalAlign: '-0.14em', marginLeft: 8 }}
            />
          </span>
        </h1>
        <p
          style={{
            fontSize: 'clamp(15.5px, 1.6vw, 19px)',
            color: EV.ink60,
            lineHeight: 1.55,
            maxWidth: 488,
            marginTop: 20,
          }}
        >
          Scan a receipt, tap who had what, and watch the balances resolve. Evenly handles
          multi-currency trips, itemized splits, and the awkward math, so everyone just pays
          their share.
        </p>

        <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 30 }}>
          <Button size="lg" onClick={onGetStarted}>
            Start splitting, it's free
          </Button>
          <Button variant="secondary" size="lg" onClick={onSignIn}>
            Sign in
          </Button>
        </div>

        <p style={{ marginTop: 18, fontSize: 13, color: EV.ink45 }}>
          Free forever · open source · no account needed to try it below.
        </p>
      </div>

      {/* living group card */}
      <div
        className="hidden sm:block"
        style={{
          background: EV.surface,
          borderRadius: 24,
          padding: 'clamp(24px, 3vw, 36px)',
          boxShadow: 'var(--ev-shadow-card)',
        }}
      >
        <SectionLabel right={<span style={{ fontSize: 11, color: EV.ink40, letterSpacing: '0.06em' }}>JUN 12–15</span>}>
          Lisbon, long weekend
        </SectionLabel>

        <div style={{ marginTop: 12, minHeight: 78 }}>
          {settled ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <EqualsMark size={52} shadow markSize={26} />
              <div>
                <div style={{ fontSize: 13.5, color: EV.ink55, fontWeight: 500 }}>Everyone is square</div>
                <div
                  style={{
                    fontFamily: EV.fontDisplay,
                    fontSize: 'clamp(34px, 4.4vw, 46px)',
                    fontWeight: 500,
                    color: EV.honey,
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}
                >
                  All even
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, color: EV.ink55, fontWeight: 500 }}>You are owed</div>
              <div
                style={{
                  fontFamily: EV.fontDisplay,
                  fontSize: 'clamp(40px, 5vw, 58px)',
                  fontWeight: 500,
                  color: EV.sageDeep,
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums lining-nums',
                }}
              >
                €42.50
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 22 }}>
          <SectionLabel right={<OwesOwedLegend />}>Where everyone stands</SectionLabel>
        </div>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {LADDER.map((row, i) => (
            <BalanceLadderRow
              key={row.id}
              member={{ id: row.id, name: row.name, you: row.you }}
              status={row.status}
              amountMinor={row.amountMinor}
              currency="EUR"
              widthPct={row.widthPct}
              settled={settled}
              popDelay={settled ? i * 0.08 : 0}
            />
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          {settled ? (
            <Button variant="secondary" fullWidth onClick={() => setSettled(false)}>
              Replay the trip
            </Button>
          ) : (
            <Button fullWidth icon={<EqualsMark size={20} bg="transparent" markColor="var(--ev-paper)" markSize={16} />} onClick={() => setSettled(true)}>
              Settle up
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
