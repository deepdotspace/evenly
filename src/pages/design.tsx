/**
 * /design — dev-only preview of the Evenly design system.
 *
 * Renders every token + component in light and dark, plus a faithful rebuild of
 * the prototype's phone group screen so the warm, editorial look can be compared
 * against the source. Not linked from the app; it is a living spec for the build
 * agents.
 *
 * Gated to dev so it is inert (redirects) in production builds.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Logo,
  EqualsMark,
  Avatar,
  AvatarStack,
  MoneyText,
  SectionLabel,
  OwesOwedLegend,
  IconTile,
  Surface,
  Button,
  BalanceLadderRow,
  ActivityRow,
  ReceiptBadge,
  ReceiptCard,
  Chip,
  MatchDock,
  PillTabs,
  PaymentPills,
  Sheet,
  ToastProvider,
  ToastCard,
  useToast,
  Fab,
  PALETTE,
  formatMoney,
  CATEGORY_ICONS,
  CameraIcon,
  UtensilsIcon,
  TransitIcon,
  ShoppingBagIcon,
  LandmarkIcon,
  CarIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  CheckIcon,
  EqualsIcon,
  PlusIcon,
} from '../design'

/* ── shared demo data (the prototype's Lisbon trip) ─────────────────────────── */

const MEMBERS = [
  { id: 'mara', name: 'Mara', you: true, tint: { bg: '#EBD9B4', ink: '#6E5B30' } },
  { id: 'theo', name: 'Theo', tint: { bg: '#C9D7BA', ink: '#4E5C3E' } },
  { id: 'sofia', name: 'Sofia', tint: { bg: '#EBC2B2', ink: '#8A4A37' } },
  { id: 'diego', name: 'Diego', tint: { bg: '#DCC8AC', ink: '#6E5736' } },
]

const LADDER: { member: { id: string; name: string; you?: boolean }; status: 'owed' | 'owes'; amountMinor: number; widthPct: number }[] = [
  { member: { id: 'mara', name: 'Mara', you: true }, status: 'owed', amountMinor: 4250, widthPct: 50 },
  { member: { id: 'theo', name: 'Theo' }, status: 'owes', amountMinor: 2800, widthPct: 32.9 },
  { member: { id: 'sofia', name: 'Sofia' }, status: 'owes', amountMinor: 3650, widthPct: 42.9 },
  { member: { id: 'diego', name: 'Diego' }, status: 'owed', amountMinor: 2200, widthPct: 25.9 },
]

const RECEIPT_ITEMS = [
  { name: 'Gambas tigre', price: '18,50' },
  { name: 'Arroz de polvo', price: '16,00' },
  { name: 'Sardinhas', price: '12,50' },
  { name: 'Couvert', price: '4,00' },
  { name: 'Vinho tinto 1/2', price: '9,00' },
  { name: 'Vinho verde', price: '4,50' },
  { name: 'Pastéis de nata x4', price: '6,00' },
  { name: 'Café x2', price: '3,00' },
]

const ASSIGN_ITEMS = [
  { id: 'prawns', name: 'Tiger prawns', price: '€18.50' },
  { id: 'octopus', name: 'Octopus rice', price: '€16.00' },
  { id: 'sardines', name: 'Grilled sardines', price: '€12.50' },
]

/* ── tiny layout helpers ────────────────────────────────────────────────────── */

function Block({ label, children, span = 1, id }: { label: string; children: ReactNode; span?: number; id?: string }) {
  return (
    <div id={id} style={{ gridColumn: `span ${span}`, scrollMarginTop: 16 }}>
      <SectionLabel style={{ marginBottom: 14 }}>{label}</SectionLabel>
      {children}
    </div>
  )
}

function Swatch({ name, color, ink }: { name: string; color: string; ink?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: 52, borderRadius: 12, background: color, border: '1px solid var(--ev-line)', display: 'flex', alignItems: 'flex-end', padding: 7 }}>
        {ink && <span style={{ fontSize: 12, fontWeight: 700, color: ink }}>Aa</span>}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ev-ink)' }}>{name}</div>
      <div style={{ fontSize: 10.5, color: 'var(--ev-ink-45)', fontVariantNumeric: 'tabular-nums' }}>{color}</div>
    </div>
  )
}

/* ── the showcase (rendered in light AND dark) ──────────────────────────────── */

