/**
 * Group settings / members feature (CONTRACT §3.14). Admin-gated group-structure
 * controls — details (name, icon, cover, currency, simplify default, default
 * split), the member roster with role + settle-then-remove, and archive/delete.
 */

export { DetailsSection, type UploadFn, type GetUrlFn } from './DetailsSection'
export { MembersSection } from './MembersSection'
export { DangerZone } from './DangerZone'
export { GROUP_ICONS, groupIconFor } from './icons'
export { type GroupSettingsData } from './api'
