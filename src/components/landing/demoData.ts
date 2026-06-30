/**
 * Sample data for the client-only landing demo (CONTRACT §3.1, D10).
 *
 * A real Lisbon dinner receipt the visitor can tap who-had-what onto, lifted
 * from the design foundation (Taberna Sal Grosso). The line totals are integer
 * minor units of EUR and sum EXACTLY to the printed total — so the live split,
 * run through the real engine, always reconciles to the cent. Nothing here is
 * ever written anywhere; the whole thing lives in browser memory.
 */

import type { ReceiptItemInput } from '../../lib/split'

export interface DemoMember {
  id: string
  name: string
  /** The visitor stands in as this person ("Mara you"). */
  you?: boolean
}

export interface DemoReceiptItem extends ReceiptItemInput {
  name: string
}

/** Three diners — kept to three so the tap interaction stays light. */
export const DEMO_MEMBERS: DemoMember[] = [
  { id: 'mara', name: 'Mara', you: true },
  { id: 'theo', name: 'Theo' },
  { id: 'sofia', name: 'Sofia' },
]

export const DEMO_CURRENCY = 'EUR'

export const DEMO_MERCHANT = 'Taberna Sal Grosso'
export const DEMO_LOCATION = 'Alfama · Lisboa'

/** The eight printed lines. `lineTotalMinor` already includes any modifiers. */
export const DEMO_ITEMS: DemoReceiptItem[] = [
  { id: 'i1', name: 'Gambas à la plancha', lineTotalMinor: 1850 },
  { id: 'i2', name: 'Arroz de polvo', lineTotalMinor: 1600 },
  { id: 'i3', name: 'Sardinhas grelhadas', lineTotalMinor: 1250 },
  { id: 'i4', name: 'Couvert', lineTotalMinor: 400 },
  { id: 'i5', name: 'Vinho tinto · ½', lineTotalMinor: 900 },
  { id: 'i6', name: 'Vinho verde', lineTotalMinor: 450 },
  { id: 'i7', name: 'Pastéis de nata ×4', lineTotalMinor: 600 },
  { id: 'i8', name: 'Café ×2', lineTotalMinor: 300 },
]

/** Σ of every line — the printed total the split must always land on. */
export const DEMO_TOTAL_MINOR = DEMO_ITEMS.reduce((s, it) => s + it.lineTotalMinor, 0)

/**
 * A believable opening assignment so the demo reads as alive (not empty) on
 * first paint: the table shares the starters, sweets and wine; the big plates
 * go to whoever ordered them. Every line is claimed, so nothing is unclaimed
 * until the visitor un-taps one.
 */
export const DEMO_SEED_CLAIMS: Record<string, string[]> = {
  i1: ['mara', 'theo', 'sofia'],
  i2: ['theo', 'sofia'],
  i3: ['mara'],
  i4: ['mara', 'theo', 'sofia'],
  i5: ['mara', 'theo'],
  i6: ['sofia'],
  i7: ['mara', 'theo', 'sofia'],
  i8: ['theo', 'sofia'],
}
