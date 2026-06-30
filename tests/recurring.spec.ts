import { test, expect } from 'deepspace/testing'
import { captureConsoleErrors } from './helpers/errors'
import { cleanupGroup } from './helpers/evenly'

const SHOTS = process.env.RECURRING_SHOTS ?? '/tmp/recurring-shots'

/**
 * Recurring expenses end-to-end (CONTRACT §3.11): sign in, create a group,
 * schedule a recurring template, "run now", and confirm the occurrence lands in
 * the group feed as a normal expense. Captures phone + desktop screenshots.
 */
test('schedule a recurring expense and run it now', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  const errors = captureConsoleErrors(page)

  let groupId: string | undefined
  try {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/app')
  await expect(page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })

  // Create a group.
  const stamp = Date.now().toString().slice(-5)
  await page.getByRole('button', { name: 'New group' }).first().click()
  await page.getByPlaceholder('Italy 2026, Apartment 4B…').fill(`__test Recurring ${stamp}`)
  await page.getByRole('button', { name: 'Create group' }).click()
  await page.waitForURL(/\/app\/g\/[^/]+$/, { timeout: 20_000 })
  groupId = page.url().split('/app/g/')[1]
  console.log('GROUP_ID:', groupId)

  // Recurring screen — empty state.
  await page.goto(`/app/g/${groupId}/recurring`)
  await expect(page.getByText('No recurring expenses yet')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/recurring-empty-desktop.png`, fullPage: true })

  // Open the editor and fill the template.
  await page.getByRole('button', { name: 'New recurring expense' }).click()
  const desc = `Rent ${stamp}`
  await page.getByLabel('What is it for?').fill(desc)
  await page.getByLabel('Amount', { exact: true }).fill('1800')
  await expect(page.getByText('Ready to schedule')).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: `${SHOTS}/recurring-editor-desktop.png`, fullPage: true })

  // Schedule it.
  await page.getByRole('button', { name: 'Schedule it' }).click()
  await expect(page.getByText(desc)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/Every month on the/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/recurring-list-desktop.png`, fullPage: true })

  // Phone screenshot of the list.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/recurring-list-phone.png`, fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })

  // Run now -> materializes an occurrence into the ledger.
  await page.getByRole('button', { name: 'Run now' }).first().click()
  await expect(page.getByText('Posted to the group')).toBeVisible({ timeout: 20_000 })

  // The occurrence shows in the group feed as a normal expense.
  await page.goto(`/app/g/${groupId}`)
  await expect(page.getByText(desc).first()).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/recurring-feed-desktop.png`, fullPage: true })

  expect(errors).toEqual([])
  } finally {
    await cleanupGroup(page, groupId)
  }
})
