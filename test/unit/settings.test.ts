import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, readSettings, validateSettings, notesReminderDue } from '../../app/utils/settings'
import { emptySavings, saveGoal, moveSavings } from '../../app/utils/savings'
import { getSpendableBalances, reviseNote, type MoneyNote } from '../../app/utils/notes'
import { parseBackup, validateDocuments, emptyDocuments } from '../../app/utils/backup'
import { readFinancialItem, writeFinancialItem, replaceFinancialDocuments, readFinancialDocuments } from '../../app/utils/financialStorage'
import { readCategories, categoryCatalog } from '../../app/utils/categories'
const today = '2026-10-06'
afterEach(() => vi.unstubAllGlobals())
describe('settings and backup invariants', () => {
  it('uses configured opening balances for expenses, revisions and savings funding', () => {
    const settings = defaultSettings()
    settings.openingBalances = { cash: 100, bank: 0, ewallet: 0, savings: 0 }
    const state = saveGoal(emptySavings(), { name: 'Dana', target: 100, icon: 'savings', deadline: '', reminderDay: 0 }, undefined, 'goal', today)
    const funded = moveSavings(state, [], state.goals[0]!, { amount: 100, account: 'cash', direction: 'deposit', description: '' }, 'one', today, settings.openingBalances)
    expect(getSpendableBalances([], today, funded.movements, settings.openingBalances).cash).toBe(0)
    expect(() => moveSavings(state, [], state.goals[0]!, { amount: 101, account: 'cash', direction: 'deposit', description: '' }, 'one', today, settings.openingBalances)).toThrow(/Saldo/)
    settings.openingBalances.cash = 99
    expect(() => validateSettings(settings, [], [], funded, today)).toThrow(/negatif/)
    const income: MoneyNote = { id: 'i', type: 'income', category: 'salary', amount: 1, account: 'cash', date: today, createdAt: today + 'T00:00:00Z', description: '' }
    expect(() => reviseNote([income], income, null, today, undefined, funded.movements, settings.openingBalances)).toThrow()
  })
  it('prevents disabling a funded or budget-linked wallet, but preserves empty historical wallets', () => {
    const settings = defaultSettings()
    settings.activeAccounts = ['bank', 'ewallet']
    settings.openingBalances.cash = 100
    expect(() => validateSettings(settings, [], [], emptySavings(), today)).toThrow(/Tunai/)
    settings.openingBalances.cash = 0
    expect(() => validateSettings(settings, [], [{ month: '2026-10', category: 'food', limit: 10, defaultAccount: 'cash' }], emptySavings(), today)).toThrow(/anggaran/)
    expect(() => validateSettings(settings, [], [], emptySavings(), today)).not.toThrow()
  })
  it('rejects malformed settings and respects daily reminder time and completed notes', () => {
    const settings = defaultSettings()
    for (const bad of [{ ...settings, activeAccounts: [] }, { ...settings, theme: 'invalid' }, { ...settings, reminders: { ...settings.reminders, time: '25:00' } }, { ...settings, openingBalances: { ...settings.openingBalances, cash: -1 } }]) expect(() => readSettings(JSON.stringify(bad))).toThrow()
    settings.reminders.notes = true
    const note = { date: today } as MoneyNote
    expect(notesReminderDue(settings, [], new Date(2026, 9, 6, 19, 59))).toBe(false)
    expect(notesReminderDue(settings, [], new Date(2026, 9, 6, 20, 0))).toBe(true)
    expect(notesReminderDue(settings, [note], new Date(2026, 9, 6, 20, 0))).toBe(false)
  })
  it('validates ownership, version, relations and balances before accepting backups', () => {
    const documents = emptyDocuments()
    const backup = { app: 'dompet-santai', version: 1, owner: 'a', exportedAt: today + 'T00:00:00Z', documents }
    expect(parseBackup(JSON.stringify(backup), 'a')).toEqual(backup)
    expect(() => parseBackup(JSON.stringify(backup), 'b')).toThrow(/akun/)
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 2 }), 'a')).toThrow()
    const note = { id: 'n', type: 'expense', category: 'missing', amount: 1, account: 'cash', date: today, createdAt: today + 'T00:00:00Z', description: '' }
    expect(() => validateDocuments({ ...documents, notes: JSON.stringify([note]) })).toThrow()
    expect(() => validateDocuments({ ...documents, notes: JSON.stringify([{ ...note, category: 'food' }]) })).toThrow(/negatif/)
  })
  it('archives categories without breaking old notes and rejects invalid archive flags', () => {
    const rows = [{ id: 'custom-00000000-0000-4000-8000-000000000001', type: 'expense', label: 'Sekolah', icon: 'school', archived: true }]
    const categories = readCategories(JSON.stringify(rows))
    expect(categoryCatalog(categories).expense.at(-1)?.archived).toBe(true)
    expect(() => readCategories(JSON.stringify([{ ...rows[0], archived: 'yes' }]))).toThrow()
  })
  it('restores all documents atomically and never falls back to stale legacy data', () => {
    const map = new Map<string, string>()
    const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } }
    vi.stubGlobal('localStorage', storage)
    const key = 'dompet-santai-notes-v1:a'
    storage.setItem(key, 'old')
    const documents = emptyDocuments()
    const realSet = storage.setItem
    storage.setItem = () => { throw new Error('Quota exceeded') }
    expect(() => replaceFinancialDocuments('a', documents)).toThrow()
    expect(readFinancialItem(key)).toBe('old')
    storage.setItem = realSet
    replaceFinancialDocuments('a', documents)
    expect(readFinancialItem(key)).toBeNull()
    writeFinancialItem(key, '[]')
    expect(readFinancialDocuments('a').notes).toBe('[]')
    expect(map.get(key)).toBe('old')
    expect(readFinancialItem('dompet-santai-notes-v1:b')).toBeNull()
  })
})
