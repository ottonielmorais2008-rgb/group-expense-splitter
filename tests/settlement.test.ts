import { describe, expect, it } from 'vitest'
import {
  computeBalances,
  formatMoney,
  parseAmountToCents,
  settleBalances,
  splitAmountCents,
  type ExpenseInput,
  type Member,
} from '../src/lib/settlement.ts'

const members: Member[] = [
  { id: 'ana', name: 'Ana' },
  { id: 'bruno', name: 'Bruno' },
  { id: 'carla', name: 'Carla' },
  { id: 'diogo', name: 'Diogo' },
]

function netById(
  balances: ReturnType<typeof computeBalances>,
): Record<string, number> {
  return Object.fromEntries(balances.map((b) => [b.memberId, b.netCents]))
}

function expectZeroSum(balances: ReturnType<typeof computeBalances>): void {
  const sum = balances.reduce((total, b) => total + b.netCents, 0)
  expect(sum).toBe(0)
}

describe('splitAmountCents', () => {
  it('splits an even amount equally', () => {
    const shares = splitAmountCents(10000, ['ana', 'bruno'])
    expect(shares.get('ana')).toBe(5000)
    expect(shares.get('bruno')).toBe(5000)
  })

  it('assigns remainder cents in sorted-id order', () => {
    const shares = splitAmountCents(100, ['carla', 'ana', 'bruno'])
    // 100 / 3 = 33 remainder 1, first in sorted ids (ana) gets the extra cent
    expect(shares.get('ana')).toBe(34)
    expect(shares.get('bruno')).toBe(33)
    expect(shares.get('carla')).toBe(33)
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('gives the remainder cent to the first sorted id', () => {
    const shares = splitAmountCents(5, ['b', 'a', 'c', 'd'])
    // 5 / 4 = 1 remainder 1, so only 'a' gets the extra cent
    expect(shares.get('a')).toBe(2)
    expect(shares.get('b')).toBe(1)
    expect(shares.get('c')).toBe(1)
    expect(shares.get('d')).toBe(1)
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(5)
  })

  it('is deterministic regardless of input order', () => {
    const left = splitAmountCents(101, ['bruno', 'ana', 'carla'])
    const right = splitAmountCents(101, ['carla', 'bruno', 'ana'])
    expect(Object.fromEntries(left)).toEqual(Object.fromEntries(right))
  })

  it('rejects a non-positive or non-integer amount', () => {
    expect(() => splitAmountCents(0, ['ana'])).toThrow(/positive integer/)
    expect(() => splitAmountCents(-10, ['ana'])).toThrow(/positive integer/)
    expect(() => splitAmountCents(10.5, ['ana'])).toThrow(/positive integer/)
  })

  it('rejects an empty or duplicate participant list', () => {
    expect(() => splitAmountCents(100, [])).toThrow(/at least one/)
    expect(() => splitAmountCents(100, ['ana', 'ana'])).toThrow(/unique/)
  })
})

describe('computeBalances', () => {
  it('credits the payer and debits equal shares', () => {
    const expenses: ExpenseInput[] = [
      { amountCents: 10000, paidById: 'ana', participantIds: ['ana', 'bruno'] },
    ]
    const nets = netById(computeBalances(members.slice(0, 2), expenses))
    expect(nets.ana).toBe(5000)
    expect(nets.bruno).toBe(-5000)
  })

  it('handles a split that does not include every member', () => {
    const expenses: ExpenseInput[] = [
      { amountCents: 900, paidById: 'ana', participantIds: ['ana', 'bruno'] },
      { amountCents: 300, paidById: 'carla', participantIds: ['carla'] },
    ]
    const balances = computeBalances(members.slice(0, 3), expenses)
    const nets = netById(balances)
    expect(nets.ana).toBe(450)
    expect(nets.bruno).toBe(-450)
    expect(nets.carla).toBe(0)
    expectZeroSum(balances)
  })

  it('keeps leftover cents consistent on an uneven three-way split', () => {
    const expenses: ExpenseInput[] = [
      { amountCents: 100, paidById: 'bruno', participantIds: ['ana', 'bruno', 'carla'] },
    ]
    const balances = computeBalances(members.slice(0, 3), expenses)
    const nets = netById(balances)
    // shares: ana 34, bruno 33, carla 33
    expect(nets.ana).toBe(-34)
    expect(nets.bruno).toBe(67)
    expect(nets.carla).toBe(-33)
    expectZeroSum(balances)
  })

  it('lets a member pay for others without being in the split', () => {
    const expenses: ExpenseInput[] = [
      { amountCents: 2000, paidById: 'ana', participantIds: ['bruno', 'carla'] },
    ]
    const nets = netById(computeBalances(members.slice(0, 3), expenses))
    expect(nets.ana).toBe(2000)
    expect(nets.bruno).toBe(-1000)
    expect(nets.carla).toBe(-1000)
  })

  it('returns zeros when there are no expenses', () => {
    const balances = computeBalances(members, [])
    expect(balances.every((b) => b.netCents === 0)).toBe(true)
  })

  it('rejects an unknown payer or participant', () => {
    expect(() =>
      computeBalances(members.slice(0, 2), [
        { amountCents: 100, paidById: 'zoe', participantIds: ['ana'] },
      ]),
    ).toThrow(/unknown payer/)
    expect(() =>
      computeBalances(members.slice(0, 2), [
        { amountCents: 100, paidById: 'ana', participantIds: ['zoe'] },
      ]),
    ).toThrow(/unknown participant/)
  })
})

describe('settleBalances', () => {
  it('returns no transfers when everyone is already settled', () => {
    expect(
      settleBalances([
        { memberId: 'ana', name: 'Ana', netCents: 0 },
        { memberId: 'bruno', name: 'Bruno', netCents: 0 },
      ]),
    ).toEqual([])
  })

  it('creates a single transfer for a two-person balance', () => {
    const transfers = settleBalances(
      computeBalances(members.slice(0, 2), [
        { amountCents: 10000, paidById: 'ana', participantIds: ['ana', 'bruno'] },
      ]),
    )
    expect(transfers).toEqual([
      {
        fromId: 'bruno',
        fromName: 'Bruno',
        toId: 'ana',
        toName: 'Ana',
        amountCents: 5000,
      },
    ])
  })

  it('minimises transfers: two debtors pay one creditor in two payments', () => {
    const transfers = settleBalances([
      { memberId: 'ana', name: 'Ana', netCents: 2000 },
      { memberId: 'bruno', name: 'Bruno', netCents: -1000 },
      { memberId: 'carla', name: 'Carla', netCents: -1000 },
    ])
    expect(transfers).toHaveLength(2)
    expect(transfers.every((t) => t.toId === 'ana')).toBe(true)
    expect(transfers.reduce((sum, t) => sum + t.amountCents, 0)).toBe(2000)
  })

  it('minimises transfers: one debtor pays two creditors in two payments', () => {
    const transfers = settleBalances([
      { memberId: 'ana', name: 'Ana', netCents: 3000 },
      { memberId: 'bruno', name: 'Bruno', netCents: 1000 },
      { memberId: 'carla', name: 'Carla', netCents: -4000 },
    ])
    expect(transfers).toHaveLength(2)
    expect(transfers.every((t) => t.fromId === 'carla')).toBe(true)
    const byTo = Object.fromEntries(transfers.map((t) => [t.toId, t.amountCents]))
    expect(byTo.ana).toBe(3000)
    expect(byTo.bruno).toBe(1000)
  })

  it('settles a four-person group with at most n-1 transfers', () => {
    const expenses: ExpenseInput[] = [
      { amountCents: 4000, paidById: 'ana', participantIds: ['ana', 'bruno', 'carla', 'diogo'] },
      { amountCents: 1500, paidById: 'bruno', participantIds: ['bruno', 'carla'] },
      { amountCents: 900, paidById: 'diogo', participantIds: ['ana', 'diogo', 'carla'] },
    ]
    const balances = computeBalances(members, expenses)
    expectZeroSum(balances)
    const transfers = settleBalances(balances)
    const nonZero = balances.filter((b) => b.netCents !== 0)
    expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero.length - 1))

    const after = Object.fromEntries(balances.map((b) => [b.memberId, b.netCents]))
    for (const transfer of transfers) {
      after[transfer.fromId] += transfer.amountCents
      after[transfer.toId] -= transfer.amountCents
    }
    for (const net of Object.values(after)) {
      expect(net).toBe(0)
    }
  })

  it('breaks ties by member id so the result is stable', () => {
    const first = settleBalances([
      { memberId: 'ana', name: 'Ana', netCents: 100 },
      { memberId: 'bruno', name: 'Bruno', netCents: 100 },
      { memberId: 'carla', name: 'Carla', netCents: -200 },
    ])
    const second = settleBalances([
      { memberId: 'carla', name: 'Carla', netCents: -200 },
      { memberId: 'bruno', name: 'Bruno', netCents: 100 },
      { memberId: 'ana', name: 'Ana', netCents: 100 },
    ])
    expect(first).toEqual(second)
  })
})

describe('money helpers', () => {
  it('formats cents with two decimal places', () => {
    expect(formatMoney(0)).toBe('0.00')
    expect(formatMoney(5)).toBe('0.05')
    expect(formatMoney(100)).toBe('1.00')
    expect(formatMoney(-1250)).toBe('-12.50')
  })

  it('parses a decimal amount into cents', () => {
    expect(parseAmountToCents('12.5')).toBe(1250)
    expect(parseAmountToCents('12.50')).toBe(1250)
    expect(parseAmountToCents('3')).toBe(300)
    expect(parseAmountToCents('0.07')).toBe(7)
  })

  it('rejects invalid or non-positive amounts', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('0')).toBeNull()
    expect(parseAmountToCents('0.00')).toBeNull()
    expect(parseAmountToCents('-1')).toBeNull()
    expect(parseAmountToCents('1.234')).toBeNull()
    expect(parseAmountToCents('12.50.1')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('1,00')).toBeNull()
  })
})
