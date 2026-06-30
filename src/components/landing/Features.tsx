/**
 * Features — the wedge, as editorial spreads (CONTRACT §3.1, _scope.md).
 *
 * Not a grid of equal cards: three alternating text/visual spreads (AI receipt
 * scan · one-tap settle-up · real-time groups + true multi-currency), each with
 * a small on-brand artifact, then a free-and-open statement. Asymmetric, warm,
 * generous whitespace.
 */

import type { ReactNode } from 'react'
import {
  Avatar,
  AvatarStack,
  BalanceLadderRow,
  EV,
  EqualsMark,
  IconTile,
  ReceiptCard,
  SectionLabel,
  Surface,
  UtensilsIcon,
  TransitIcon,
  ShoppingCartIcon,
} from '../../design'

function Spread({
  kicker,
  title,
  body,
  visual,
  flip = false,
}: {
  kicker: string
  title: string
  body: string
  visual: ReactNode
  flip?: boolean
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <div style={{ order: 0 }}>
        <SectionLabel>{kicker}</SectionLabel>
        <h3
          style={{
            fontFamily: EV.fontDisplay,
            fontWeight: 500,
            fontSize: 'clamp(26px, 3.2vw, 38px)',
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            color: EV.ink,
            marginTop: 12,
          }}
        >
          {title}
        </h3>
        <p style={{ marginTop: 14, fontSize: 'clamp(15px, 1.5vw, 17px)', color: EV.ink60, lineHeight: 1.6, maxWidth: 460 }}>
          {body}
        </p>
      </div>
      <div className={flip ? 'lg:order-first' : ''}>{visual}</div>
    </div>
  )
}

/* ── visuals ──────────────────────────────────────────────────────── */

function ScanVisual() {
  return (
    <div style={{ maxWidth: 320, margin: '0 auto' }}>
      <ReceiptCard
        scanning
        merchant="TABERNA SAL GROSSO"
        location="Alfama · Lisboa"
        total="€73,50"
        items={[
          { name: 'Gambas à la plancha', price: '18,50' },
          { name: 'Arroz de polvo', price: '16,00' },
          { name: 'Sardinhas grelhadas', price: '12,50' },
          { name: 'Vinho verde', price: '4,50' },
          { name: 'Pastéis de nata ×4', price: '6,00' },
        ]}
      />
    </div>
  )
}

function SettleVisual() {
  const Pill = ({ children }: { children: ReactNode }) => (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        color: EV.clayDeep,
        background: EV.tileWarm,
        borderRadius: 8,
        padding: '4px 9px',
      }}
    >
      {children}
    </span>
  )
  const Row = ({ from, to, amount, via }: { from: string; to: string; amount: string; via: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={from} id={from.toLowerCase()} size={28} />
        <span style={{ fontSize: 13.5, color: EV.ink60 }}>
          <strong style={{ color: EV.ink, fontWeight: 600 }}>{from}</strong> pays{' '}
          <strong style={{ color: EV.ink, fontWeight: 600 }}>{to}</strong>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Pill>{via}</Pill>
        <span style={{ fontSize: 14, fontWeight: 700, color: EV.ink, fontVariantNumeric: 'tabular-nums lining-nums' }}>
          {amount}
        </span>
      </div>
    </div>
  )
  return (
    <Surface variant="card" radius={20} style={{ padding: 'clamp(20px,2.4vw,28px)', maxWidth: 420, margin: '0 auto' }}>
      <SectionLabel>The fewest payments</SectionLabel>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Row from="Theo" to="Mara" amount="€28.00" via="Venmo" />
        <Row from="Sofia" to="Mara" amount="€14.50" via="Cash App" />
      </div>
      <div style={{ borderTop: `1px solid ${EV.line}`, margin: '18px 0 16px' }} />
      <BalanceLadderRow member={{ id: 'mara', name: 'Mara', you: true }} status="even" settled amountMinor={0} currency="EUR" />
    </Surface>
  )
}

