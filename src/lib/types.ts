export type Group = {
  id: string
  name: string
  created_at: string
}

export type GroupMember = {
  id: string
  group_id: string
  name: string
  created_at: string
}

export type ExpenseRow = {
  id: string
  group_id: string
  description: string
  amount_cents: number
  paid_by: string
  created_at: string
  expense_participants: { member_id: string }[]
}
