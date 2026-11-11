export type Member = {
  id: string
  name: string
}

export type ExpenseInput = {
  amountCents: number
  paidById: string
  participantIds: string[]
}

export type Balance = {
  memberId: string
  name: string
  netCents: number
}

export type Transfer = {
  fromId: string
  fromName: string
  toId: string
  toName: string
  amountCents: number
}

/**
 * Split an amount in cents among participants so the shares sum to the
 * original amount. Remainder cents go to the first members in sorted-id
 * order, which keeps the split deterministic.
 */
export function splitAmountCents(
  amountCents: number,
  participantIds: string[],
): Map<string, number> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('amountCents must be a positive integer')
  }
  if (participantIds.length === 0) {
    throw new Error('at least one participant is required')
  }
  const unique = new Set(participantIds)
  if (unique.size !== participantIds.length) {
    throw new Error('participant ids must be unique')
  }
  const ordered = [...unique].sort()
  const base = Math.floor(amountCents / ordered.length)
  const remainder = amountCents % ordered.length
  const shares = new Map<string, number>()
  ordered.forEach((id, index) => {
    shares.set(id, base + (index < remainder ? 1 : 0))
  })
  return shares
}

export function computeBalances(
  members: Member[],
  expenses: ExpenseInput[],
): Balance[] {
  const nets = new Map<string, number>()
  for (const member of members) {
    if (nets.has(member.id)) {
      throw new Error(`duplicate member id ${member.id}`)
    }
    nets.set(member.id, 0)
  }
  for (const expense of expenses) {
    if (!nets.has(expense.paidById)) {
      throw new Error(`unknown payer ${expense.paidById}`)
    }
    const shares = splitAmountCents(expense.amountCents, expense.participantIds)
    for (const [id, share] of shares) {
      if (!nets.has(id)) {
        throw new Error(`unknown participant ${id}`)
      }
      nets.set(id, (nets.get(id) ?? 0) - share)
    }
    nets.set(expense.paidById, (nets.get(expense.paidById) ?? 0) + expense.amountCents)
  }
  return members.map((member) => ({
    memberId: member.id,
    name: member.name,
    netCents: nets.get(member.id) ?? 0,
  }))
}

/**
 * Greedy settlement: the largest debtor pays the largest creditor until
 * every balance is zero. Ties are broken by member id so the result is
 * deterministic. The number of transfers is at most n - 1 for n people
 * with a non-zero balance.
 */
export function settleBalances(balances: Balance[]): Transfer[] {
  const debtors = balances
    .filter((balance) => balance.netCents < 0)
    .map((balance) => ({ ...balance }))
  const creditors = balances
    .filter((balance) => balance.netCents > 0)
    .map((balance) => ({ ...balance }))

  const pickIndex = (
    list: Balance[],
    compare: (left: Balance, right: Balance) => boolean,
  ): number => {
    let best = 0
    for (let index = 1; index < list.length; index += 1) {
      if (compare(list[index], list[best])) {
        best = index
      }
    }
    return best
  }

  const transfers: Transfer[] = []
  while (debtors.length > 0 && creditors.length > 0) {
    const debtorIndex = pickIndex(
      debtors,
      (left, right) =>
        left.netCents < right.netCents ||
        (left.netCents === right.netCents && left.memberId < right.memberId),
    )
    const creditorIndex = pickIndex(
      creditors,
      (left, right) =>
        left.netCents > right.netCents ||
        (left.netCents === right.netCents && left.memberId < right.memberId),
    )
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]
    const amount = Math.min(-debtor.netCents, creditor.netCents)
    if (amount <= 0) {
      break
    }
    transfers.push({
      fromId: debtor.memberId,
      fromName: debtor.name,
      toId: creditor.memberId,
      toName: creditor.name,
      amountCents: amount,
    })
    debtor.netCents += amount
    creditor.netCents -= amount
    if (debtor.netCents === 0) {
      debtors.splice(debtorIndex, 1)
    }
    if (creditor.netCents === 0) {
      creditors.splice(creditorIndex, 1)
    }
  }
  return transfers
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole}.${frac}`
}

export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null
  }
  const [whole, fraction = ''] = trimmed.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    return null
  }
  return cents
}
