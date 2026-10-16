import { getSpendableBalances, localDate, maxNoteAmount, noteAccounts, type MoneyNote } from './notes'
import { readFinancialItem } from './financialStorage'
import type { MonthlyBudget } from './budgets'
import type { SavingsState } from './savings'

export type ThemePreference = 'light' | 'dark' | 'system'
export const defaultTheme = 'dark' as const
export interface AppSettings {
  version: 1
  revision: number
  openingBalances: Record<string, number>
  activeAccounts: string[]
  theme: ThemePreference
  reminders: { notes: boolean; time: string; savings: boolean }
}
export const settingsKey = (owner: string) => 'dompet-santai-settings-v1:' + owner
export const defaultSettings = (): AppSettings => ({
  version: 1, revision: 0,
  openingBalances: Object.fromEntries(noteAccounts.map(item => [item.id, 0])),
  activeAccounts: ['cash', 'bank', 'ewallet'], theme: defaultTheme,
  reminders: { notes: false, time: '20:00', savings: true },
})
export function readSettings(raw: string | null): AppSettings {
  if (raw === null) return defaultSettings()
  const value = JSON.parse(raw) as AppSettings
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !['light', 'dark', 'system'].includes(value.theme) || !value.openingBalances
    || Object.keys(value.openingBalances).length !== noteAccounts.length
    || noteAccounts.some(item => !Number.isSafeInteger(value.openingBalances[item.id]) || value.openingBalances[item.id]! < 0 || value.openingBalances[item.id]! > maxNoteAmount)
    || value.openingBalances.savings !== 0
    || !Array.isArray(value.activeAccounts) || !value.activeAccounts.length || new Set(value.activeAccounts).size !== value.activeAccounts.length
    || value.activeAccounts.some(id => !noteAccounts.some(item => item.id === id))
    || !value.reminders || typeof value.reminders.notes !== 'boolean' || typeof value.reminders.savings !== 'boolean'
    || typeof value.reminders.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.reminders.time)) {
    throw new Error('Pengaturan tidak valid. Periksa saldo, dompet, tema, dan waktu pengingat.')
  }
  return value
}
export const storedSettings = (owner: string) => readSettings(readFinancialItem(settingsKey(owner)))
export function validateSettings(settings: AppSettings, notes: MoneyNote[], budgets: MonthlyBudget[], savings: SavingsState, today = localDate()) {
  readSettings(JSON.stringify(settings))
  const balances = getSpendableBalances(notes, today, savings.movements, settings.openingBalances)
  if (Object.values(balances).some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Saldo awal membuat saldo tersedia negatif. Sesuaikan transaksi atau tabungan terlebih dahulu.')
  for (const wallet of noteAccounts) {
    if (wallet.id === 'savings' || settings.activeAccounts.includes(wallet.id)) continue
    if (balances[wallet.id] !== 0 || budgets.some(item => item.defaultAccount === wallet.id)) {
      throw new Error('Dompet ' + wallet.label + ' masih memiliki saldo atau terhubung ke anggaran. Kosongkan saldo dan ubah dompet anggaran terlebih dahulu.')
    }
  }
}
export function notesReminderDue(settings: AppSettings, notes: MoneyNote[], now = new Date()) {
  const today = localDate(now)
  const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  return settings.reminders.notes && time >= settings.reminders.time && !notes.some(note => note.date === today)
}
