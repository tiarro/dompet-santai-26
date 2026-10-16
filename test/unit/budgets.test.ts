import { describe, expect, it } from 'vitest'
import { expenseBudgetError, budgetStatus, isMonthlyBudget, readBudgets, setBudget, summarizeBudgets, validBudgetMonth } from '../../app/utils/budgets'
import type { MoneyNote } from '../../app/utils/notes'

const budget = { month: '2026-10', category: 'food', limit: 100000 }
const note: MoneyNote = { id: '1', type: 'expense', amount: 25000, category: 'food', account: 'cash', date: '2026-10-05', description: '', createdAt: '2026-10-05T12:00:00Z' }
describe('monthly budgets', () => {
  it('requires a budget for the expense category and transaction month, while allowing income', () => {
    expect(expenseBudgetError(note, [])).toContain('Belum ada anggaran')
    expect(expenseBudgetError(note, [{ ...budget, month: '2026-09' }])).toContain('Belum ada anggaran')
    expect(expenseBudgetError(note, [{ ...budget, category: 'transport' }])).toContain('Kategori ini belum')
    expect(expenseBudgetError(note, [budget])).toBe('')
    expect(expenseBudgetError({ ...note, date: '2026-09-30' }, [budget])).toContain('Belum ada anggaran')
    expect(expenseBudgetError({ ...note, type: 'income', category: 'salary' }, [])).toBe('')
    expect(expenseBudgetError({ ...note, category: 'custom-pets' }, [{ ...budget, category: 'custom-pets' }])).toBe('')
  })
  it('accepts only valid months, expense categories and integer limits', () => {
    expect(isMonthlyBudget(budget)).toBe(true)
    for (const month of ['', '2026-00', '2026-13', '2026-1', '2026-10-01', '1899-12']) expect(validBudgetMonth(month)).toBe(false)
    for (const limit of [0, -1, 1.5, Infinity, 1000000000000]) expect(isMonthlyBudget({ ...budget, limit })).toBe(false)
    expect(isMonthlyBudget({ ...budget, category: 'salary' })).toBe(false)
  })
  it('prevents duplicates, updates the selected month only and rejects corrupt storage', () => {
    const nextMonth = { ...budget, month: '2026-11' }
    const current = setBudget([budget], nextMonth, 'create')
    expect(() => setBudget(current, budget, 'create')).toThrow(/sudah memiliki/)
    expect(setBudget(current, { ...budget, limit: 200000 }, 'update')).toEqual([{ ...budget, limit: 200000 }, nextMonth])
    expect(current[0]?.limit).toBe(100000)
    expect(() => setBudget([], budget, 'update')).toThrow()
    expect(readBudgets(null)).toEqual([])
    expect(readBudgets(JSON.stringify(current))).toEqual(current)
    for (const raw of ['broken', '{}', '[null]', JSON.stringify([budget, budget])]) expect(() => readBudgets(raw)).toThrow()
  })
  it('marks exact threshold boundaries correctly', () => {
    expect([74999, 75000, 99999, 100000, 100001].map(spent => budgetStatus(spent, 100000))).toEqual(['safe', 'near-limit', 'near-limit', 'reached', 'exceeded'])
  })
  it('includes expenses across wallets, separates unbudgeted spending, ignores income and other periods', () => {
    const notes: MoneyNote[] = [
      note, { ...note, id: '2', account: 'bank', amount: 60000 },
      { ...note, id: '3', category: 'transport', amount: 12000 },
      { ...note, id: '4', date: '2026-09-30', amount: 90000 },
      { ...note, id: '5', date: '2026-10-06', amount: 90000 },
      { ...note, id: '6', type: 'income', category: 'other', amount: 90000 },
    ]
    const result = summarizeBudgets([budget], notes, '2026-10', '2026-10-05')
    expect([result.limit, result.spent, result.remaining, result.unbudgetedSpent]).toEqual([100000, 85000, 15000, 12000])
    expect(result.allocated[0]?.transactions).toHaveLength(2)
    expect(result.allocated[0]?.status).toBe('near-limit')
    expect(result.unbudgeted[0]?.id).toBe('transport')
    const over = summarizeBudgets([budget], [...notes, { ...note, id: '7', amount: 50000 }], '2026-10', '2026-10-05')
    expect(over.remaining).toBe(-35000)
    expect(over.allocated[0]?.progress).toBe(100)
    expect(summarizeBudgets([budget], [], '2026-10', '2026-10-05').remaining).toBe(100000)
    expect(summarizeBudgets([budget], notes, '2026-11', '2026-10-05').allocated).toEqual([])
  })
})

it('keeps legacy budgets compatible and validates, updates or clears the optional payment source', () => {
  expect(readBudgets(JSON.stringify([budget]))).toEqual([budget])
  for (const defaultAccount of ['cash', 'bank', 'ewallet', 'savings']) {
    const draft = { ...budget, defaultAccount }
    expect(isMonthlyBudget(draft)).toBe(true)
    expect(readBudgets(JSON.stringify(setBudget([], draft, 'create')))).toEqual([draft])
  }
  for (const defaultAccount of ['', 'missing', null, 42]) {
    expect(isMonthlyBudget({ ...budget, defaultAccount })).toBe(false)
  }
  const current = [{ ...budget, defaultAccount: 'cash' }]
  expect(setBudget(current, { ...budget, defaultAccount: 'bank' }, 'update')[0]?.defaultAccount).toBe('bank')
  expect(setBudget(current, budget, 'update')).toEqual([budget])
  expect(current[0]?.defaultAccount).toBe('cash')
})
it('counts all actual payment sources even when a budget has a default wallet', () => {
  const notes = [note, { ...note, id: '2', account: 'ewallet', amount: 30000 }]
  const summary = summarizeBudgets([{ ...budget, defaultAccount: 'bank' }], notes, '2026-10', '2026-10-05')
  expect(summary.spent).toBe(55000)
  expect(summary.remaining).toBe(45000)
  expect(summary.allocated[0]?.transactions).toHaveLength(2)
})

