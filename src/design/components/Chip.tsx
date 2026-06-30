/**
 * Chip (assign face) — a tappable member face on the receipt-assign screen.
 * Active = filled tint with the paper+ink selection ring; inactive = a dashed
 * outline placeholder. This is the tactile core of "tap who had what".
 */

import type { CSSProperties } from 'react'
import { tintForId, initialsOf } from '../tokens'

export interface ChipProps {
  id?: string
  name?: string
  initials?: string
  active: boolean
  size?: number
  onClick?: () => void
  title?: string
  className?: string
  style?: CSSProperties
}

export function Chip({ id, name, initials, active, size = 34, onClick, title, className, style }: ChipProps) {
  const t = tintForId(id ?? name)
  const label = initials ?? initialsOf(name) ?? '?'
  const cls = ['ev-pressable', active ? '' : 'ev-chip-inactive', className].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title ?? name}
      className={cls}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--ev-font-ui)',
        fontWeight: 600,
        fontSize: Math.max(11, Math.round(size * 0.38)),
        lineHeight: 1,
        ...(active
          ? {
              background: t.bg,
              color: t.ink,
              border: 'none',
              boxShadow: '0 0 0 2px var(--ev-paper), 0 0 0 3.5px var(--ev-ink)',
            }
          : {
              background: 'transparent',
              color: 'var(--ev-ink-35)',
              border: '1.5px dashed var(--ev-dash)',
            }),
        ...style,
      }}
    >
      {label}
    </button>
  )
}

/** A horizontal set of assign chips for one item. */
export function ChipRow({
  members,
  selected,
  onToggle,
  size = 34,
  style,
}: {
  members: { id?: string; name?: string; initials?: string }[]
  selected: Set<string> | string[]
  onToggle?: (id: string) => void
  size?: number
  style?: CSSProperties
}) {
  const set = selected instanceof Set ? selected : new Set(selected)
  return (
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', ...style }}>
      {members.map((m, i) => {
        const key = m.id ?? m.name ?? String(i)
        return (
          <Chip
            key={key}
            {...m}
            active={set.has(key)}
            size={size}
            onClick={onToggle ? () => onToggle(key) : undefined}
          />
        )
      })}
    </div>
  )
}
