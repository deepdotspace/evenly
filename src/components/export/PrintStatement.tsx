/**
 * Printable statement view (CONTRACT §3.4 export — the PDF path).
 *
 * A dedicated, on-brand print view rendered into a portal on `document.body`,
 * with a scoped `@media print` stylesheet that hides the app and lays the
 * statement out for paper. "Print / Save as PDF" calls `window.print()` — the
 * browser's own dialog offers "Save as PDF", so we get a clean PDF with no new
 * dependency. The on-screen overlay is exactly what prints (WYSIWYG).
 *
 * Layout mirrors the group screen's warm, editorial language: a cream paper, the
 * Evenly mark, the balance summary, then the ledger. Foreign rows show their
 * original amount beneath the converted primary value (§4), with an entry-time-FX
 * note in the footer (§7).
 */

import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { EV, EqualsMark, formatMoney } from '../../design'
import { balanceIsSettled, type Statement } from './statement'

/** Scoped print rules: hide everything but this statement, lay it out for paper. */
const PRINT_CSS = `
@media print {
  @page { margin: 16mm; }
  html, body { background: #fff !important; }
  body > *:not(.ev-export-print-root) { display: none !important; }
  .ev-export-print-root {
    position: static !important; inset: auto !important;
    height: auto !important; overflow: visible !important;
    background: #fff !important; z-index: auto !important;
  }
  .ev-export-backdrop {
    position: static !important; background: #fff !important;
    padding: 0 !important; overflow: visible !important; display: block !important;
  }
  .ev-export-toolbar { display: none !important; }
  .ev-statement-paper {
    box-shadow: none !important; margin: 0 !important;
    max-width: none !important; width: auto !important; border-radius: 0 !important;
  }
  .ev-statement-block { break-inside: avoid; }
  .ev-statement-trow { break-inside: avoid; }
}
`

const labelCss: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: EV.ink45,
}

export interface PrintStatementProps {
  statement: Statement
  onClose: () => void
}

