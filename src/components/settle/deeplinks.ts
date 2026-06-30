/**
 * Settle-up payment deep links (CONTRACT §3.7).
 *
 * Turn a payee's opted-in `paymentHandles` into one-tap links that prefill the
 * amount + a note. Only handles that exist produce an option -- the settle UI
 * falls back to "copy amount" when the list is empty. The deep link is UX only;
 * the ledger truth is a recorded `settlement` (method records how it was paid).
 *
 * Link shapes are the public consumer-app conventions:
 *   Venmo     https://venmo.com/<user>?txn=pay&amount=<amt>&note=<note>
 *   PayPal.me https://paypal.me/<user>/<amt>
 *   Cash App  https://cash.app/$<tag>/<amt>
 *   UPI       upi://pay?pa=<id>&am=<amt>&cu=<cur>&tn=<note>
 */

import { minorDigits } from '../../design'
import type { PaymentHandles, SettlementMethod } from '../../lib/data/types'

export type PayMethod = 'venmo' | 'paypal' | 'cashapp' | 'upi'

export interface PayOption {
  method: PayMethod
  label: string
  /** The URL to open. */
  url: string
  /** A custom scheme (no web fallback) -- open via `location.href`. */
  scheme?: boolean
}

/** The `settlements.method` a deep-link tap implies once the user records it. */
export const METHOD_FOR: Record<PayMethod, SettlementMethod> = {
  venmo: 'venmo',
  paypal: 'paypal',
  cashapp: 'cashapp',
  upi: 'upi',
}

function strip(handle: string, lead: string): string {
  const h = handle.trim()
  return lead && h.startsWith(lead) ? h.slice(lead.length) : h
}

/** Major-unit amount string with the currency's correct number of decimals. */
export function majorAmount(amountMinor: number, currency: string): string {
  const d = minorDigits(currency)
  return (amountMinor / 10 ** d).toFixed(d)
}

/**
 * Build the available pay links for a payee, prefilling amount + note. Returns
 * an empty list when the payee has shared no handles (caller -> copy fallback).
 */
export function payOptions(
  handles: PaymentHandles | null | undefined,
  amountMinor: number,
  currency: string,
  note: string,
): PayOption[] {
  if (!handles) return []
  const amt = majorAmount(amountMinor, currency)
  const enc = encodeURIComponent(note)
  const out: PayOption[] = []

  if (handles.venmo) {
    out.push({
      method: 'venmo',
      label: 'Venmo',
      url: `https://venmo.com/${encodeURIComponent(strip(handles.venmo, '@'))}?txn=pay&amount=${amt}&note=${enc}`,
    })
  }
  if (handles.paypalMe) {
    out.push({
      method: 'paypal',
      label: 'PayPal',
      url: `https://paypal.me/${encodeURIComponent(strip(handles.paypalMe, '@'))}/${amt}`,
    })
  }
  if (handles.cashtag) {
    out.push({
      method: 'cashapp',
      label: 'Cash App',
      url: `https://cash.app/$${encodeURIComponent(strip(handles.cashtag, '$'))}/${amt}`,
    })
  }
  if (handles.upiId) {
    out.push({
      method: 'upi',
      label: 'UPI',
      url: `upi://pay?pa=${encodeURIComponent(handles.upiId)}&am=${amt}&cu=${currency}&tn=${enc}`,
      scheme: true,
    })
  }
  return out
}

/** Open a pay link -- custom schemes navigate in place, web links in a new tab. */
export function openPayUrl(opt: PayOption): void {
  if (typeof window === 'undefined') return
  if (opt.scheme) {
    window.location.href = opt.url
  } else {
    window.open(opt.url, '_blank', 'noopener,noreferrer')
  }
}