function Showcase({ idPrefix = 'l' }: { idPrefix?: string }) {
  const [settled, setSettled] = useState(false)
  const [scanning, setScanning] = useState(true)
  const [assigned, setAssigned] = useState<Record<string, Set<string>>>({
    prawns: new Set(['sofia', 'diego']),
    octopus: new Set(['mara']),
    sardines: new Set<string>(),
  })

  const assignedMinor = useMemo(() => {
    const prices: Record<string, number> = { prawns: 1850, octopus: 1600, sardines: 1250 }
    return Object.entries(assigned).reduce((sum, [id, s]) => (s.size > 0 ? sum + prices[id] : sum), 0)
  }, [assigned])

  const toggle = (item: string, member: string) =>
    setAssigned((cur) => {
      const next = new Set(cur[item])
      if (next.has(member)) next.delete(member)
      else next.add(member)
      return { ...cur, [item]: next }
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 38 }}>
      {/* PALETTE */}
      <Block label="Palette">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 14 }}>
          <Swatch name="paper" color={PALETTE.paper} />
          <Swatch name="ink" color={PALETTE.ink} ink="#FBF7F0" />
          <Swatch name="clay · owes" color={PALETTE.clay} ink="#FBF7F0" />
          <Swatch name="sage · owed" color={PALETTE.sage} ink="#3A352F" />
          <Swatch name="honey · even" color={PALETTE.honey} ink="#3A352F" />
          <Swatch name="surface" color={PALETTE.surface} />
          <Swatch name="rail" color={PALETTE.rail} />
          <Swatch name="tile" color={PALETTE.tile} />
          <Swatch name="tile warm" color={PALETTE.tileWarm} />
          <Swatch name="badge" color={PALETTE.badgeBg} ink="#B5563F" />
        </div>
      </Block>

      {/* LOGO + MARK */}
      <Block label="Logo & equals mark">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 28 }}>
          <Logo size="lg" />
          <Logo size="md" />
          <Logo size="sm" />
          <EqualsMark size={42} shadow />
          <EqualsIcon size={40} strokeWidth={2.4} style={{ color: 'var(--ev-honey)' }} />
        </div>
      </Block>

      {/* AVATARS + CHIPS */}
      <Block label="Avatars, stack & assign chips">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 26 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {MEMBERS.map((m) => (
              <Avatar key={m.id} id={m.id} name={m.name} tint={m.tint} size={34} />
            ))}
          </div>
          <AvatarStack members={[...MEMBERS, { id: 'x1', name: 'Ana' }, { id: 'x2', name: 'Rui' }]} size={32} max={4} />
          <div style={{ display: 'flex', gap: 9 }}>
            <Chip id="mara" name="Mara" active onClick={() => {}} />
            <Chip id="theo" name="Theo" active={false} onClick={() => {}} />
            <Chip id="sofia" name="Sofia" active={false} onClick={() => {}} />
          </div>
        </div>
      </Block>

      {/* MONEY */}
      <Block label="Money (tabular, sign-aware)">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 26 }}>
          <MoneyText tone="owed" label="owed" size={16}>{formatMoney(4250)}</MoneyText>
          <MoneyText tone="owe" label="owes" size={16}>{formatMoney(2800)}</MoneyText>
          <MoneyText tone="even" size={16}>even</MoneyText>
          <MoneyText tone="neutral" size={16}>{formatMoney(7938)}</MoneyText>
          <MoneyText tone="owed" display size={40}>{formatMoney(4250)}</MoneyText>
        </div>
      </Block>

      {/* BUTTONS */}
      <Block label="Buttons">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <Button variant="primary" icon={<CameraIcon size={18} />}>Scan a receipt</Button>
          <Button variant="secondary">Settle up</Button>
          <Button variant="primary" size="lg" iconRight={<EqualsIcon size={20} strokeWidth={2.6} />}>Mark all settled</Button>
          <Button variant="primary" size="sm" icon={<PlusIcon size={16} />}>Add</Button>
          <Button variant="quiet" icon={<ChevronLeftIcon size={18} />}>Back</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </Block>

      {/* ICON TILES + CATEGORIES */}
      <Block label="Icon tiles & category set">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <IconTile tone="warm"><UtensilsIcon size={19} /></IconTile>
          <IconTile tone="neutral"><TransitIcon size={19} /></IconTile>
          <IconTile tone="neutral"><ShoppingBagIcon size={19} /></IconTile>
          <IconTile tone="sage"><CheckIcon size={19} /></IconTile>
          <IconTile tone="honey" size={64} radius={20}><EqualsIcon size={34} strokeWidth={2.6} /></IconTile>
          {Object.entries(CATEGORY_ICONS).slice(0, 8).map(([id, Ico]) => (
            <IconTile key={id} tone="neutral"><Ico size={18} /></IconTile>
          ))}
        </div>
      </Block>

      {/* BALANCE LADDER — the signature */}
      <Block id={`${idPrefix}-ladder`} label="Balance ladder, tap Settle to watch it resolve">
        <Surface variant="card" style={{ padding: '20px 22px' }}>
          <SectionLabel right={<OwesOwedLegend />} style={{ marginBottom: 16 }}>Where everyone stands</SectionLabel>
          {LADDER.map((r, i) => (
            <BalanceLadderRow
              key={r.member.id}
              member={r.member}
              status={r.status}
              amountMinor={r.amountMinor}
              widthPct={r.widthPct}
              settled={settled}
              popDelay={0.15 + i * 0.05}
              style={{ marginBottom: i === LADDER.length - 1 ? 0 : 16 }}
            />
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <Button variant={settled ? 'secondary' : 'primary'} onClick={() => setSettled((s) => !s)}>
              {settled ? 'Replay (un-settle)' : 'Mark all settled'}
            </Button>
          </div>
        </Surface>
      </Block>

      {/* LADDER, desktop row layout */}
      <Block label="Balance ladder, desktop row layout">
        <Surface variant="card" style={{ padding: '22px 26px' }}>
          {LADDER.map((r, i) => (
            <BalanceLadderRow
              key={r.member.id}
              layout="row"
              member={r.member}
              status={r.status}
              amountMinor={r.amountMinor}
              widthPct={r.widthPct}
              settled={settled}
              popDelay={0.15 + i * 0.05}
              style={{ marginBottom: i === LADDER.length - 1 ? 0 : 18 }}
            />
          ))}
        </Surface>
      </Block>

      {/* ACTIVITY FEED */}
      <Block label="Activity feed">
        <Surface variant="card" style={{ padding: '4px 18px' }}>
          <ActivityRow
            iconTone="warm"
            icon={<UtensilsIcon size={19} />}
            title="Taberna Sal Grosso"
            badge={<ReceiptBadge />}
            subtitle="Diego paid · split by item"
            amount={formatMoney(7938)}
            subAmount="€73,50"
            rise
          />
          <ActivityRow icon={<TransitIcon size={19} />} title="Tram 28 day passes" subtitle="Mara paid · split 4 ways" amount={formatMoney(2400)} />
          <ActivityRow icon={<ShoppingBagIcon size={19} />} title="Pingo Doce groceries" subtitle="Sofia paid · split 4 ways" amount={formatMoney(5220)} />
          <ActivityRow icon={<LandmarkIcon size={19} />} title="Castelo de S. Jorge" subtitle="Diego paid · split 4 ways" amount={formatMoney(4000)} interactive />
          <ActivityRow icon={<CarIcon size={19} />} title="Airport taxi" subtitle="Theo paid · split 4 ways" amount={formatMoney(3400)} noDivider />
        </Surface>
      </Block>

      {/* RECEIPT + ASSIGN + DOCK */}
      <Block id={`${idPrefix}-receipt`} label="Receipt scan, assign chips & match dock">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ReceiptCard merchant="TABERNA SAL GROSSO" location="Calçada do Forte 22 · Lisboa" items={RECEIPT_ITEMS} total="€73,50" scanning={scanning} />
            <Button variant="secondary" onClick={() => setScanning((s) => !s)}>{scanning ? 'Stop scan beam' : 'Replay scan beam'}</Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ASSIGN_ITEMS.map((it) => {
              const sel = assigned[it.id] ?? new Set<string>()
              const note =
                sel.size === 0 ? 'tap who shared this' : sel.size === 1 ? 'whole item' : `${sel.size} sharing`
              return (
                <div key={it.id} style={{ borderBottom: '1px solid var(--ev-line)', paddingBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ev-ink)' }}>{it.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ev-ink-70)', fontVariantNumeric: 'tabular-nums' }}>{it.price}</span>
                  </div>
                  <div style={{ fontSize: 12, marginTop: 3, color: sel.size === 0 ? 'var(--ev-clay-deep)' : 'var(--ev-ink-50)' }}>{note}</div>
                  <div style={{ display: 'flex', gap: 9, marginTop: 11 }}>
                    {MEMBERS.map((m) => (
                      <Chip key={m.id} id={m.id} name={m.name} active={sel.has(m.id)} onClick={() => toggle(it.id, m.id)} />
                    ))}
                  </div>
                </div>
              )
            })}
            <MatchDock assignedMinor={assignedMinor} totalMinor={7350} currency="EUR" floating={false} />
          </div>
        </div>
      </Block>

      {/* TABS + PAYMENT PILLS */}
      <Block label="Pill tabs & payment pills">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PillTabsDemo />
          <PaymentPills methods={['Venmo', 'PayPal', 'Cash App']} />
        </div>
      </Block>

      {/* TOASTS (static preview) */}
      <Block label="Toasts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
          <ToastCard item={{ id: 1, tone: 'even', title: 'All settled', description: 'Everyone in Lisbon is square.' }} />
          <ToastCard item={{ id: 2, tone: 'success', title: 'Expense added', description: 'Taberna Sal Grosso · €73,50' }} />
          <ToastCard item={{ id: 3, tone: 'error', title: 'Off by €2.10', description: 'Assigned total doesn’t match the receipt.' }} />
        </div>
      </Block>
    </div>
  )
}

