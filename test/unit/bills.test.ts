import { describe, it, expect } from 'vitest'
import { billStatus, sortBills, validateBill, type Bill, type BillDraft } from '../../app/utils/bills'

describe('bill reminders', () => {
  it('labels overdue, today, three-day reminders and later dates across month boundaries', () => {
    const status = (due_on: string) => billStatus({ due_on, status: 'pending' }, '2028-02-28')
    expect(status('2028-02-27').tone).toBe('late')
    expect(status('2028-02-28').tone).toBe('today')
    expect(status('2028-03-02').tone).toBe('soon')
    expect(status('2028-03-03').tone).toBe('normal')
    expect(billStatus({ due_on: '2020-01-01', status: 'paid' }).label).toBe('Lunas')
  })
  it('sorts the oldest overdue bills first without mutating stored data', () => {
    const bills = [{ id: 'b', due_on: '2026-12-01' }, { id: 'a', due_on: '2026-01-01' }] as Bill[]
    expect(sortBills(bills).map(b => b.id)).toEqual(['a', 'b'])
    expect(bills[0]?.id).toBe('b')
  })
  it('accepts estimates and rejects invalid amounts, dates and empty names', () => {
    const draft: BillDraft = { name: 'Listrik', amount: 100000, estimated: true, due_on: '2028-02-29', recurrence: 'monthly', category_code: 'bills', account_code: 'bank' }
    expect(() => validateBill(draft)).not.toThrow()
    for (const patch of [{ amount: 0 }, { amount: 1.5 }, { due_on: '2027-02-29' }, { name: ' ' }]) expect(() => validateBill({ ...draft, ...patch })).toThrow()
  })
})
