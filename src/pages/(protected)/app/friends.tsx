/**
 * Friends / 1:1 (`/app/friends`) — CONTRACT §3.8.
 *
 * Lists every `pair` group (a 1:1 friend ledger) with the friend's identity, the
 * viewer's labelled net, and last activity; a combined owed/owe header; and the
 * add-a-friend flow. The surface lives in `src/components/friends`; this route is
 * a thin entry point so the page stays a one-liner.
 */

import { FriendsView } from '../../../components/friends'

export default function FriendsPage() {
  return <FriendsView />
}
