/**
 * Comments (CONTRACT §1.10, §3.9) — the composer write path + the server-side gate.
 *
 * The `comments` collection is write-locked off the client; `addComment` authorizes
 * the caller as a group member, stamps the author from the verified identity, and the
 * read UI renders it live. We cover the end-to-end composer AND the auth boundary
 * (empty body + a non-member are both rejected, and nothing lands in the store).
 */
import { test, expect } from 'deepspace/testing'
import { act, actOk, records, groupRows, whoami, cleanupGroup, tag } from './helpers/evenly'

interface CommentData {
  groupId: string
  expenseId: string
  body: string
}

test('the composer posts a comment that renders and lands in the store as the author', async ({ users }) => {
  const [u] = await users(1)
  const page = u.page
  await page.goto('/app')
  const me = await whoami(page)
  let groupId: string | undefined
  try {
    const grp = await actOk<{ groupId: string }>(page, 'createGroup', {
      name: tag('comments'),
      primaryCurrency: 'USD',
    })
    groupId = grp.groupId
    const exp = await actOk<{ expenseId: string }>(page, 'addExpense', {
      groupId,
      draft: {
        description: 'Commented dinner',
        currency: 'USD',
        amountMinor: 3000,
        category: 'dining',
        paidBy: { [me]: 3000 },
        splitConfig: { scope: 'simple', baseType: 'equal', participants: [me] },
      },
    })

    await page.goto(`/app/g/${groupId}/expense/${exp.expenseId}`)
    await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 20_000 })

    const body = 'Splitting this evenly, thanks!'
    const composer = page.getByPlaceholder('Add a comment')
    await expect(composer).toBeVisible({ timeout: 10_000 })
    await composer.fill(body)
    await page.getByRole('button', { name: 'Send' }).click()

    // Renders in the live list...
    await expect(page.getByText(body)).toBeVisible({ timeout: 10_000 })

    // ...and lands in the store keyed to this expense (poll for write propagation).
    await expect
      .poll(
        async () =>
          (await records<CommentData>(page, 'comments')).filter(
            (r) => r.data.expenseId === exp.expenseId && r.data.body === body,
          ).length,
        { timeout: 10_000, message: 'exactly one comment row written for the expense' },
      )
      .toBe(1)
    const mine = (await records<CommentData>(page, 'comments')).filter(
      (r) => r.data.expenseId === exp.expenseId && r.data.body === body,
    )
    expect(mine[0].data.groupId, 'comment is denormalized with its groupId').toBe(groupId)
    expect(mine[0].createdBy, 'author is the signed-in user').toBe(me)
  } finally {
    await cleanupGroup(page, groupId)
  }
})

test('addComment rejects an empty body and a non-member, writing nothing', async ({ users }) => {
  const [owner, outsider] = await users(2)
  let groupId: string | undefined
  try {
    await owner.page.goto('/app')
    const me = await whoami(owner.page)
    const grp = await actOk<{ groupId: string }>(owner.page, 'createGroup', {
      name: tag('comments-auth'),
      primaryCurrency: 'USD',
    })
    groupId = grp.groupId
    const exp = await actOk<{ expenseId: string }>(owner.page, 'addExpense', {
      groupId,
      draft: {
        description: 'Auth dinner',
        currency: 'USD',
        amountMinor: 1000,
        category: 'other',
        paidBy: { [me]: 1000 },
        splitConfig: { scope: 'simple', baseType: 'equal', participants: [me] },
      },
    })

    // Empty / whitespace body is rejected.
    const empty = await act(owner.page, 'addComment', { expenseId: exp.expenseId, body: '   ' })
    expect(empty.success, 'empty comment rejected').toBeFalsy()

    // A non-member cannot comment on this group's expense.
    await outsider.page.goto('/app')
    const forbidden = await act(outsider.page, 'addComment', {
      expenseId: exp.expenseId,
      body: 'I should not be able to post this',
    })
    expect(forbidden.success, 'non-member addComment rejected').toBeFalsy()

    // Nothing landed in the store.
    const rows = await groupRows<CommentData>(owner.page, 'comments', groupId)
    expect(rows.length, 'no comment rows written').toBe(0)
  } finally {
    await cleanupGroup(owner.page, groupId)
  }
})
