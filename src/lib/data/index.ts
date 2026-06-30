/**
 * Data layer (CONTRACT §1 types + §2.7-§2.10 derived selectors). The typed record
 * shapes and the pure balance/insight selectors every UI screen binds to.
 */

// Domain record-data types (§1)
export * from './types'

// Derived-balance selectors (§2.7-§2.10, §3.3, §3.4, §3.7, R1, R2)
export {
  EVEN_TOLERANCE,
  memberKey,
  memberIdentityMap,
  groupNet,
  viewerNet,
  buildBalanceLadder,
  viewerPairRows,
  settlePlan,
  overallNet,
  type MemberIdentity,
  type BalanceState,
  type BalanceLadderRow,
  type ViewerPairRow,
  type SettleEdge,
  type GroupNetContribution,
  type OverallNet,
} from './balances'

// Spend insights (§7 A1)
export {
  spendInsights,
  type SpendInsights,
  type WeeklySpend,
  type LargestExpense,
} from './insights'
