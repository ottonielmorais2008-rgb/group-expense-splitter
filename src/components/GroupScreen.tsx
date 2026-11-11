import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  computeBalances,
  formatMoney,
  parseAmountToCents,
  settleBalances,
} from '../lib/settlement.ts'
import { requireSupabase } from '../lib/supabase.ts'
import type { ExpenseRow, Group, GroupMember } from '../lib/types.ts'

type Props = {
  group: Group
  email: string
  onBack: () => void
  onSignOut: () => void
  onDeleted: () => void
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  return fallback
}

export function GroupScreen({ group, email, onBack, onSignOut, onDeleted }: Props) {
  const [members, setMembers] = useState<GroupMember[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [memberName, setMemberName] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [payerId, setPayerId] = useState('')
  const [splitIds, setSplitIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    const client = requireSupabase()
    const [memberResult, expenseResult] = await Promise.all([
      client
        .from('group_members')
        .select('id, group_id, name, created_at')
        .eq('group_id', group.id)
        .order('created_at', { ascending: true }),
      client
        .from('expenses')
        .select('id, group_id, description, amount_cents, paid_by, created_at, expense_participants(member_id)')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false }),
    ])
    if (memberResult.error) {
      throw memberResult.error
    }
    if (expenseResult.error) {
      throw expenseResult.error
    }
    const nextMembers = (memberResult.data ?? []) as GroupMember[]
    setMembers(nextMembers)
    setExpenses((expenseResult.data ?? []) as ExpenseRow[])
    setPayerId((current) => current || nextMembers[0]?.id || '')
    setSplitIds((current) =>
      current.length > 0 ? current : nextMembers.map((member) => member.id),
    )
  }

  useEffect(() => {
    let cancelled = false
    reload().catch((caught) => {
      if (!cancelled) {
        setError(errorMessage(caught, 'Could not load this group.'))
      }
    })
    return () => {
      cancelled = true
    }
  }, [group.id])

  const memberNames = useMemo(() => {
    return new Map(members.map((member) => [member.id, member.name]))
  }, [members])

  const balances = useMemo(() => {
    return computeBalances(
      members.map((member) => ({ id: member.id, name: member.name })),
      expenses.map((expense) => ({
        amountCents: expense.amount_cents,
        paidById: expense.paid_by,
        participantIds: expense.expense_participants.map((row) => row.member_id),
      })),
    )
  }, [members, expenses])

  const transfers = useMemo(() => settleBalances(balances), [balances])

  function toggleSplit(memberId: string) {
    setSplitIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    )
  }

  async function onAddMember(event: FormEvent) {
    event.preventDefault()
    const trimmed = memberName.trim()
    if (!trimmed) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: insertError } = await requireSupabase()
        .from('group_members')
        .insert({ group_id: group.id, name: trimmed })
      if (insertError) {
        throw insertError
      }
      setMemberName('')
      await reload()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not add that member.'))
    } finally {
      setBusy(false)
    }
  }

  async function onAddExpense(event: FormEvent) {
    event.preventDefault()
    const cents = parseAmountToCents(amount)
    if (cents === null) {
      setError('Enter a positive amount with at most two decimal places, for example 12.50.')
      return
    }
    if (!payerId) {
      setError('Choose who paid.')
      return
    }
    if (splitIds.length === 0) {
      setError('Choose at least one person to split the expense with.')
      return
    }
    const trimmed = description.trim()
    if (!trimmed) {
      return
    }
    setBusy(true)
    setError(null)
    const client = requireSupabase()
    try {
      const { data, error: insertError } = await client
        .from('expenses')
        .insert({
          group_id: group.id,
          description: trimmed,
          amount_cents: cents,
          paid_by: payerId,
        })
        .select('id')
        .single()
      if (insertError) {
        throw insertError
      }
      const { error: splitError } = await client.from('expense_participants').insert(
        splitIds.map((memberId) => ({
          expense_id: (data as { id: string }).id,
          member_id: memberId,
        })),
      )
      if (splitError) {
        throw splitError
      }
      setDescription('')
      setAmount('')
      await reload()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not add that expense.'))
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteExpense(expenseId: string) {
    setBusy(true)
    setError(null)
    try {
      const { error: deleteError } = await requireSupabase()
        .from('expenses')
        .delete()
        .eq('id', expenseId)
      if (deleteError) {
        throw deleteError
      }
      await reload()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not delete that expense.'))
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteGroup() {
    if (!window.confirm(`Delete the group “${group.name}” and all of its expenses?`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: deleteError } = await requireSupabase()
        .from('groups')
        .delete()
        .eq('id', group.id)
      if (deleteError) {
        throw deleteError
      }
      onDeleted()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not delete this group.'))
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Signed in as {email}</p>
          <h1>{group.name}</h1>
        </div>
        <div className="actions">
          <button type="button" onClick={onBack}>
            All groups
          </button>
          <button type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}

      <section>
        <h2>Members</h2>
        <form className="row-form" onSubmit={onAddMember}>
          <label>
            Name
            <input
              value={memberName}
              onChange={(event) => setMemberName(event.target.value)}
              maxLength={80}
              required
              placeholder="Ana"
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            Add member
          </button>
        </form>
        {members.length === 0 ? (
          <p className="muted">Add at least two people before recording an expense.</p>
        ) : (
          <ul className="chips">
            {members.map((member) => (
              <li key={member.id}>{member.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Add expense</h2>
        <form className="stack-form" onSubmit={onAddExpense}>
          <label>
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              required
              placeholder="Dinner"
            />
          </label>
          <label>
            Amount
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              placeholder="12.50"
            />
          </label>
          <label>
            Paid by
            <select
              value={payerId}
              onChange={(event) => setPayerId(event.target.value)}
              required
              disabled={members.length === 0}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Split equally among</legend>
            {members.map((member) => (
              <label key={member.id} className="check">
                <input
                  type="checkbox"
                  checked={splitIds.includes(member.id)}
                  onChange={() => toggleSplit(member.id)}
                />
                {member.name}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="primary" disabled={busy || members.length === 0}>
            Add expense
          </button>
        </form>
      </section>

      <section>
        <h2>Balances</h2>
        {members.length === 0 ? (
          <p className="muted">Balances appear after you add members and expenses.</p>
        ) : (
          <ul className="balances">
            {balances.map((balance) => (
              <li key={balance.memberId}>
                <span>{balance.name}</span>
                <strong className={balance.netCents < 0 ? 'negative' : balance.netCents > 0 ? 'positive' : ''}>
                  {balance.netCents > 0 ? '+' : ''}
                  {formatMoney(balance.netCents)}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Who pays whom</h2>
        {transfers.length === 0 ? (
          <p className="muted">Everyone is settled.</p>
        ) : (
          <ul className="list compact">
            {transfers.map((transfer) => (
              <li key={`${transfer.fromId}-${transfer.toId}-${transfer.amountCents}`}>
                {transfer.fromName} pays {transfer.toName} {formatMoney(transfer.amountCents)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Expenses</h2>
        {expenses.length === 0 ? (
          <p className="muted">No expenses yet.</p>
        ) : (
          <ul className="list compact">
            {expenses.map((expense) => (
              <li key={expense.id} className="expense">
                <div>
                  <strong>{expense.description}</strong>
                  <p>
                    {formatMoney(expense.amount_cents)} paid by{' '}
                    {memberNames.get(expense.paid_by) ?? 'Unknown'} · split among{' '}
                    {expense.expense_participants
                      .map((row) => memberNames.get(row.member_id) ?? 'Unknown')
                      .join(', ')}
                  </p>
                </div>
                <button type="button" onClick={() => onDeleteExpense(expense.id)} disabled={busy}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="danger" onClick={onDeleteGroup} disabled={busy}>
        Delete group
      </button>
    </main>
  )
}
