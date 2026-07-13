/**
 * Invite-by-link share sheet. Mints (or fetches) the group's invite link, then
 * offers copy / native-share / (admin) regenerate. One honest line about what the
 * link does — "anyone with this link can join" — because it is the trust-based
 * model (like Splitwise), not a per-person secret.
 *
 * Rendered by the group header and the members settings screen. The friend who
 * opens the link lands on /join/:token (src/pages/(protected)/join/[token].tsx).
 */

import { useEffect, useState } from 'react'
import { Button, CheckIcon, CopyIcon, EV, LinkIcon, Sheet, useToast } from '../../design'
import { createInvite, inviteUrl } from './api'

export function InviteSheet({
  open,
  onClose,
  groupId,
  groupName,
  isAdmin,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  groupName: string
  isAdmin: boolean
}) {
  const toast = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [rotating, setRotating] = useState(false)

  // Mint / fetch the link when the sheet opens.
  useEffect(() => {
    if (!open) return
    let alive = true
    setStatus('loading')
    setError(null)
    setCopied(false)
    void createInvite(groupId).then((res) => {
      if (!alive) return
      if (res.success && res.data?.token) {
        setToken(res.data.token)
        setStatus('ready')
      } else {
        setError(res.error ?? 'Could not create an invite link.')
        setStatus('error')
      }
    })
    return () => {
      alive = false
    }
  }, [open, groupId])

  const url = token ? inviteUrl(token) : ''

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied', 'Send it to whoever you want in the group.')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy', 'Long-press the link to copy it manually.')
    }
  }

  async function share() {
    if (!url) return
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    if (!nav.share) return copy()
    try {
      await nav.share({ title: `Join ${groupName} on Evenly`, text: `Join "${groupName}" and split expenses with us on Evenly.`, url })
    } catch {
      /* user dismissed the share sheet — no-op */
    }
  }

  async function regenerate() {
    if (rotating) return
    setRotating(true)
    const res = await createInvite(groupId, true)
    setRotating(false)
    if (res.success && res.data?.token) {
      setToken(res.data.token)
      setCopied(false)
      toast.success('New link generated', 'The old link no longer works.')
    } else {
      toast.error('Could not reset the link', res.error ?? 'Please try again.')
    }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <Sheet open={open} onClose={onClose} title="Invite to the group">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: EV.tileHoney,
              color: EV.honey,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <LinkIcon size={19} />
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, color: EV.ink60, margin: 0 }}>
            Share this link with the people in <strong style={{ color: EV.ink, fontWeight: 600 }}>{groupName}</strong>. They pick
            who they are (or join as someone new), and their expenses and balance carry over.
          </p>
        </div>

        {status === 'loading' && (
          <div style={{ height: 46, borderRadius: 12, background: EV.fillGhost }} aria-hidden="true" />
        )}

        {status === 'error' && (
          <div
            role="alert"
            style={{ fontSize: 13.5, lineHeight: 1.5, color: EV.clayDeep, background: EV.fillGhost, borderRadius: 12, padding: '12px 14px' }}
          >
            {error}
          </div>
        )}

        {status === 'ready' && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: EV.fillGhost,
                borderRadius: 12,
                padding: '4px 4px 4px 14px',
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13.5,
                  color: EV.ink70,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontVariantNumeric: 'tabular-nums',
                }}
                title={url}
              >
                {url}
              </span>
              <Button
                size="sm"
                variant={copied ? 'secondary' : 'primary'}
                icon={copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            {canShare && (
              <Button variant="secondary" fullWidth icon={<LinkIcon size={17} />} onClick={share}>
                Share link
              </Button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 11.5, color: EV.ink45, lineHeight: 1.45 }}>
                Anyone with this link can join this group.
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={rotating}
                  className="ev-pressable"
                  style={{
                    flexShrink: 0,
                    border: 'none',
                    background: 'transparent',
                    color: EV.ink55,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: rotating ? 'default' : 'pointer',
                    padding: '4px 2px',
                  }}
                >
                  {rotating ? 'Resetting…' : 'Reset link'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