export function PrintStatement({ statement: s, onClose }: PrintStatementProps) {
  // Lock scroll + Escape-to-close while the preview is open (matches Sheet).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const P = s.primaryCurrency
  const generated = new Date(s.generatedAtMs).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const allSquare = s.balances.every((b) => balanceIsSettled(b.netMinor))

  const node = (
    <div
      className="ev-export-print-root"
      style={{ position: 'fixed', inset: 0, zIndex: 80 }}
    >
      <style>{PRINT_CSS}</style>

      <div
        className="ev-export-backdrop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          background: 'rgba(40, 30, 20, 0.42)',
          backdropFilter: 'blur(2px)',
          padding: '0 0 56px',
        }}
      >
        {/* toolbar (screen only) */}
        <div
          className="ev-export-toolbar"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px clamp(16px, 4vw, 40px)',
            background: 'rgba(28, 22, 16, 0.55)',
            backdropFilter: 'blur(8px)',
            color: '#FBF7F0',
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '0.01em' }}>
            {s.groupName} · statement preview
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                border: 'none',
                cursor: 'pointer',
                background: PALETTE_CLAY,
                color: '#FBF7F0',
                fontWeight: 600,
                fontSize: 13.5,
                padding: '10px 16px',
                borderRadius: 12,
              }}
            >
              Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: '1px solid rgba(251,247,240,0.3)',
                cursor: 'pointer',
                background: 'transparent',
                color: '#FBF7F0',
                fontWeight: 600,
                fontSize: 13.5,
                padding: '10px 16px',
                borderRadius: 12,
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* the paper */}
        <article
          className="ev-statement-paper"
          style={{
            margin: '24px auto',
            maxWidth: 820,
            background: '#FFFDF8',
            color: '#3A352F',
            borderRadius: 16,
            boxShadow: '0 24px 60px -20px rgba(40,30,20,0.5)',
            padding: 'clamp(28px, 5vw, 52px)',
            // Make the warm colors actually print.
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
            fontFamily: 'var(--ev-font-ui)',
          }}
        >
          {/* masthead */}
          <header
            className="ev-statement-block"
            style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <EqualsMark size={40} radius={13} bg="#F6ECD6" markColor="#C79A4E" markStroke={2.6} />
              <div>
                <div style={{ fontFamily: 'var(--ev-font-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  Evenly
                </div>
                <div style={{ fontSize: 12, color: EV.ink45 }}>Shared expense statement</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={labelCss}>Generated</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{generated}</div>
            </div>
          </header>

          {/* title */}
          <div className="ev-statement-block" style={{ marginTop: 30 }}>
            <h1
              style={{
                fontFamily: 'var(--ev-font-display)',
                fontSize: 'clamp(26px, 4vw, 34px)',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              {s.groupName}
            </h1>
            <div style={{ fontSize: 13.5, color: EV.ink55, marginTop: 6 }}>
              {P} · {s.members.length} {s.members.length === 1 ? 'member' : 'members'} · {s.totals.expenseCount}{' '}
              {s.totals.expenseCount === 1 ? 'expense' : 'expenses'}
              {s.totals.settlementCount > 0
                ? ` · ${s.totals.settlementCount} ${s.totals.settlementCount === 1 ? 'settlement' : 'settlements'}`
                : ''}
            </div>
          </div>

          {/* balances */}
          <section className="ev-statement-block" style={{ marginTop: 34 }}>
            <div style={labelCss}>Where everyone stands</div>
            {allSquare ? (
              <div
                style={{
                  marginTop: 12,
                  background: '#F6ECD6',
                  borderRadius: 14,
                  padding: '16px 18px',
                  fontFamily: 'var(--ev-font-display)',
                  fontSize: 18,
                  fontWeight: 500,
                  color: '#C79A4E',
                }}
              >
                Everyone is all square.
              </div>
            ) : (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
                {s.balances.map((b, i) => {
                  const settled = balanceIsSettled(b.netMinor)
                  const tone = settled ? EV.ink55 : b.netMinor > 0 ? '#6E8159' : '#B5563F'
                  const word = settled ? 'settled up' : b.netMinor > 0 ? 'is owed' : 'owes'
                  return (
                    <div
                      key={b.memberId}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '11px 0',
                        borderBottom: i === s.balances.length - 1 ? 'none' : '1px solid #F4EEE4',
                      }}
                    >
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                        {b.name}
                        {b.isGuest ? <span style={{ color: EV.ink45, fontWeight: 500 }}> · guest</span> : null}
                      </div>
                      <div style={{ fontSize: 14.5, color: tone, fontWeight: 600, fontVariantNumeric: 'tabular-nums lining-nums' }}>
                        <span style={{ color: EV.ink45, fontWeight: 500, fontSize: 12.5 }}>{word} </span>
                        {settled ? formatMoney(0, P) : formatMoney(Math.abs(b.netMinor), P)}
                      </div>
                    </div>
                  )
                })}
                {s.residualMinor !== 0 && (
                  <div style={{ fontSize: 11.5, color: EV.ink45, marginTop: 8 }}>
                    A {formatMoney(Math.abs(s.residualMinor), P)} rounding residual from currency conversion is not a
                    debt between people.
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ledger */}
          <section className="ev-statement-block" style={{ marginTop: 34 }}>
            <div style={labelCss}>Ledger</div>
            <div style={{ marginTop: 12 }}>
              {/* column header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '84px 1fr 130px 120px',
                  gap: 12,
                  paddingBottom: 8,
                  borderBottom: '1.5px solid #EDE4D6',
                  ...labelCss,
                  fontSize: 10.5,
                }}
              >
                <div>Date</div>
                <div>Description</div>
                <div>Paid by</div>
                <div style={{ textAlign: 'right' }}>Amount ({P})</div>
              </div>

              {s.rows.length === 0 ? (
                <div style={{ fontSize: 13.5, color: EV.ink55, padding: '16px 0' }}>No entries yet.</div>
              ) : (
                s.rows.map((r, i) => (
                  <div
                    key={`${r.kind}-${i}`}
                    className="ev-statement-trow"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '84px 1fr 130px 120px',
                      gap: 12,
                      padding: '11px 0',
                      borderBottom: i === s.rows.length - 1 ? 'none' : '1px solid #F4EEE4',
                      alignItems: 'baseline',
                    }}
                  >
                    <div style={{ fontSize: 12.5, color: EV.ink55, fontVariantNumeric: 'tabular-nums lining-nums' }}>
                      {r.dateISO}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.description}</div>
                      <div style={{ fontSize: 11.5, color: EV.ink45, marginTop: 2 }}>
                        {r.kind === 'settlement' ? 'Settlement' : r.category}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: EV.ink60 }}>{r.payerLabel}</div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums lining-nums' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: r.kind === 'settlement' ? '#6E8159' : '#3A352F' }}>
                        {formatMoney(r.primaryMinor, P)}
                      </div>
                      {r.foreign && (
                        <div style={{ fontSize: 11.5, color: EV.ink45, marginTop: 2 }}>
                          {formatMoney(r.amountMinor, r.currency)} {r.currency}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* totals */}
            <div
              className="ev-statement-block"
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: '1.5px solid #EDE4D6',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <TotalRow label="Total expenses" value={formatMoney(s.totals.expensesPrimaryMinor, P)} />
              {s.totals.settlementCount > 0 && (
                <TotalRow label="Total settlements" value={formatMoney(s.totals.settlementsPrimaryMinor, P)} />
              )}
            </div>
          </section>

          {/* footer */}
          <footer
            className="ev-statement-block"
            style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #F4EEE4' }}
          >
            {s.hasForeign && (
              <p style={{ fontSize: 11.5, color: EV.ink55, lineHeight: 1.5, margin: 0 }}>
                Foreign amounts are converted to {P} using the exchange rate captured when each entry was added, so past
                balances never move when rates change.
              </p>
            )}
            <p style={{ fontSize: 11.5, color: EV.ink45, lineHeight: 1.5, margin: s.hasForeign ? '6px 0 0' : 0 }}>
              Generated by Evenly · balances are derived from the shared ledger.
            </p>
          </footer>
        </article>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}

const PALETTE_CLAY = '#E2725B'

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontSize: 13, color: EV.ink60, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums lining-nums' }}>{value}</div>
    </div>
  )
}
