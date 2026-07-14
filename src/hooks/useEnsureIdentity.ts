/**
 * useEnsureIdentity — fire the `ensureIdentity` server action once per signed-in
 * session on app boot.
 *
 * It seeds the caller's display name from their real identity (and heals any
 * membership rows still carrying a placeholder like "You" / "Member" from before
 * the fix). The action is idempotent and does zero writes for a healthy user, so
 * this is a cheap once-per-session poke. We pass the SDK's fullName/firstName as
 * a friendly hint the server uses only when it has no name of its own.
 */
import { useEffect } from 'react'
import { getAuthToken, useAuth, useAuthUser } from 'deepspace'

/** Ran-this-session guard, keyed by userId (survives route changes, not reloads). */
const ran = new Set<string>()

export function useEnsureIdentity(): void {
  const { isSignedIn, userId } = useAuth()
  const { user } = useAuthUser()
  const hint = user?.fullName || user?.firstName || ''

  useEffect(() => {
    if (!isSignedIn || !userId || ran.has(userId)) return
    ran.add(userId)

    void (async () => {
      try {
        const token = await getAuthToken()
        if (!token) {
          ran.delete(userId) // not ready yet; let a later mount retry
          return
        }
        await fetch('/api/actions/ensureIdentity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(hint ? { name: hint } : {}),
        })
      } catch {
        ran.delete(userId) // transient failure; retry on the next mount
      }
    })()
  }, [isSignedIn, userId, hint])
}
