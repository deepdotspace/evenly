/**
 * Group export (CONTRACT §3.4 — CSV + PDF). Read-only, fully client-side.
 *
 * `<ExportMenu>` is the entry point; the rest is the shared statement model and
 * its serializers, exported for testing and reuse.
 */

export { ExportMenu, type ExportMenuProps } from './ExportMenu'
export { PrintStatement, type PrintStatementProps } from './PrintStatement'
export {
  buildStatement,
  balanceIsSettled,
  type Statement,
  type StatementRow,
  type StatementMember,
  type StatementBalance,
  type StatementPayer,
} from './statement'
export { statementToCsv } from './csv'
export { downloadText, exportStem, slugify, dateStamp } from './download'
