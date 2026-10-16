import { describe, expect, it } from 'vitest'
import { changeGoalStatus, emptySavings, goalBalance, moveSavings, readSavings, saveGoal, summarizeSavings, type GoalDraft } from '../../app/utils/savings'
import { getAccountBalances, getSpendableBalances, openingWalletTotal, reviseNote, summarizeNotes, type MoneyNote } from '../../app/utils/notes'
const today = '2026-10-06'
const draft: GoalDraft = { name: 'Dana Darurat', target: 100000, icon: 'shield', deadline: '', reminderDay: 0 }
const initial = () => saveGoal(emptySavings(), draft, undefined, 'goal', today)
const deposit = { direction: 'deposit' as const, amount: 100000, account: 'cash', description: '' }
describe('savings transfers and targets', () => {
  it('conserves total money and excludes reserved funds from spendable wallets and income/expense totals', () => {
    const start = initial()
    const next = moveSavings(start, [], start.goals[0]!, deposit, 'one', today)
    const all = getAccountBalances([], today, next.movements)
    expect(all).toEqual({ cash: 350000, bank: 6500000, ewallet: 1500000, savings: 100000 })
    expect(Object.values(all).reduce((a, b) => a + b, 0)).toBe(openingWalletTotal)
    expect(getSpendableBalances([], today, next.movements).savings).toBe(0)
    expect(summarizeNotes([], today).net).toBe(0)
    expect(summarizeNotes([], today).todayExpenses).toBe(0)
    expect(goalBalance(next, 'goal')).toBe(100000)
    expect(start.movements).toEqual([])
  })
  it('checks every wallet, accepts exact balances, and bounds withdrawals by their own target', () => {
    for (const [account, balance] of Object.entries({ cash: 450000, bank: 6500000, ewallet: 1500000 })) {
      const state = initial()
      expect(() => moveSavings(state, [], state.goals[0]!, { ...deposit, account, amount: balance + 1 }, 'x', today)).toThrow(/Saldo/)
      const next = moveSavings(state, [], state.goals[0]!, { ...deposit, account, amount: balance }, 'x', today)
      expect(getSpendableBalances([], today, next.movements)[account]).toBe(0)
      expect(() => moveSavings(next, [], next.goals[0]!, { ...deposit, direction: 'withdraw', amount: balance + 1 }, 'y', today)).toThrow(/Dana target/)
      const withdrawn = moveSavings(next, [], next.goals[0]!, { ...deposit, direction: 'withdraw', account, amount: balance }, 'y', today)
      expect(getAccountBalances([], today, withdrawn.movements)[account]).toBe(balance)
      expect(goalBalance(withdrawn, 'goal')).toBe(0)
    }
  })
  it('never allocates the same money to two targets and rejects stale revisions and duplicate movements', () => {
    let state = initial()
    state = saveGoal(state, { ...draft, name: 'Laptop' }, undefined, 'second', today)
    const original = state.goals[0]!
    state = moveSavings(state, [], original, { ...deposit, amount: 400000 }, 'one', today)
    expect(() => moveSavings(state, [], state.goals[1]!, deposit, 'two', today)).toThrow(/Saldo/)
    expect(() => moveSavings(state, [], original, deposit, 'two', today)).toThrow(/sudah berubah/)
    expect(() => moveSavings(state, [], state.goals[0]!, { ...deposit, amount: 1 }, 'one', today)).toThrow(/sudah tercatat/)
    expect(() => saveGoal(state, draft, original, 'unused', today)).toThrow(/sudah berubah/)
  })
  it('protects deposited income against deletion, reduction, or moving it to another wallet', () => {
    const income: MoneyNote = { id: 'income', type: 'income', category: 'salary', account: 'cash', amount: 100000, date: today, createdAt: today + 'T00:00:00Z', description: '' }
    const start = initial()
    const state = moveSavings(start, [income], start.goals[0]!, { ...deposit, amount: 550000 }, 'x', today)
    for (const next of [null, { ...income, amount: 99999 }, { ...income, account: 'bank' }]) {
      expect(() => reviseNote([income], income, next, today, undefined, state.movements)).toThrow(/saldo Tunai/)
    }
  })
  it('archives completed targets without releasing funds and only deletes empty targets, retaining history', () => {
    const start = initial()
    expect(() => changeGoalStatus(start, start.goals[0]!, 'archive')).toThrow(/tercapai/)
    let state = moveSavings(start, [], start.goals[0]!, deposit, 'one', today)
    expect(() => changeGoalStatus(state, state.goals[0]!, 'delete')).toThrow(/Tarik seluruh/)
    state = changeGoalStatus(state, state.goals[0]!, 'archive')
    expect(summarizeSavings(state, today).total).toBe(100000)
    expect(() => moveSavings(state, [], state.goals[0]!, deposit, 'blocked', today)).toThrow(/Aktifkan/)
    state = changeGoalStatus(state, state.goals[0]!, 'restore')
    state = moveSavings(state, [], state.goals[0]!, { ...deposit, direction: 'withdraw', account: 'bank' }, 'two', today)
    state = changeGoalStatus(state, state.goals[0]!, 'delete')
    expect(state.movements).toHaveLength(2)
    expect(summarizeSavings(state, today).goals).toHaveLength(0)
    expect(readSavings(JSON.stringify(state))).toEqual(state)
  })
  it('computes remaining amount, monthly estimates, overdue goals and calendar reminders', () => {
    const state = saveGoal(emptySavings(), { ...draft, target: 120000, deadline: '2026-12-31', reminderDay: 6 }, undefined, 'goal', today)
    expect(summarizeSavings(state, today).goals[0]).toMatchObject({ remaining: 120000, monthly: 40000, reminderDue: true, progress: 0 })
    const next = moveSavings(state, [], state.goals[0]!, { ...deposit, amount: 30000 }, 'x', today)
    expect(summarizeSavings(next, today).goals[0]).toMatchObject({ monthly: 30000, reminderDue: false, progress: 25 })
    expect(summarizeSavings(next, '2027-01-06').goals[0]).toMatchObject({ overdue: true, monthly: 90000, reminderDue: true })
    const endMonth = saveGoal(emptySavings(), { ...draft, reminderDay: 31 }, undefined, 'goal', today)
    expect(summarizeSavings(endMonth, '2027-02-27').goals[0]?.reminderDue).toBe(false)
    expect(summarizeSavings(endMonth, '2027-02-28').goals[0]?.reminderDue).toBe(true)
  })
  it('rejects invalid inputs and corrupt ledgers without replacing data', () => {
    for (const target of [0, -1, 1.5, Infinity]) expect(() => saveGoal(emptySavings(), { ...draft, target })).toThrow()
    expect(() => saveGoal(emptySavings(), { ...draft, deadline: '2026-02-30' })).toThrow()
    expect(() => saveGoal(emptySavings(), { ...draft, deadline: '2020-01-01' }, undefined, 'goal', today)).toThrow(/Tenggat/)
    expect(readSavings(null)).toEqual(emptySavings())
    const state = initial()
    const funded = moveSavings(state, [], state.goals[0]!, deposit, 'one', today)
    for (const raw of ['broken', '{}', 'null', JSON.stringify({ ...funded, goals: [] }), JSON.stringify({ ...funded, movements: [...funded.movements, ...funded.movements] }), JSON.stringify({ ...funded, movements: [{ ...funded.movements[0], direction: 'withdraw' }] }), JSON.stringify({ ...funded, goals: [{ ...funded.goals[0], deleted: true }] })]) expect(() => readSavings(raw)).toThrow()
    expect(readSavings(JSON.stringify(funded))).toEqual(funded)
  })
})
