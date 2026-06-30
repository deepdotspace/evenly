/**
 * /app/activity — the cross-group activity feed (CONTRACT §3.10). All the screen
 * logic lives in the owned `components/activity` surface; this route is the thin
 * mount point inside the AppShell.
 */

import { ActivityFeed } from '../../../components/activity'

export default function ActivityPage() {
  return <ActivityFeed />
}
