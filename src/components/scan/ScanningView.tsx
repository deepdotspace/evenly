/**
 * ScanningView -- CONTRACT §3.6 step 2. The uploaded receipt photo with the
 * signature clay scan beam (evScan) sweeping top-to-bottom and a pulsing
 * "Finding line items..." status. Honest: it's the user's actual photo being
 * read, framed like thermal paper.
 */

import { EV, ReceiptCard } from '../../design'
import { safeUrl } from '../../lib/util/safeUrl'
import { BackLink, ScreenHeading } from './parts'

export function ScanningView({
  groupName,
  preview,
  onBack,
}: {
  groupName: string
  preview: string | null
  onBack: () => void
}) {
  return (
    <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 620 }}>
      <BackLink label={groupName} onClick={onBack} />
      <ScreenHeading title="Reading the receipt" subtitle="Hold steady. We pull out every line and the total." />

      <div style={{ marginTop: 26, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
        {preview ? (
          <div
            style={{
              position: 'relative',
              borderRadius: 16,
              overflow: 'hidden',
              background: EV.surface,
              boxShadow: 'var(--ev-shadow-receipt)',
              maxHeight: 440,
            }}
          >
            <img
              src={safeUrl(preview, { image: true })}
              alt="Receipt being scanned"
              style={{ display: 'block', width: '100%', maxHeight: 440, objectFit: 'cover', objectPosition: 'top' }}
            />
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: 60,
                background:
                  'linear-gradient(180deg, rgba(226,114,91,0) 0%, rgba(226,114,91,0.14) 60%, rgba(226,114,91,0.55) 100%)',
                borderBottom: '2px solid var(--ev-clay)',
                animation: 'evScan 1.7s var(--ev-ease-scan) infinite',
              }}
            />
          </div>
        ) : (
          <ReceiptCard
            scanning
            merchant="Reading receipt"
            items={[
              { name: ' ', price: '' },
              { name: ' ', price: '' },
              { name: ' ', price: '' },
              { name: ' ', price: '' },
            ]}
            total="–"
          />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          marginTop: 24,
          color: EV.ink55,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: EV.clay,
            animation: 'evPulse 1s infinite',
          }}
        />
        Finding line items&hellip;
      </div>
    </div>
  )
}
