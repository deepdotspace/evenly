/**
 * Avatar — a round, initialed face with a deterministic warm tint derived from
 * the member id (so the same person is always the same color across the app).
 * `AvatarStack` overlaps a set of faces with the paper-colored ring, like the
 * group header in the prototype.
 */

import type { CSSProperties } from 'react'
import { tintForId, initialsOf } from '../tokens'

export interface AvatarProps {
  /** Stable member id — drives the tint. */
  id?: string
  /** Display name — used for initials when `initials` is not given. */
  name?: string
  initials?: string
  size?: number
  /** Override the auto tint. */
  tint?: { bg: string; ink: string }
  /** Paper-colored ring, for overlapping stacks. */
  bordered?: boolean
  /** Selection ring (the assign-screen "active" face look). */
  active?: boolean
  title?: string
  className?: string
  style?: CSSProperties
}

export function Avatar({
  id,
  name,
  initials,
  size = 30,
  tint,
  bordered = false,
  active = false,
  title,
  className,
  style,
}: AvatarProps) {
  const t = tint ?? tintForId(id ?? name)
  const label = initials ?? initialsOf(name) ?? (id ? id.slice(0, 1).toUpperCase() : '?')
  const ring = active
    ? '0 0 0 2px var(--ev-paper), 0 0 0 3.5px var(--ev-ink)'
    : undefined

  return (
    <div
      className={className}
      title={title ?? name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: t.bg,
        color: t.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--ev-font-ui)',
        fontWeight: 600,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        lineHeight: 1,
        flexShrink: 0,
        border: bordered ? '2px solid var(--ev-paper)' : undefined,
        boxShadow: ring,
        ...style,
      }}
    >
      {label}
    </div>
  )
}

export interface AvatarStackProps {
  members: { id?: string; name?: string; initials?: string }[]
  size?: number
  /** Max faces before a "+N" chip. */
  max?: number
  /** Overlap in px (negative margin). */
  overlap?: number
  className?: string
  style?: CSSProperties
}

export function AvatarStack({ members, size = 30, max = 5, overlap = 9, className, style }: AvatarStackProps) {
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', ...style }}>
      {shown.map((m, i) => (
        <Avatar
          key={m.id ?? m.name ?? i}
          {...m}
          size={size}
          bordered
          style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: shown.length - i }}
        />
      ))}
      {extra > 0 && (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'var(--ev-fill-ghost)',
            color: 'var(--ev-ink-55)',
            border: '2px solid var(--ev-paper)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--ev-font-ui)',
            fontWeight: 600,
            fontSize: Math.max(9, Math.round(size * 0.36)),
            marginLeft: -overlap,
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  )
}
