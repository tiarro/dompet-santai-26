import type { CategoryCatalog } from './categories'
import { maxNoteAmount, noteAccounts, noteCategories, validNoteDate, type MoneyNote, type NoteDraft } from './notes'

export interface MonthlyBudget { month: string; category: string; limit: number; defaultAccount?: string }
export type BudgetMode = 'create' | 'update'
export type BudgetStatus = 'safe' | 'near-limit' | 'reached' | 'exceeded'

export function expenseBudgetError(draft: Pick<NoteDraft, 'type' | 'category' | 'date'>, budgets: MonthlyBudget[]): string {
  if (draft.type !== 'expense' || !validNoteDate(draft.date)) return ''
  const monthly = budgets.filter(budget => budget.month === draft.date.slice(0, 7))
  if (!monthly.length) return 'Belum ada anggaran untuk bulan transaksi ini. Atur anggaran melalui menu Anggaran sebelum mencatat pengeluaran.'
  if (draft.category && !monthly.some(budget => budget.category === draft.category)) {
    return 'Kategori ini belum memiliki anggaran untuk bulan transaksi yang dipilih. Atur anggaran melalui menu Anggaran terlebih dahulu.'
  }
  return ''
}

export function validBudgetMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/.test(value)
}
export function isMonthlyBudget(value: unknown, categories: CategoryCatalog = noteCategories): value is MonthlyBudget {
  if (!value || typeof value !== 'object') return false
  const budget = value as MonthlyBudget
  return validBudgetMonth(budget.month)
    && (budget.defaultAccount === undefined || noteAccounts.some(account => account.id === budget.defaultAccount))
    && categories.expense.some(category => category.id === budget.category)
    && Number.isSafeInteger(budget.limit) && budget.limit > 0 && budget.limit <= maxNoteAmount
}
export function readBudgets(raw: string | null, categories: CategoryCatalog = noteCategories): MonthlyBudget[] {
  if (raw === null) return []
  const data: unknown = JSON.parse(raw)
  if (!Array.isArray(data) || !data.every(item => isMonthlyBudget(item, categories))
    || new Set(data.map(budget => budget.month + ':' + budget.category)).size !== data.length) {
    throw new Error('Invalid saved budgets')
  }
  return data
}
export function setBudget(current: MonthlyBudget[], draft: MonthlyBudget, mode: BudgetMode, categories: CategoryCatalog = noteCategories): MonthlyBudget[] {
  if (!isMonthlyBudget(draft, categories)) throw new Error('Isi kategori, periode, dan batas anggaran yang valid.')
  const index = current.findIndex(budget => budget.month === draft.month && budget.category === draft.category)
  if (mode === 'create' && index >= 0) throw new Error('Kategori ini sudah memiliki anggaran pada periode tersebut. Gunakan Ubah Anggaran.')
  if (mode === 'update' && index < 0) throw new Error('Anggaran tidak ditemukan. Muat ulang halaman lalu coba lagi.')
  const budget = { month: draft.month, category: draft.category, limit: draft.limit,
    ...(draft.defaultAccount ? { defaultAccount: draft.defaultAccount } : {}),
  }
  return index < 0 ? [...current, budget] : current.map((item, i) => i === index ? budget : item)
}
export function categoryExpenses(notes: MoneyNote[], month: string, category: string, today: string): MoneyNote[] {
  return notes.filter(note => note.type === 'expense' && note.category === category
    && note.date.slice(0, 7) === month && note.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}
export function budgetStatus(spent: number, limit: number): BudgetStatus {
  if (spent > limit) return 'exceeded'
  if (spent === limit) return 'reached'
  return spent >= limit * .75 ? 'near-limit' : 'safe'
}
export const budgetStatusLabels: Record<BudgetStatus, string> = {
  safe: 'Masih aman', 'near-limit': 'Mendekati batas', reached: 'Batas tercapai', exceeded: 'Terlewati',
}
export function summarizeBudgets(budgets: MonthlyBudget[], notes: MoneyNote[], month: string, today: string, catalog: CategoryCatalog = noteCategories) {
  const categories = catalog.expense.map(category => {
    const budget = budgets.find(item => item.month === month && item.category === category.id)
    const transactions = categoryExpenses(notes, month, category.id, today)
    const spent = transactions.reduce((sum, note) => sum + note.amount, 0)
    const limit = budget?.limit ?? 0
    return { ...category, budget, spent, limit, transactions, remaining: limit - spent,
      status: budget ? budgetStatus(spent, limit) : null, progress: limit ? Math.min(100, spent / limit * 100) : 0 }
  })
  const allocated = categories.filter(category => category.budget)
  const unbudgeted = categories.filter(category => !category.budget && category.spent > 0)
  const limit = allocated.reduce((sum, category) => sum + category.limit, 0)
  const spent = allocated.reduce((sum, category) => sum + category.spent, 0)
  return { categories, allocated, unbudgeted, limit, spent, remaining: limit - spent,
    unbudgetedSpent: unbudgeted.reduce((sum, category) => sum + category.spent, 0) }
}
