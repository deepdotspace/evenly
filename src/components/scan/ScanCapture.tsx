/**
 * ScanCapture -- the entry to the receipt flow (CONTRACT §3.6 step 1). Camera
 * capture or file upload, drag-and-drop on desktop. Warm, dashed drop zone in
 * the Evenly material; never a bare file input.
 */

import { useRef, useState, type DragEvent } from 'react'
import { Button, CameraIcon, EV, IconTile, ReceiptIcon } from '../../design'
import { BackLink, ScreenHeading } from './parts'
import { downscaleImage } from './downscale'

export function ScanCapture({
  groupName,
  onFile,
  onBack,
}: {
  groupName: string
  onFile: (file: File) => void
  onBack: () => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  async function pick(list: FileList | null) {
    const f = list?.[0]
    // Downscale large phone photos before they enter the upload/vision pipeline so
    // they stay under the vision API's per-image byte limit (fail-open on error).
    if (f && f.type.startsWith('image/')) onFile(await downscaleImage(f))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void pick(e.dataTransfer.files)
  }

  return (
    <div className="mx-auto w-full px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: 620 }}>
      <BackLink label={groupName} onClick={onBack} />
      <ScreenHeading
        title="Scan a receipt"
        subtitle="Snap it and we'll pull out every line and the total. You review before anything's added."
      />

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          marginTop: 26,
          borderRadius: 20,
          border: `2px dashed ${dragging ? EV.clay : EV.dash}`,
          background: dragging ? EV.tileWarm : EV.surface,
          boxShadow: 'var(--ev-shadow-soft)',
          padding: '40px 28px',
          textAlign: 'center',
          transition: 'border-color 0.2s ease, background 0.2s ease',
        }}
      >
        <IconTile size={62} radius={20} tone="warm" style={{ margin: '0 auto' }}>
          <CameraIcon size={28} />
        </IconTile>
        <div
          style={{
            fontFamily: EV.fontDisplay,
            fontSize: 20,
            fontWeight: 500,
            color: EV.ink,
            marginTop: 16,
          }}
        >
          Take a photo of the receipt
        </div>
        <p style={{ fontSize: 13.5, color: EV.ink55, marginTop: 6, lineHeight: 1.5 }}>
          Lay it flat, get the whole thing in frame. Or drop an image here.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2.5" style={{ marginTop: 20 }}>
          <Button icon={<CameraIcon size={18} />} onClick={() => cameraRef.current?.click()}>
            Take photo
          </Button>
          <Button variant="secondary" icon={<ReceiptIcon size={17} />} onClick={() => fileRef.current?.click()}>
            Upload a picture
          </Button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => void pick(e.target.files)}
        />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files)} />
      </div>

      <p style={{ fontSize: 12.5, color: EV.ink45, marginTop: 16, textAlign: 'center', lineHeight: 1.5 }}>
        We never guess blindly. Every line is yours to check and edit before it folds into the group.
      </p>
    </div>
  )
}
