import { Link } from 'react-router-dom'
import { EV, Logo } from '../design'

export default function NotFound() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center text-center px-4"
      style={{ background: EV.paper, color: EV.ink }}
    >
      <Logo size="md" markOnly />
      <h1 style={{ fontFamily: EV.fontDisplay, fontSize: 48, fontWeight: 500, color: EV.ink, marginTop: 18 }}>
        404
      </h1>
      <p style={{ fontSize: 14.5, color: EV.ink55, marginTop: 4, marginBottom: 22 }}>
        That page doesn't exist.
      </p>
      <Link
        to="/"
        className="ev-btn ev-btn-primary"
        style={{
          background: EV.clay,
          color: EV.paper,
          borderRadius: 13,
          padding: '11px 18px',
          fontWeight: 600,
          fontSize: 14,
          boxShadow: 'var(--ev-shadow-btn)',
        }}
      >
        Back to Evenly
      </Link>
    </div>
  )
}
