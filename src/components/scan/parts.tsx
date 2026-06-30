/**
 * Small shared pieces for the scan flow screens -- the back link and the
 * Fraunces screen heading, lifted straight from the prototype's scan/assign
 * headers so every step reads the same.
 */

import type { ReactNode } from 'react'
import { ChevronLeftIcon, EV } from '../../design'

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ev-pressable"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: 'none',
        color: EV.ink55,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        padding: 0,
        marginBottom: 18,
      }}
    >
      <ChevronLeftIcon size={18} />
      {label}
    </button>
  )
}

export function ScreenHeading({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <div>
      <h1
        style={{
          fontFamily: EV.fontDisplay,
          fontSize: 'clamp(25px, 3.4vw, 30px)',
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: EV.ink,
          lineHeight: 1.1,
        }}
      >
        {title}
      </h1>
      <div style={{ fontSize: 14, color: EV.ink55, marginTop: 4, lineHeight: 1.5 }}>{subtitle}</div>
    </div>
  )
}
