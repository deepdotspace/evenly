/**
 * Landing (`/`) — public, no auth (CONTRACT §3.1).
 *
 * A warm, editorial home: the equals-motif hero, a live client-only demo split
 * the visitor can tap (the "try it before signup" moment, D10 — nothing
 * persists, no network), the wedge as editorial feature spreads, and a closing
 * CTA + footer. Signed-in visitors are routed straight to the app.
 *
 * Note: the header carries data-testid="app-navigation" and the sign-in button
 * carries data-testid="nav-sign-in-button" — the smoke/collab/api specs key on
 * these as the "app mounted / signed-out" signals.
 */

import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthOverlay, useAuth } from 'deepspace'
import { Button, EV, Logo, SectionLabel } from '../design'
import { ClosingCTA, DemoSplit, Features, Hero, LandingFooter } from '../components/landing'

export default function Landing() {
  const { isSignedIn } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const openAuth = () => setShowAuth(true)

  if (isSignedIn) return <Navigate to="/app" replace />

  return (
    <div className="h-full overflow-y-auto" style={{ background: EV.paper, color: EV.ink }}>
      {/* header */}
      <header
        data-testid="app-navigation"
        className="flex items-center justify-between"
        style={{ padding: '22px clamp(20px, 5vw, 56px)' }}
      >
        <Logo size="md" />
        <div className="flex items-center gap-2.5">
          <Button
            data-testid="nav-sign-in-button"
            variant="secondary"
            size="sm"
            onClick={openAuth}
          >
            Sign in
          </Button>
          <Button size="sm" onClick={openAuth}>
            Sign up free
          </Button>
        </div>
      </header>

      <Hero onGetStarted={openAuth} onSignIn={openAuth} />

      {/* live, client-only demo split */}
      <section style={{ background: EV.surface, borderTop: `1px solid ${EV.line}` }}>
        <div className="mx-auto" style={{ maxWidth: 1180, padding: 'clamp(52px, 7vw, 92px) clamp(20px, 5vw, 56px)' }}>
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end" style={{ marginBottom: 'clamp(32px, 4vw, 48px)' }}>
            <div>
              <SectionLabel>Try it, no signup</SectionLabel>
              <h2
                style={{
                  fontFamily: EV.fontDisplay,
                  fontWeight: 500,
                  fontSize: 'clamp(30px, 4.4vw, 50px)',
                  lineHeight: 1.04,
                  letterSpacing: '-0.025em',
                  color: EV.ink,
                  marginTop: 14,
                }}
              >
                Tap who had what.
              </h2>
            </div>
            <p style={{ fontSize: 'clamp(15px, 1.6vw, 18px)', color: EV.ink60, lineHeight: 1.6, maxWidth: 520 }}>
              This is the real product, running entirely in your browser. Assign each line to a face
              and watch every share settle, computed by the same split engine the app uses, down to the
              last cent.
            </p>
          </div>

          <DemoSplit />
        </div>
      </section>

      <Features />

      <ClosingCTA onGetStarted={openAuth} onSignIn={openAuth} />

      <LandingFooter />

      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}
