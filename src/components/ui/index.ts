/**
 * Small base-UI kit kept from the scaffold. Evenly's product UI is the branded
 * `src/design/` system; this barrel only carries the handful of primitives still
 * in use: the toast + error screen mounted globally in `_app.tsx`, and Button /
 * Input / Alert / EmptyState / Skeleton used by the dev-gated diagnostic pages.
 */

/* Utility */
export { cn } from './utils'

/* Form */
export { Button, buttonVariants } from './Button'
export type { ButtonProps } from './Button'
export { Input } from './Input'

/* Data Display */
export {
  Skeleton, SkeletonText, SkeletonCard, SkeletonList, SkeletonTable, SkeletonAvatar,
  LoadingSpinner, LoadingOverlay,
} from './Skeleton'

/* Feedback */
export { Alert, AlertTitle, AlertDescription } from './Alert'
export { ErrorScreen, decodeReactError } from './ErrorBoundary'
export type { ErrorScreenProps, DecodedReactError } from './ErrorBoundary'
export {
  EmptyState, EmptyItems, EmptySearch, EmptyDocuments, EmptyProjects, EmptyTeam, EmptyError,
} from './EmptyState'
