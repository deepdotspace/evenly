/**
 * Multi-user identity + the API-status surface.
 *
 * Uses the first two pool accounts via `users(2)` rather than hard-coded display
 * names (the named "Collab A"/"Collab B" accounts are not guaranteed in every
 * pool — the SDK fixture picks by createdAt). Two distinct signed-in contexts
 * each render their OWN identity, and the api-status page handles loading /
 * success / error states.
 */
import { test, expect } from 'deepspace/testing'

test('two users render with their own names', async ({ users }) => {
  const [a, b] = await users(2)

  await Promise.all([a.page.goto('/'), b.page.goto('/')])

  await expect(a.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })

  // Each context shows its own signed-in name (whatever the pool accounts are).
  await expect(a.page.getByTestId('nav-user-name')).toContainText(a.name ?? '')
  await expect(b.page.getByTestId('nav-user-name')).toContainText(b.name ?? '')
  // And they are genuinely distinct identities.
  expect(a.email).not.toBe(b.email)
})

test('API status page renders loading success and error states', async ({ users }) => {
  const [user] = await users(1)
  let shouldFail = false
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    if (shouldFail) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
      })
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { integrations: { openai: {}, wikipedia: {} } } }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()
  await expect(user.page.getByText('2 integrations available.')).toBeVisible()

  shouldFail = true
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect(user.page.getByText('Catalog unavailable')).toBeVisible()
  await expect(user.page.getByText('Showing the last loaded catalog')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('API status page shows local retry after first-load API failure', async ({ users }) => {
  const [user] = await users(1)
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Could not load API data')).toBeVisible()
  await expect(user.page.getByText('Retried 1 time automatically.')).toBeVisible()

  const retryButton = user.page.getByRole('button', { name: 'Retry' })
  await expect(retryButton).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await retryButton.click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})
