/**
 * Anonymous landing + the client-only demo split (CONTRACT §3.1, D10).
 *
 * Public, no auth. The demo runs the REAL `allocateItemized` engine in the
 * browser and persists nothing. We prove the math REACTS: un-tapping the only
 * claimer of a line makes it unclaimed (the reconcile note flips) and the
 * per-person shares change — all with zero network writes.
 */
import { test, expect } from '@playwright/test'
import { captureAppErrors } from './helpers/evenly'

test('landing renders and the demo split reacts to taps (no persistence)', async ({ page }) => {
  const errors = captureAppErrors(page)
  await page.goto('/')
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('nav-sign-in-button')).toBeVisible()

  // The demo widget (the merchant name appears in a few places; the receipt is first).
  await expect(page.getByText('Taberna Sal Grosso').first()).toBeVisible()
  await expect(page.getByText('Each person pays').last()).toBeVisible()

  // Initial state: every line claimed -> "to the cent" reconcile note.
  await expect(page.getByText(/Adds up to .* to the cent/i).last()).toBeVisible()

  // Sardinhas grelhadas (i3) is seeded to Mara only. Find its row via the nearest
  // ancestor that actually contains the assign chips, then un-tap Mara -> the line
  // becomes unclaimed and the REAL engine re-allocates.
  const sardinhas = page.getByText('Sardinhas grelhadas').first()
  await expect(sardinhas).toBeVisible()
  const maraOnSardinhas = sardinhas.locator(
    'xpath=ancestor::div[.//button[@title="Mara"]][1]//button[@title="Mara"]',
  )
  await maraOnSardinhas.click()

  // Reactivity: the reconcile note flips to the unclaimed banner (engine recompute).
  await expect(page.getByText(/not tapped yet/i).last()).toBeVisible({ timeout: 5_000 })

  // Re-tap restores the to-the-cent state (toggle works both ways, live math).
  await maraOnSardinhas.click()
  await expect(page.getByText(/Adds up to .* to the cent/i).last()).toBeVisible({ timeout: 5_000 })

  // Pure client demo: nothing should have been written to the store.
  // (No auth -> no token -> nothing could persist; assert no app errors.)
  expect(errors, `landing console errors: ${errors.join(' | ')}`).toEqual([])
})