function PillTabsDemo() {
  const [tab, setTab] = useState('feed')
  return (
    <PillTabs
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'feed', label: 'Activity' },
        { id: 'insights', label: 'Insights' },
        { id: 'settle', label: 'Settle up' },
      ]}
    />
  )
}

/* ── the phone group screen (faithful prototype rebuild) ────────────────────── */

function PhoneGroup() {
  const [settled, setSettled] = useState(false)
  return (
    <div style={{ width: 402, maxWidth: '100%', background: 'var(--ev-paper)', borderRadius: 32, padding: '34px 20px', boxShadow: 'var(--ev-shadow-card)', border: '1px solid var(--ev-line)' }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
        <Logo size="sm" />
        <AvatarStack members={MEMBERS} size={30} max={4} />
      </div>

      <SectionLabel>Trip · Jun 12–15</SectionLabel>
      <div style={{ fontFamily: 'var(--ev-font-display)', fontSize: 25, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 3, color: 'var(--ev-ink)' }}>
        Lisbon, long weekend
      </div>

      {/* hero */}
      <div style={{ marginTop: 30, marginBottom: 8 }}>
        {settled ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <EqualsIcon size={58} strokeWidth={2.4} style={{ color: 'var(--ev-honey)', animation: 'evPop 0.5s 0.15s both' }} />
            <div style={{ fontFamily: 'var(--ev-font-display)', fontSize: 40, fontWeight: 500, color: 'var(--ev-honey)', letterSpacing: '-0.02em' }}>All even</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ev-ink-55)' }}>You are owed</div>
            <MoneyText tone="owed" display size={60} style={{ display: 'block', lineHeight: 1, marginTop: 4, letterSpacing: '-0.03em' }}>
              {formatMoney(4250)}
            </MoneyText>
          </div>
        )}
      </div>

      {/* ladder */}
      <div style={{ marginTop: 24 }}>
        <SectionLabel right={<OwesOwedLegend />} style={{ marginBottom: 14 }}>Where everyone stands</SectionLabel>
        {LADDER.map((r, i) => (
          <BalanceLadderRow
            key={r.member.id}
            member={r.member}
            status={r.status}
            amountMinor={r.amountMinor}
            widthPct={r.widthPct}
            settled={settled}
            popDelay={0.55 + i * 0.05}
            style={{ marginBottom: i === LADDER.length - 1 ? 0 : 16 }}
          />
        ))}
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
        <Button variant="primary" fullWidth icon={<CameraIcon size={18} />} style={{ flex: 1.4 }}>Scan a receipt</Button>
        <Button variant="secondary" fullWidth style={{ flex: 1 }} onClick={() => setSettled((s) => !s)}>
          {settled ? 'Replay' : 'Settle up'}
        </Button>
      </div>

      {/* feed */}
      <div style={{ marginTop: 30 }}>
        <SectionLabel style={{ marginBottom: 4 }}>Activity</SectionLabel>
        <ActivityRow iconTone="warm" icon={<UtensilsIcon size={19} />} title="Taberna Sal Grosso" badge={<ReceiptBadge />} subtitle="Diego paid · split by item" amount={formatMoney(7938)} subAmount="€73,50" rise />
        <ActivityRow icon={<TransitIcon size={19} />} title="Tram 28 day passes" subtitle="Mara paid · split 4 ways" amount={formatMoney(2400)} />
        <ActivityRow icon={<ShoppingBagIcon size={19} />} title="Pingo Doce groceries" subtitle="Sofia paid · split 4 ways" amount={formatMoney(5220)} noDivider />
      </div>
    </div>
  )
}

