/**
 * Export entry point (CONTRACT §3.4 — "export (CSV/PDF)").
 *
 * A discoverable, on-brand affordance that opens a small sheet offering a CSV
 * download and a print-ready PDF of the group. Read-only and fully client-side:
 * it reads the same record hooks the screens use and builds the shared
 * `Statement` on demand, so an export always matches the live ledger.
 *
 * Two presentations so it fits both entry points:
 *  - `variant="icon"`  — a warm ghost icon button for the group-header quick-nav.
 *  - `variant="block"` — a full settings row for the group-settings page.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  ChevronRightIcon,
  EV,
  IconTile,
  Sheet,
  useToast,
  type IconProps,
} from '../../design'
import { useGroup, useGroupMembers, useExpenses, useSettlements } from '../../hooks'
import { buildStatement, type Statement } from './statement'
import { statementToCsv } from './csv'
import { downloadText, exportStem } from './download'
import { PrintStatement } from './PrintStatement'

/* ------------------------------------------------------------------ icons */

/** Export / share-out tray icon (box with an up arrow leaving it). */
function ExportIcon({ size = 17, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  )
}

/** Spreadsheet / table icon for the CSV option. */
function SheetIcon({ size = 20, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
    </svg>
  )
}

/** Document / page icon for the PDF option. */
function DocIcon({ size = 20, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  )
}

/* ------------------------------------------------------------------ menu */

export interface ExportMenuProps {
  groupId: string | undefined
  variant?: 'icon' | 'block'
}

export function ExportMenu({ groupId, variant = 'icon' }: ExportMenuProps) {
  const toast = useToast()
  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)

  const [open, setOpen] = useState(false)
  const [printing, setPrinting] = useState<Statement | null>(null)

  const ready = !!group.record
  const empty = expenses.records.length === 0 && settlements.records.length === 0

  function build(): Statement | null {
    if (!group.record) return null
    return buildStatement({
      group: group.record,
      members: members.records,
      expenses: expenses.records,
      settlements: settlements.records,
    })
  }

  function onCsv() {
    const s = build()
    if (!s) return
    try {
      downloadText(`${exportStem(s.groupName)}.csv`, statementToCsv(s))
      setOpen(false)
      toast.success('CSV exported', 'Saved to your downloads.')
    } catch {
      toast.error('Export failed', 'Could not generate the CSV. Please try again.')
    }
  }

  function onPdf() {
    const s = build()
    if (!s) return
    setOpen(false)
    setPrinting(s)
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          aria-label="Export this group"
          title="Export (CSV / PDF)"
          onClick={() => setOpen(true)}
          disabled={!ready}
          className="ev-btn ev-btn-ghost inline-flex items-center justify-center"
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: EV.fillGhost,
            color: EV.ink55,
            opacity: ready ? 1 : 0.5,
          }}
        >
          <ExportIcon size={17} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!ready}
          className="ev-pressable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            width: '100%',
            textAlign: 'left',
            background: EV.surface,
            border: 'none',
            borderRadius: 20,
            boxShadow: 'var(--ev-shadow-soft)',
            padding: 18,
            cursor: ready ? 'pointer' : 'default',
            opacity: ready ? 1 : 0.6,
          }}
        >
          <IconTile size={44} radius={14} tone="warm">
            <ExportIcon size={20} />
          </IconTile>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: EV.ink }}>Export this group</div>
            <div style={{ fontSize: 13, color: EV.ink55, marginTop: 2 }}>
              Download a CSV or a print-ready PDF statement.
            </div>
          </div>
          <ChevronRightIcon size={18} style={{ color: EV.ink40, flexShrink: 0 }} />
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Export this group">
        <p style={{ fontSize: 13.5, color: EV.ink60, lineHeight: 1.5, marginTop: 2 }}>
          A snapshot of every expense and settlement, with each member's balance. Computed on your device — nothing
          leaves it.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <OptionRow
            icon={<SheetIcon size={20} />}
            tone="sage"
            title="Spreadsheet (CSV)"
            subtitle="The full ledger + balances. Opens in Excel, Numbers, Sheets."
            onClick={onCsv}
          />
          <OptionRow
            icon={<DocIcon size={20} />}
            tone="warm"
            title="Statement (PDF)"
            subtitle="A clean, print-ready statement. Save as PDF or print."
            onClick={onPdf}
          />
        </div>

        {empty && (
          <p style={{ fontSize: 12.5, color: EV.ink45, marginTop: 14, lineHeight: 1.5 }}>
            This group has no entries yet — the export will show an empty ledger.
          </p>
        )}

        <div
          style={{
            marginTop: 16,
            background: EV.fillGhost,
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 12,
            color: EV.ink55,
            lineHeight: 1.5,
          }}
        >
          Amounts are shown in each entry's original currency and converted to the group currency using the exchange
          rate captured when it was added. Totals and balances are in the group currency.
        </div>
      </Sheet>

      {printing && <PrintStatement statement={printing} onClose={() => setPrinting(null)} />}
    </>
  )
}

/* --------------------------------------------------------------- option row */

function OptionRow({
  icon,
  tone,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode
  tone: 'warm' | 'sage' | 'honey' | 'neutral'
  title: string
  subtitle: string
  onClick: () => void
}) {
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    textAlign: 'left',
    background: EV.fillGhost,
    border: `1px solid ${EV.borderGhost}`,
    borderRadius: 16,
    padding: 14,
    cursor: 'pointer',
  }
  return (
    <button type="button" onClick={onClick} className="ev-pressable" style={style}>
      <IconTile size={44} radius={13} tone={tone}>
        {icon}
      </IconTile>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: EV.ink }}>{title}</div>
        <div style={{ fontSize: 12.5, color: EV.ink55, marginTop: 2, lineHeight: 1.4 }}>{subtitle}</div>
      </div>
      <ChevronRightIcon size={18} style={{ color: EV.ink40, flexShrink: 0 }} />
    </button>
  )
}