function GroupsVisual() {
  const FeedRow = ({
    Icon,
    name,
    note,
    badge,
    amount,
  }: {
    Icon: typeof UtensilsIcon
    name: string
    note: string
    badge: string
    amount: string
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <IconTile size={36} tone="neutral">
        <Icon size={18} />
      </IconTile>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: EV.ink }}>{name}</div>
        <div style={{ fontSize: 12, color: EV.ink45 }}>{note}</div>
      </div>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: EV.ink45,
          background: EV.tile,
          borderRadius: 6,
          padding: '3px 6px',
        }}
      >
        {badge}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: EV.ink, fontVariantNumeric: 'tabular-nums lining-nums', minWidth: 64, textAlign: 'right' }}>
        {amount}
      </span>
    </div>
  )
  return (
    <Surface variant="card" radius={20} style={{ padding: 'clamp(20px,2.4vw,28px)', maxWidth: 440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: EV.fontDisplay, fontSize: 18, fontWeight: 600, color: EV.ink }}>Lisbon, long weekend</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: EV.sage, boxShadow: '0 0 0 3px rgba(156,175,136,0.22)' }} />
            <span style={{ fontSize: 11.5, color: EV.ink50 }}>4 people · live</span>
          </div>
        </div>
        <AvatarStack
          size={30}
          members={[
            { id: 'mara', name: 'Mara' },
            { id: 'theo', name: 'Theo' },
            { id: 'sofia', name: 'Sofia' },
            { id: 'diego', name: 'Diego' },
          ]}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FeedRow Icon={UtensilsIcon} name="Taberna Sal Grosso" note="Diego paid · split by item" badge="EUR" amount="€73.50" />
        <FeedRow Icon={TransitIcon} name="Tram 28 day passes" note="Mara paid · split 4 ways" badge="EUR" amount="€24.00" />
        <FeedRow Icon={ShoppingCartIcon} name="Duty-free, Heathrow" note="Theo paid · split 4 ways" badge="GBP" amount="£31.80" />
      </div>
    </Surface>
  )
}

/* ── section ──────────────────────────────────────────────────────── */

export function Features() {
  return (
    <section
      style={{
        background: EV.surface,
        borderTop: `1px solid ${EV.line}`,
        borderBottom: `1px solid ${EV.line}`,
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1180, padding: 'clamp(56px, 8vw, 104px) clamp(20px, 5vw, 56px)' }}>
        <div style={{ maxWidth: 640 }}>
          <SectionLabel>Everything, actually included</SectionLabel>
          <h2
            style={{
              fontFamily: EV.fontDisplay,
              fontWeight: 500,
              fontSize: 'clamp(30px, 4.4vw, 50px)',
              lineHeight: 1.04,
              letterSpacing: '-0.025em',
              color: EV.ink,
              marginTop: 14,
            }}
          >
            The complete bill splitter, with nothing held back behind a paywall.
          </h2>
        </div>

        <div style={{ marginTop: 'clamp(44px, 6vw, 72px)', display: 'flex', flexDirection: 'column', gap: 'clamp(52px, 7vw, 88px)' }}>
          <Spread
            kicker="AI receipt scan"
            title="Snap the receipt. Tap who had each line."
            body="Evenly reads every line and the total, then you just tap a face on each item. Itemized splits with tax and tip distributed proportionally, reconciled to the cent. No other free splitter ships this."
            visual={<ScanVisual />}
          />
          <Spread
            flip
            kicker="One-tap settle-up"
            title="The fewest payments to make everyone square."
            body="Evenly nets the whole group down to the smallest set of payments and hands off straight to Venmo, PayPal, Cash App or UPI with the amount prefilled. Then the bars slide to zero and the = lands."
            visual={<SettleVisual />}
          />
          <Spread
            kicker="Real-time groups · true multi-currency"
            title="One shared ledger, any currency, updating live."
            body="Trips, roommates, and one-off splits stay in sync for everyone the moment an expense lands. Pay in euros, settle in dollars: each entry keeps its own exchange rate, so past balances never drift."
            visual={<GroupsVisual />}
          />
        </div>

        {/* free + open statement */}
        <div
          className="grid items-center gap-8 lg:grid-cols-[auto_1fr]"
          style={{ marginTop: 'clamp(56px, 8vw, 96px)', paddingTop: 'clamp(40px, 5vw, 56px)', borderTop: `1px solid ${EV.line}` }}
        >
          <EqualsMark size={64} shadow markSize={34} />
          <div>
            <h3
              style={{
                fontFamily: EV.fontDisplay,
                fontWeight: 500,
                fontSize: 'clamp(24px, 3vw, 34px)',
                letterSpacing: '-0.02em',
                color: EV.ink,
                lineHeight: 1.1,
              }}
            >
              Free, and actually open.
            </h3>
            <p style={{ marginTop: 12, fontSize: 'clamp(15px, 1.5vw, 17px)', color: EV.ink60, lineHeight: 1.6, maxWidth: 620 }}>
              No paywall, no per-feature lock, no ads, no cut of anything. Evenly is MIT-licensed and
              runs on your own account if you want it to. The whole thing is yours to read, fork, and host.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
