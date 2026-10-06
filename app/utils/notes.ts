import { defaultCategories as noteCategories, type CategoryCatalog } from './categories'
export { defaultCategories as noteCategories } from './categories'
import { isReceiptAttachment, type ReceiptAttachment } from './receipts'

export type NoteType = 'expense' | 'income'
export interface MoneyNote {
  id: string
  type: NoteType
  amount: number
  category: string
  account: string
  date: string
  description: string
  createdAt: string
  receipt?: ReceiptAttachment
}
export type NoteDraft = Omit<MoneyNote, 'id' | 'createdAt'>

export const noteAccounts = [
  { id: 'cash', label: 'Tunai', icon: 'payments', openingBalance: 450_000 },
  { id: 'bank', label: 'Bank', icon: 'account_balance', openingBalance: 6_500_000 },
  { id: 'ewallet', label: 'E-Wallet', icon: 'account_balance_wallet', openingBalance: 1_500_000 },
  { id: 'savings', label: 'Tabungan', icon: 'savings', openingBalance: 0 },
]
// The existing demo total is split between wallets; these are not connected bank balances.
export const openingWalletTotal = noteAccounts.reduce((total, account) => total + account.openingBalance, 0)

export function getAccountBalances(notes: MoneyNote[], today: string): Record<string, number> {
  const balances = Object.fromEntries(noteAccounts.map(account => [account.id, account.openingBalance]))
  for (const note of notes) {
    if (note.date <= today && Object.hasOwn(balances, note.account)) {
      balances[note.account] = (balances[note.account] ?? 0) + (note.type === 'income' ? note.amount : -note.amount)
    }
  }
  return balances
}

export const maxNoteAmount = 999_999_999_999

export function localDate(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

// Keep dates without a timezone so the chosen day never shifts.
export function validNoteDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false
  const date = new Date(value + 'T12:00:00')
  return !Number.isNaN(date.getTime()) && localDate(date) === value
}

export function isNoteDraft(value: unknown, categories: CategoryCatalog = noteCategories): value is NoteDraft {
  if (!value || typeof value !== 'object') return false
  const note = value as NoteDraft
  return (note.type === 'expense' || note.type === 'income')
    && Number.isSafeInteger(note.amount) && note.amount > 0 && note.amount <= maxNoteAmount
    && categories[note.type].some(category => category.id === note.category)
    && noteAccounts.some(account => account.id === note.account)
    && validNoteDate(note.date)
    && typeof note.description === 'string' && note.description.length <= 120
    && (note.receipt === undefined || isReceiptAttachment(note.receipt))
}

export function readNotes(raw: string | null, categories: CategoryCatalog = noteCategories): MoneyNote[] {
  if (raw === null) return []
  const data: unknown = JSON.parse(raw)
  if (!Array.isArray(data) || !data.every(note => {
    if (!note || typeof note !== 'object') return false
    const saved = note as MoneyNote
    return isNoteDraft(saved, categories) && typeof saved.id === 'string' && saved.id.length > 0
      && typeof saved.createdAt === 'string' && Number.isFinite(Date.parse(saved.createdAt))
  }) || new Set(data.map(note => note.id)).size !== data.length) {
    throw new Error('Invalid saved notes')
  }
  return data
}

export function summarizeNotes(notes: MoneyNote[], today: string) {
  const effective = notes.filter(note => note.date <= today)
  const net = effective.reduce((total, note) => total + (note.type === 'income' ? note.amount : -note.amount), 0)
  const todayExpenses = effective.filter(note => note.type === 'expense' && note.date === today)
    .reduce((total, note) => total + note.amount, 0)
  const monthExpenses: Record<string, number> = {}
  for (const note of effective) {
    if (note.type === 'expense' && note.date.slice(0, 7) === today.slice(0, 7)) {
      monthExpenses[note.category] = (monthExpenses[note.category] ?? 0) + note.amount
    }
  }
  return { net, todayExpenses, monthExpenses }
}

export function noteFingerprint(note: MoneyNote) {
  return JSON.stringify([note.id, note.createdAt, note.type, note.amount, note.category, note.account, note.date, note.description, note.receipt?.name, note.receipt?.dataUrl])
}

// Compute the complete replacement first, so old expenses are not charged twice and
// an income moved/deleted from a wallet cannot leave spent funds unsupported.
export function reviseNote(current: MoneyNote[], original: MoneyNote, draft: NoteDraft | null, today: string, categories: CategoryCatalog = noteCategories): MoneyNote[] {
  const latest = current.find(note => note.id === original.id)
  if (!latest) throw new Error('Catatan tidak ditemukan. Tutup detail lalu periksa riwayat kembali.')
  if (noteFingerprint(latest) !== noteFingerprint(original)) throw new Error('Catatan sudah berubah. Tutup detail lalu buka kembali sebelum mencoba lagi.')
  if (draft && (!isNoteDraft(draft, categories) || draft.date > today)) throw new Error('Periksa kembali nominal, kategori, rekening, dan tanggal catatan.')
  const next = draft ? current.map(note => note.id === original.id ? {
    id: latest.id, createdAt: latest.createdAt,
    type: draft.type, amount: draft.amount, category: draft.category, account: draft.account,
    date: draft.date, description: draft.description.trim(), ...(draft.receipt ? { receipt: draft.receipt } : {}),
  } : note) : current.filter(note => note.id !== original.id)
  const balances = getAccountBalances(next, today)
  const invalid = noteAccounts.find(account => (balances[account.id] ?? 0) < 0)
  if (invalid) throw new Error('Perubahan membuat saldo ' + invalid.label + ' tidak cukup. Sesuaikan transaksi terkait atau pilih dompet lain.')
  return next
}

