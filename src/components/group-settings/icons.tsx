/**
 * Group-settings glyphs (CONTRACT §7 A4 — group icon catalog) + a few control
 * icons the shared design set doesn't carry. Same hand-drawn convention as
 * `src/design/icons` (24 viewBox, round caps, `currentColor`), so they sit on
 * brand. The catalog ids are what persist in `groups.icon`.
 */

import type { ComponentType, ReactNode, SVGProps } from 'react'
import {
  BuildingIcon,
  CarIcon,
  HeartIcon,
  HomeIcon,
  LandmarkIcon,
  PlugIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  TicketIcon,
  UsersIcon,
  UtensilsIcon,
  type IconProps,
} from '../../design'

/* ---------------------------------------------------------- local glyphs */

function Glyph({ size = 20, strokeWidth = 2, children, ...rest }: IconProps & { children: ReactNode }) {
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
      {...(rest as SVGProps<SVGSVGElement>)}
    >
      {children}
    </svg>
  )
}

export function PencilIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Glyph>
  )
}

export function TrashIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Glyph>
  )
}

export function ArchiveIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </Glyph>
  )
}

export function ImageIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m21 15-4.5-4.5L7 20" />
    </Glyph>
  )
}

export function ShieldIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Glyph>
  )
}

export function LeaveIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Glyph>
  )
}

/** trip / travel — the single most common group icon, missing from the set. */
export function PlaneIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M17.8 19.2 16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8l3.9 4.2-2.2 2.2-1.9-.4a.5.5 0 0 0-.5.8L6 18l2 2.6a.5.5 0 0 0 .8-.1l1.5-3 4.2 3.9a.5.5 0 0 0 .8-.5Z" />
    </Glyph>
  )
}

/** celebration / gift — trips, weddings, group gifts. */
export function GiftIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
      <path d="M12 8v13" />
      <path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5h4Z" />
      <path d="M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5h-4Z" />
    </Glyph>
  )
}

/* ------------------------------------------------------- group-icon catalog */

export interface GroupIconDef {
  id: string
  label: string
  Comp: ComponentType<IconProps>
}

/** The preset catalog persisted in `groups.icon` (CONTRACT §1.5, §7 A4). */
export const GROUP_ICONS: GroupIconDef[] = [
  { id: 'trip', label: 'Trip', Comp: PlaneIcon },
  { id: 'home', label: 'Home', Comp: HomeIcon },
  { id: 'people', label: 'Friends', Comp: UsersIcon },
  { id: 'heart', label: 'Couple', Comp: HeartIcon },
  { id: 'food', label: 'Food', Comp: UtensilsIcon },
  { id: 'event', label: 'Event', Comp: TicketIcon },
  { id: 'gift', label: 'Celebration', Comp: GiftIcon },
  { id: 'landmark', label: 'City', Comp: LandmarkIcon },
  { id: 'car', label: 'Road trip', Comp: CarIcon },
  { id: 'groceries', label: 'Groceries', Comp: ShoppingBagIcon },
  { id: 'shopping', label: 'Shopping', Comp: ShoppingCartIcon },
  { id: 'utilities', label: 'Bills', Comp: PlugIcon },
  { id: 'work', label: 'Work', Comp: BuildingIcon },
]

const ICON_BY_ID = new Map(GROUP_ICONS.map((g) => [g.id, g.Comp]))

/** Resolve a stored icon id to its component (null when unset). */
export function groupIconFor(id: string | null | undefined): ComponentType<IconProps> | null {
  if (!id) return null
  return ICON_BY_ID.get(id) ?? null
}
