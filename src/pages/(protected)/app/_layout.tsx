/**
 * /app/* layout — the Evenly AppShell (3-pane desktop / phone). Nested inside
 * the (protected) AuthGate, so everything here is signed-in. Each child page
 * renders into the shell's content column.
 */

import AppShell from '../../../components/app/AppShell'

export default function AppLayout() {
  return <AppShell />
}
