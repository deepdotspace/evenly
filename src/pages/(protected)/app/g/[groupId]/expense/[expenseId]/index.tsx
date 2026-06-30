import { useParams } from 'react-router-dom'
import { ExpenseDetail } from '../../../../../../../components/expense'

export default function ExpenseDetailPage() {
  const { groupId, expenseId } = useParams()
  if (!groupId || !expenseId) return null
  return <ExpenseDetail groupId={groupId} expenseId={expenseId} />
}
