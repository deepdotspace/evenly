/**
 * Record + FX hooks (CONTRACT §1, §3). The typed data surface every UI screen
 * binds to. Pair with the pure selectors in `src/lib/data` for derived balances.
 */

export {
  useGroups,
  useGroup,
  useFriendGroups,
  useGroupMembers,
  useExpenses,
  useSettlements,
  useReceipt,
  useComments,
  useActivity,
  useRecurring,
  useContacts,
  useProfile,
  type RecordsState,
  type RecordState,
} from './useRecords'

export {
  useFxRates,
  useFxResolver,
  type FxRatesState,
  type FxResolverState,
} from './useFx'

export { useEnsureIdentity } from './useEnsureIdentity'
