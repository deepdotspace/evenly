/**
 * Closing CTA band + footer (CONTRACT §3.1).
 *
 * The equals motif one more time, the two CTAs, then a quiet footer with the
 * GitHub link, the MIT license, and the open-source line. The repo URL is a
 * placeholder until the public repo is created (a founder stakes call, S1).
 */

import { Button, EV, EqualsMark, Logo } from '../../design'

/** Placeholder until the public repo lands (S1). */
const GITHUB_URL = 'https://github.com/deepdotspace/evenly'

interface ClosingCTAProps {
  onGetStarted: () => void
  onSignIn: () => void
}

export function ClosingCTA({ onGetStarted, onSignIn }: ClosingCTAProps) {
  return (
    <section className="mx-auto text-center" style={{ maxWidth: 760, padding: 'clamp(64px, 9vw, 120px) clamp(20px, 5vw, 56px)' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <EqualsMark size={60} shadow markSize={32} />
      </div>
      <h2
        style={{
          fontFamily: EV.fontDisplay,
          fontWeight: 500,
          fontSize: 'clamp(34px, 5.4vw, 60px)',
          lineHeight: 1.02,
          letterSpacing: '-0.03em',
          color: EV.ink,
          marginTop: 24,
        }}
      >
        Land on even.
      </h2>
      <p style={{ marginTop: 16, fontSize: 'clamp(15.5px, 1.6vw, 18px)', color: EV.ink60, lineHeight: 1.55, maxWidth: 480, marginInline: 'auto' }}>
        Start a group, scan a receipt, settle to zero. It is free, and it stays free.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3" style={{ marginTop: 30 }}>
        <Button size="lg" onClick={onGetStarted}>
          Start splitting, it's free
        </Button>
        <Button variant="secondary" size="lg" onClick={onSignIn}>
          Sign in
        </Button>
      </div>
    </section>
  )
}

export function LandingFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${EV.line}`, background: EV.surface }}>
      <div
        className="mx-auto flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
        style={{ maxWidth: 1180, padding: '28px clamp(20px, 5vw, 56px)' }}
      >
        <div className="flex flex-col gap-1">
          <Logo size="sm" />
          <span style={{ fontSize: 12.5, color: EV.ink45, marginTop: 4 }}>Split the bill, settle to even.</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2" style={{ fontSize: 13, color: EV.ink55 }}>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: EV.ink60, fontWeight: 600 }}
            className="ev-row-link"
          >
            View source on GitHub
          </a>
          <span style={{ color: EV.ink45 }}>Free &amp; open source</span>
          <span style={{ color: EV.ink45 }}>MIT licensed</span>
        </div>
      </div>
    </footer>
  )
}
