/**
 * resolveDisplayName — the single rule that turns an account into a member label.
 * Regression guard for the "You" / "Member" bug: a user who never opened profile
 * settings still gets a real, human name (their SDK identity or email handle),
 * never a placeholder literal.
 */
import { describe, it, expect } from 'vitest'
import { resolveDisplayName } from './helpers'

describe('resolveDisplayName', () => {
  it('prefers the name the user set themselves', () => {
    expect(resolveDisplayName({ displayName: 'Heidi', name: 'x', email: 'y@z.com' })).toBe('Heidi')
  })

  it('falls back to the SDK-provided account name', () => {
    expect(resolveDisplayName({ displayName: '', name: 'Yuke Wu', email: 'yw@z.com' })).toBe('Yuke Wu')
    expect(resolveDisplayName({ displayName: null, name: 'Yuke Wu', email: null })).toBe('Yuke Wu')
  })

  it('falls back to the email local-part when no name is set', () => {
    // The exact live-bug account: created "as heidi.serendipity", no profile name.
    expect(resolveDisplayName({ email: 'heidi.serendipity@gmail.com' })).toBe('heidi.serendipity')
    expect(resolveDisplayName({ displayName: '   ', name: '   ', email: 'jo@a.co' })).toBe('jo')
  })

  it('never returns the placeholder literals the bug persisted', () => {
    const name = resolveDisplayName({ email: 'someone@example.com' })
    expect(name).not.toBe('You')
    expect(name).not.toBe('Member')
  })

  it('only returns the neutral last resort when nothing is knowable', () => {
    expect(resolveDisplayName(null)).toBe('Member')
    expect(resolveDisplayName({})).toBe('Member')
    expect(resolveDisplayName({ displayName: '', name: '', email: '' })).toBe('Member')
  })

  it('trims whitespace on every source', () => {
    expect(resolveDisplayName({ displayName: '  Heidi  ' })).toBe('Heidi')
    expect(resolveDisplayName({ name: '  Yuke  ' })).toBe('Yuke')
  })
})