/* ── interactive overlays (toasts / sheet / fab) ────────────────────────────── */

function Overlays() {
  const toast = useToast()
  const [sheet, setSheet] = useState(false)
  const [modal, setModal] = useState(false)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <Button variant="secondary" onClick={() => toast.push({ tone: 'even', title: 'All settled', description: 'Everyone is square.' })}>Toast: even</Button>
      <Button variant="secondary" onClick={() => toast.push({ tone: 'success', title: 'Expense added', description: '€73,50 · split by item' })}>Toast: success</Button>
      <Button variant="secondary" onClick={() => toast.push({ tone: 'error', title: 'Off by €2.10', description: 'Assigned total doesn’t match.' })}>Toast: error</Button>
      <Button variant="primary" onClick={() => setSheet(true)}>Open bottom sheet</Button>
      <Button variant="primary" onClick={() => setModal(true)}>Open modal</Button>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Settle up" footer={<Button variant="primary" fullWidth iconRight={<EqualsIcon size={19} strokeWidth={2.6} />}>Mark all settled</Button>}>
        <div style={{ fontSize: 13, color: 'var(--ev-ink-55)', marginBottom: 16 }}>The fewest payments that make everyone square.</div>
        <ActivityRow icon={<ArrowRightIcon size={18} />} iconTone="neutral" title="Sofia → Mara" subtitle="Venmo · one tap" amount={formatMoney(2100)} />
        <ActivityRow icon={<ArrowRightIcon size={18} />} iconTone="neutral" title="Theo → Mara" subtitle="Venmo · one tap" amount={formatMoney(2150)} noDivider />
      </Sheet>

      <Sheet open={modal} onClose={() => setModal(false)} variant="modal" title="New group">
        <div style={{ fontSize: 13, color: 'var(--ev-ink-55)' }}>A centered modal for desktop. Same warm surface, escape / backdrop to close.</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => setModal(false)}>Create</Button>
        </div>
      </Sheet>
    </div>
  )
}

