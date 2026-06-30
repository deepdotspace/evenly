/**
 * Receipt-scan route (`/app/g/:groupId/scan`) -- CONTRACT §3.6, the headline
 * feature. Drives the capture -> scanning -> review -> assign state machine via
 * `useReceiptScan`: upload to R2 (scope:'app'), parse with the `scanReceipt`
 * vision action, reconcile + edit, tap-to-assign, then save through `addExpense`
 * as an itemized expense and return to the group.
 */

import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth, useR2Files } from 'deepspace'
import { EV } from '../../../../../design'
import { useGroup, useGroupMembers } from '../../../../../hooks'
import {
  AssignView,
  ReceiptReview,
  ScanCapture,
  ScanningView,
  useReceiptScan,
  type AssignMember,
} from '../../../../../components/scan'

export default function ScanPage() {
  const { groupId } = useParams()
  const { userId } = useAuth()
  const navigate = useNavigate()
  const group = useGroup(groupId)
  const membersQ = useGroupMembers(groupId)
  const { upload } = useR2Files({ scope: 'app' })

  const members = useMemo<AssignMember[]>(
    () =>
      membersQ.records
        .filter((m) => m.data.status !== 'removed')
        .map((m) => ({
          id: m.data.userId ?? m.data.guestId ?? m.recordId,
          name: m.data.displayName,
        })),
    [membersQ.records],
  )

  const primaryCurrency = group.record?.data.primaryCurrency ?? 'USD'
  const groupName = group.record?.data.name ?? 'Group'
  const goGroup = () => navigate(groupId ? `/app/g/${groupId}` : '/app')

  const scan = useReceiptScan({
    groupId: groupId ?? '',
    userId,
    members,
    primaryCurrency,
    upload,
  })

  if (group.status === 'loading' && !group.record) {
    return <div className="h-full" style={{ background: EV.paper }} />
  }

  if (scan.phase === 'assign') {
    return <AssignView scan={scan} members={members} />
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: EV.paper }}>
      {scan.phase === 'capture' && <ScanCapture groupName={groupName} onFile={scan.start} onBack={goGroup} />}
      {scan.phase === 'scanning' && (
        <ScanningView groupName={groupName} preview={scan.localPreview} onBack={goGroup} />
      )}
      {(scan.phase === 'review' || scan.phase === 'failed') && (
        <ReceiptReview scan={scan} members={members} />
      )}
    </div>
  )
}
