/**
 * Receipt scan -> tap-to-assign flow (CONTRACT §3.6). Public surface consumed by
 * the scan route. The controller hook holds the state machine; each view renders
 * one phase.
 */

export { useReceiptScan, type ReceiptScanController, type UploadFn } from './useReceiptScan'
export { ScanCapture } from './ScanCapture'
export { ScanningView } from './ScanningView'
export { ReceiptReview } from './ReceiptReview'
export { AssignView } from './AssignView'
export type { AssignMember, ScanPhase, ClaimsMap } from './types'
