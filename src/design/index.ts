/**
 * Evenly design system — public surface.
 *
 * The warm, editorial component kit + tokens that every screen is built from.
 * CSS (tokens / animations / interactions) is imported once by the global
 * stylesheet (src/styles.css), so importing from here only pulls JS/TS.
 *
 *   import { Button, BalanceLadderRow, MoneyText, ... } from '@/design'
 */

// Tokens & helpers
export {
  PALETTE,
  EV,
  TABULAR,
  AVATAR_TINTS,
  tintForId,
  initialsOf,
  minorDigits,
  formatMoney,
  toneForNet,
  type MoneyTone,
} from './tokens'

// Icons
export * from './icons'

// Brand
export { Logo, EqualsMark, type LogoProps, type LogoSize, type EqualsMarkProps } from './components/Logo'

// Primitives
export { Avatar, AvatarStack, type AvatarProps, type AvatarStackProps } from './components/Avatar'
export { MoneyText, type MoneyTextProps } from './components/MoneyText'
export { SectionLabel, OwesOwedLegend, type SectionLabelProps } from './components/SectionLabel'
export { IconTile, type IconTileProps, type TileTone } from './components/IconTile'
export { Surface, type SurfaceProps, type SurfaceVariant } from './components/Surface'
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './components/Button'

// Composed
export { BalanceLadderRow, type BalanceLadderRowProps, type LadderStatus } from './components/BalanceLadderRow'
export { ActivityRow, ReceiptBadge, type ActivityRowProps } from './components/ActivityRow'
export { ReceiptCard, type ReceiptCardProps, type ReceiptItem } from './components/ReceiptCard'
export { Chip, ChipRow, type ChipProps } from './components/Chip'
export { MatchDock, type MatchDockProps } from './components/MatchDock'
export { PillTabs, PaymentPills, type PillTabsProps, type TabItem } from './components/PillTabs'
export { Sheet, type SheetProps } from './components/Sheet'
export {
  ToastProvider,
  Toaster,
  ToastCard,
  useToast,
  type ToastTone,
  type ToastInput,
  type ToastItem,
  type ToastApi,
} from './components/Toast'
export { Fab, type FabProps, type FabAction } from './components/Fab'
