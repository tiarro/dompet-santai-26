import { localDate, validNoteDate, maxNoteAmount } from './notes'

export interface Bill {
  id: string; user_id: string; series_id: string; name: string; amount: number;
  estimated: boolean; due_on: string; recurrence: 'once' | 'monthly'; anchor_day: number;
  category_code: string; account_code: string; status: 'pending' | 'paid';
  paid_at: string | null; revision: number; created_at: string;
}
export type BillDraft = Pick<Bill, 'name' | 'amount' | 'estimated' | 'due_on' | 'recurrence' | 'category_code' | 'account_code'>
export function validateBill(draft: BillDraft) {
  if (!draft.name.trim() || draft.name.trim().length > 80) throw new Error('Isi nama tagihan maksimal 80 karakter.')
  if (!Number.isSafeInteger(draft.amount) || draft.amount < 1 || draft.amount > maxNoteAmount) throw new Error('Isi nominal rupiah bulat yang valid.')
  if (!validNoteDate(draft.due_on) || draft.due_on > '9998-12-31') throw new Error('Pilih tanggal jatuh tempo yang valid.')
  if (!['once', 'monthly'].includes(draft.recurrence)) throw new Error('Pilih pengulangan tagihan.')
}
export function billStatus(bill: Pick<Bill, 'status' | 'due_on'>, today = localDate()) {
  if (bill.status === 'paid') return { label: 'Lunas', tone: 'paid' }
  const days = Math.round((Date.parse(bill.due_on + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  if (days < 0) return { label: 'Terlambat', tone: 'late' }
  if (days === 0) return { label: 'Hari ini', tone: 'today' }
  if (days <= 3) return { label: 'Segera jatuh tempo', tone: 'soon' }
  return { label: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(bill.due_on + 'T12:00:00')), tone: 'normal' }
}
export function sortBills(bills: Bill[]) {
  return [...bills].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.id.localeCompare(b.id))
}
