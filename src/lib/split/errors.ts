/**
 * A validation/computation error from the split engine. Carries a stable `code`
 * so callers can branch (e.g. surface "remaining $X" for an exact mismatch) and
 * an optional `details` payload with the relevant numbers.
 */
export class SplitError extends Error {
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'SplitError'
    this.code = code
    this.details = details
  }
}
