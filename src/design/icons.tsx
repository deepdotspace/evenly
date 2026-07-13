/**
 * Evenly — inline SVG icon set.
 *
 * Hand-drawn stroke icons (no icon-library dependency, exactly like the
 * prototype). Every icon shares one `<Icon>` wrapper so size / color / stroke
 * are consistent: 24-unit viewBox, round caps + joins, `currentColor` stroke by
 * default. The category icons map 1:1 to CONTRACT §1.2's catalog.
 */

import type { SVGProps, ReactNode } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
  strokeWidth?: number
}

function Icon({ size = 20, strokeWidth = 2, children, ...rest }: IconProps & { children: ReactNode }) {
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
      {children}
    </svg>
  )
}

/* ── Brand mark ─────────────────────────────────────────────── */

/** The equals sign — the whole product. Defaults to the prototype's 2.6 weight. */
export function EqualsIcon({ size = 24, strokeWidth = 2.6, ...rest }: IconProps) {
  return (
    <Icon size={size} strokeWidth={strokeWidth} {...rest}>
      <line x1="5" y1="9" x2="19" y2="9" />
      <line x1="5" y1="15" x2="19" y2="15" />
    </Icon>
  )
}

/* ── Flow / navigation ──────────────────────────────────────── */

export function CameraIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </Icon>
  )
}

export function ArrowRightIcon({ strokeWidth = 2.2, ...p }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...p}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icon>
  )
}

export function ChevronLeftIcon({ strokeWidth = 2.2, ...p }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...p}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  )
}

export function ChevronRightIcon({ strokeWidth = 2.2, ...p }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...p}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  )
}

export function ChevronDownIcon({ strokeWidth = 2.2, ...p }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...p}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}

export function CheckIcon({ strokeWidth = 2.4, ...p }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  )
}

export function PlusIcon({ strokeWidth = 2.2, ...p }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...p}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Icon>
  )
}

export function CloseIcon({ strokeWidth = 2.2, ...p }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...p}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}

export function SearchIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  )
}

/** Chain link — the shareable invite link. */
export function LinkIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Icon>
  )
}

/** Copy-to-clipboard glyph (paired with CheckIcon for the copied state). */
export function CopyIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  )
}

export function UsersIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  )
}

export function BellIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10.27 21a2 2 0 0 0 3.46 0" />
      <path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.4 13.92 18 12.49 18 8a6 6 0 1 0-12 0c0 4.49-1.4 5.92-2.74 7.33" />
    </Icon>
  )
}

export function SettingsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

/* ── Category catalog (CONTRACT §1.2) ───────────────────────── */

/** food / dining */
export function UtensilsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 2v7a3 3 0 0 0 3 3 3 3 0 0 0 3-3V2" />
      <path d="M6 12v10" />
      <path d="M18 2v20" />
      <path d="M18 9a3 3 0 0 0 3-3V2" />
    </Icon>
  )
}

/** groceries */
export function ShoppingBagIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </Icon>
  )
}

/** transport / transit pass */
export function TransitIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18" />
      <path d="M8 3v18" />
    </Icon>
  )
}

/** taxi / car (fuel-adjacent) */
export function CarIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </Icon>
  )
}

/** entertainment / attraction ticket */
export function TicketIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </Icon>
  )
}

/** attraction / landmark (the prototype's castle row) */
export function LandmarkIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <line x1="3" x2="21" y1="22" y2="22" />
      <line x1="6" x2="6" y1="18" y2="11" />
      <line x1="10" x2="10" y1="18" y2="11" />
      <line x1="14" x2="14" y1="18" y2="11" />
      <line x1="18" x2="18" y1="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </Icon>
  )
}

/** lodging / household */
export function HomeIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
      <path d="M9 21v-6h6v6" />
    </Icon>
  )
}

/** utilities */
export function PlugIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </Icon>
  )
}

/** fuel */
export function FuelIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <line x1="3" x2="15" y1="22" y2="22" />
      <line x1="4" x2="14" y1="9" y2="9" />
      <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
      <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
    </Icon>
  )
}

/** health */
export function HeartIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </Icon>
  )
}

/** shopping */
export function ShoppingCartIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </Icon>
  )
}

/** fees / receipt */
export function ReceiptIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </Icon>
  )
}

/** other / generic tag */
export function TagIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </Icon>
  )
}

/** building (group / org) */
export function BuildingIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </Icon>
  )
}

export function AlertIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </Icon>
  )
}

export function InfoIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Icon>
  )
}

/**
 * Map a CONTRACT category id to its icon component, with a safe fallback.
 */
import type { ComponentType } from 'react'

export const CATEGORY_ICONS: Record<string, ComponentType<IconProps>> = {
  food: UtensilsIcon,
  dining: UtensilsIcon,
  groceries: ShoppingBagIcon,
  lodging: HomeIcon,
  transport: CarIcon,
  transit: TransitIcon,
  fuel: FuelIcon,
  utilities: PlugIcon,
  entertainment: TicketIcon,
  attraction: LandmarkIcon,
  shopping: ShoppingCartIcon,
  health: HeartIcon,
  fees: ReceiptIcon,
  other: TagIcon,
}

export function categoryIcon(id: string | undefined | null): ComponentType<IconProps> {
  if (!id) return TagIcon
  return CATEGORY_ICONS[id] ?? TagIcon
}
