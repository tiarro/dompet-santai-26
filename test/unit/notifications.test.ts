import { describe, expect, it } from 'vitest'
import { buildNotifications } from '../../app/utils/notifications'
import { defaultSettings } from '../../app/utils/settings'
import { defaultCategories } from '../../app/utils/categories'
import type { Bill } from '../../app/utils/bills'

function fixture(): Parameters<typeof buildNotifications>[0] {
  return { now: new Date(2026, 9, 15, 20, 0), bills: [], budgets: [], notes: [],
    savings: { version: 1, goals: [], movements: [] }, settings: defaultSettings(), catalog: defaultCategories,
    financeReady: true, billsReady: true, budgetsReady: true, savingsReady: true }
}
const bill = (id: string, due_on: string, status: Bill['status'] = 'pending'): Bill => ({ id, due_on, status, user_id: 'owner', series_id: id, name: 'Internet', amount: 250000, estimated: false, recurrence: 'once', anchor_day: 15, category_code: 'bills', account_code: 'bank', paid_at: null, revision: 1, created_at: '2026-10-01T00:00:00Z' })

describe('notification rules', () => {
  it('orders urgency, excludes paid and distant bills, and updates read keys only at a new stage', () => {
    const input = fixture()
    input.bills = [bill('soon', '2026-10-18'), bill('late', '2026-10-13'), bill('today', '2026-10-15'), bill('paid', '2026-10-01', 'paid'), bill('later', '2026-10-19')]
    const before = buildNotifications(input)
    expect(before.map(n => n.id)).toEqual(['bill:late', 'bill:today', 'bill:soon'])
    input.now = new Date(2026, 9, 16, 20)
    const after = buildNotifications(input)
    expect(after.find(n => n.id === 'bill:late')?.readKey).toBe(before[0]?.readKey)
    expect(after.find(n => n.id === 'bill:today')?.readKey).not.toBe(before[1]?.readKey)
    expect(after.filter(n => n.id === 'bill:today')).toHaveLength(1)
    input.bills[0]!.status = 'paid'
    expect(buildNotifications(input).some(n => n.id === 'bill:soon')).toBe(false)
  })
  it('uses the current month and distinguishes 80%, reached and exceeded budgets', () => {
    const input = fixture()
    input.budgets = [{ category: 'food', month: '2026-10', limit: 1000 }, { category: 'food', month: '2026-09', limit: 10 }]
    input.notes = [{ id: 'n', type: 'expense', category: 'food', account: 'cash', amount: 799, date: '2026-10-14', createdAt: '2026-10-14T12:00:00Z', description: '' }]
    expect(buildNotifications(input)).toHaveLength(0)
    const keys = new Set<string>()
    for (const amount of [800, 1000, 1001]) {
      input.notes[0]!.amount = amount
      const items = buildNotifications(input)
      expect(items).toHaveLength(1)
      keys.add(items[0]!.readKey)
    }
    expect(keys.size).toBe(3)
    input.now = new Date(2026, 10, 1, 20)
    expect(buildNotifications(input)).toHaveLength(0)
  })
  it('honors reminder settings, daily time, deposits, and resolved or archived goals', () => {
    const input = fixture()
    input.settings.reminders = { notes: true, time: '20:00', savings: true }
    input.savings.goals = [{ id: 'goal', name: 'Laptop', target: 1000, icon: 'savings', deadline: '', reminderDay: 15, revision: 1, archived: false, deleted: false, createdAt: '2026-10-01T00:00:00Z' }]
    expect(buildNotifications(input).map(n => n.kind)).toEqual(['savings', 'note'])
    input.now = new Date(2026, 9, 15, 19, 59)
    expect(buildNotifications(input).map(n => n.kind)).toEqual(['savings'])
    input.savings.movements = [{ id: 'm', goalId: 'goal', direction: 'deposit', amount: 100, account: 'cash', date: '2026-10-15', createdAt: '2026-10-15T00:00:00Z', description: '' }]
    expect(buildNotifications(input)).toHaveLength(0)
    input.now = new Date(2026, 9, 15, 20)
    input.notes = [{ id: 'n', type: 'income', category: 'salary', account: 'bank', amount: 100, date: '2026-10-15', createdAt: '2026-10-15T00:00:00Z', description: '' }]
    expect(buildNotifications(input)).toHaveLength(0)
    input.savings.movements = []
    input.savings.goals[0]!.archived = true
    expect(buildNotifications(input)).toHaveLength(0)
    input.savings.goals[0]!.archived = false
    input.settings.reminders.savings = false
    expect(buildNotifications(input)).toHaveLength(0)
  })
  it('does not derive reminders from unavailable data', () => {
    const input = fixture()
    input.bills = [bill('late', '2026-10-01')]
    input.settings.reminders.notes = true
    input.financeReady = false
    expect(buildNotifications(input).map(n => n.kind)).toEqual(['bill'])
    input.billsReady = false
    expect(buildNotifications(input)).toHaveLength(0)
  })
})