/* ── page ───────────────────────────────────────────────────────────────────── */

// Outer gate: no hooks here, so the early return satisfies Rules of Hooks.
export default function DesignPage() {
  if (!import.meta.env.DEV) return <Navigate to="/app" replace />
  return <DesignPreview />
}

function DesignPreview() {
  // Dev convenience: the scaffold shell scrolls inside <main>, so a URL hash
  // (e.g. /design#dark) scrolls that section into view — handy for slicing the
  // long preview into screenshots without touching the shell.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 120)
    return () => clearTimeout(t)
  }, [])

  return (
    <ToastProvider>
      <div style={{ minHeight: '100%', background: 'var(--ev-paper)', color: 'var(--ev-ink)', fontFamily: 'var(--ev-font-ui)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 28px 120px' }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <EqualsMark size={42} shadow />
            <div>
              <div style={{ fontFamily: 'var(--ev-font-display)', fontWeight: 600, fontSize: 34, letterSpacing: '-0.02em', color: 'var(--ev-ink)' }}>Evenly design system</div>
              <div style={{ fontSize: 14, color: 'var(--ev-ink-55)', marginTop: 2 }}>
                Warm, calm, editorial. The equals sign is the whole product. <span style={{ color: 'var(--ev-ink-42)' }}>Light is default; dark below.</span>
              </div>
            </div>
          </div>

          {/* phone + overlays */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 40, marginTop: 40, alignItems: 'start' }}>
            <PhoneGroup />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <Block label="Overlays · toasts · FAB">
                <Overlays />
              </Block>
              <div style={{ position: 'relative', height: 220, borderRadius: 18, background: 'var(--ev-rail)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 16, left: 18, fontSize: 12, color: 'var(--ev-ink-45)' }}>FAB, click to expand</div>
                <Fab
                  inline
                  actions={[
                    { icon: <CameraIcon size={18} />, label: 'Scan a receipt' },
                    { icon: <PlusIcon size={18} />, label: 'Add expense' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* LIGHT showcase */}
          <div style={{ marginTop: 56 }}>
            <div style={{ fontFamily: 'var(--ev-font-display)', fontSize: 24, fontWeight: 500, marginBottom: 24, color: 'var(--ev-ink)' }}>Components · light</div>
            <Showcase />
          </div>

          {/* DARK showcase */}
          <div id="dark" className="ev-dark" style={{ marginTop: 56, borderRadius: 28, padding: '40px 32px', scrollMarginTop: 16 }}>
            <div style={{ fontFamily: 'var(--ev-font-display)', fontSize: 24, fontWeight: 500, marginBottom: 8, color: 'var(--ev-ink)' }}>Components · dark</div>
            <div style={{ fontSize: 13.5, color: 'var(--ev-ink-55)', marginBottom: 24 }}>The same tokens, a warm roasted-dark surface. Accents brighten just enough to hold contrast.</div>
            <div style={{ marginBottom: 36 }}>
              <PhoneGroup />
            </div>
            <Showcase idPrefix="d" />
          </div>
        </div>
      </div>
    </ToastProvider>
  )
}
