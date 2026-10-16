import { billStatus, type Bill } from './bills'
import { summarizeBudgets, type MonthlyBudget } from './budgets'
import { summarizeSavings, type SavingsState } from './savings'
import { localDate, type MoneyNote } from './notes'
import { notesReminderDue, type AppSettings } from './settings'
import type { CategoryCatalog } from './categories'
import { formatRupiah } from './currency'

export interface FinanceNotification {
  id: string
  readKey: string
  kind: 'bill' | 'budget' | 'savings' | 'note'
  target: string
  title: string
  description: string
  date: string
  label: string
  icon: string
  action: string
  tone: 'danger' | 'warning' | 'calm'
  priority: number
}

export function buildNotifications(input: {
  now: Date; bills: Bill[]; budgets: MonthlyBudget[]; notes: MoneyNote[]
  savings: SavingsState; settings: AppSettings; catalog: CategoryCatalog
  financeReady: boolean; billsReady: boolean; budgetsReady: boolean; savingsReady: boolean
}): FinanceNotification[] {
  const today = localDate(input.now), month = today.slice(0, 7)
  const result: FinanceNotification[] = []
  if (input.billsReady) for (const bill of input.bills) {
    const status = billStatus(bill, today)
    if (status.tone === 'paid' || status.tone === 'normal') continue
    const days = Math.round((Date.parse(today) - Date.parse(bill.due_on)) / 86400000)
    result.push({ id: 'bill:' + bill.id, readKey: JSON.stringify(['bill', bill.id, bill.due_on, status.tone]),
      kind: 'bill', target: bill.id, title: bill.name,
      description: `${formatRupiah(bill.amount)}${bill.estimated ? ' (perkiraan)' : ''} · ${days > 0 ? `Terlambat ${days} hari` : days === 0 ? 'Jatuh tempo hari ini' : `Jatuh tempo ${-days} hari lagi`}`,
      date: bill.due_on, label: status.label, icon: 'receipt_long', action: 'Lihat tagihan',
      tone: days > 0 ? 'danger' : 'warning', priority: days > 0 ? 0 : days === 0 ? 1 : 3 })
  }
  if (input.financeReady && input.budgetsReady) {
    for (const budget of summarizeBudgets(input.budgets, input.notes, month, today, input.catalog).allocated) {
      if (!budget.status || budget.spent < budget.limit * .8) continue
      const exceeded = budget.status === 'exceeded', reached = budget.status === 'reached'
      result.push({ id: 'budget:' + budget.id, readKey: JSON.stringify(['budget', budget.id, month, budget.status]),
        kind: 'budget', target: budget.id, title: `Anggaran ${budget.label}`,
        description: exceeded ? `Melebihi batas ${formatRupiah(-budget.remaining)}. Yuk, tinjau pengeluaranmu.` : `${Math.floor(budget.spent / budget.limit * 100)}% terpakai · Sisa ${formatRupiah(budget.remaining)}.`,
        date: month + '-01', label: exceeded ? 'Melewati batas' : reached ? 'Batas tercapai' : 'Mendekati batas',
        icon: 'account_balance_wallet', action: 'Lihat anggaran', tone: exceeded || reached ? 'danger' : 'warning', priority: exceeded || reached ? 2 : 4 })
    }
  }
  if (input.financeReady && input.savingsReady && input.settings.reminders.savings) {
    for (const goal of summarizeSavings(input.savings, today).goals) {
      if (!goal.reminderDue) continue
      const lastDay = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()
      result.push({ id: 'savings:' + goal.id, readKey: JSON.stringify(['savings', goal.id, month]), kind: 'savings', target: goal.id,
        title: `Sedikit lagi untuk ${goal.name}`, description: `Belum ada setoran bulan ini. ${goal.monthly ? `Perkiraan ${formatRupiah(goal.monthly)} per bulan.` : 'Sisihkan sesuai kemampuanmu.'}`,
        date: `${month}-${String(Math.min(goal.reminderDay, lastDay)).padStart(2, '0')}`, label: 'Waktunya menabung',
        icon: 'savings', action: 'Lihat target', tone: 'calm', priority: 5 })
    }
  }
  if (input.financeReady && notesReminderDue(input.settings, input.notes, input.now)) {
    result.push({ id: 'note:' + today, readKey: JSON.stringify(['note', today]), kind: 'note', target: '',
      title: 'Sudah mencatat hari ini?', description: 'Luangkan sebentar untuk mencatat pemasukan atau pengeluaranmu.',
      date: today, label: `Pengingat ${input.settings.reminders.time}`, icon: 'edit_note', action: 'Catat sekarang', tone: 'calm', priority: 6 })
  }
  return result.sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
