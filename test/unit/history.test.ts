import { expect, it } from 'vitest'
import { filterHistory, groupHistory, historyRange, historyTotals, validHistoryRange } from '../../app/utils/history'
import { getAccountBalances, noteCategories, noteFingerprint, reviseNote, type MoneyNote } from '../../app/utils/notes'
const expense: MoneyNote = { id: 'expense', type: 'expense', amount: 30000, category: 'food', account: 'cash', date: '2026-10-05', description: 'Makan siang', createdAt: '2026-10-05T01:00:00Z' }
const income: MoneyNote = { ...expense, id: 'income', type: 'income', category: 'other', account: 'savings', amount: 100000 }
it('selects calendar periods across year boundaries and rejects reversed or future ranges', () => {
  expect(historyRange('last-month', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  expect(historyRange('this-month', '2026-10-05')).toEqual({ from: '2026-10-01', to: '2026-10-05' })
  expect(validHistoryRange('2026-10-06', '2026-10-05', '2026-10-05')).toBe(false)
  expect(validHistoryRange('2026-10-01', '2026-10-06', '2026-10-05')).toBe(false)
  expect(validHistoryRange('2026-02-30', '2026-10-05', '2026-10-05')).toBe(false)
})
it('combines search and filters, distinguishes same-id income/expense categories, and summarizes filtered rows', () => {
  const other = { ...expense, id: 'other', category: 'other', amount: 7000 }
  const rows = [expense, income, other, { ...expense, id: 'old', date: '2026-09-30' }]
  const filters = { query: '', type: '' as const, account: '', category: '', from: '2026-10-01', to: '2026-10-05' }
  const result = filterHistory(rows, filters, noteCategories)
  expect(historyTotals(result)).toEqual({ income: 100000, expense: 37000, net: 63000 })
  expect(filterHistory(rows, { ...filters, query: 'MAKAN & MINUM', account: 'cash' }, noteCategories)).toEqual([expense])
  expect(filterHistory(rows, { ...filters, category: 'income:other' }, noteCategories)).toEqual([income])
  expect(filterHistory(rows, { ...filters, type: 'expense', account: 'savings' }, noteCategories)).toEqual([])
  expect(groupHistory(result)).toHaveLength(1)
  expect(groupHistory(result)[0]?.notes).toHaveLength(3)
})
it('replaces expenses without double charging, moves wallet/category/date, keeps identity, and can remove receipts', () => {
  const original = { ...expense, amount: 450000, receipt: { name: 'photo.jpg', dataUrl: 'data:image/jpeg;base64,/9j/AA==' } }
  const unchanged = reviseNote([original], original, original, '2026-10-05')
  expect(getAccountBalances(unchanged, '2026-10-05').cash).toBe(0)
  const { receipt, ...draft } = original
  const next = reviseNote([original], original, { ...draft, amount: 20000, account: 'bank', category: 'transport', date: '2026-09-30' }, '2026-10-05')
  expect(next[0]?.id).toBe(original.id)
  expect(next[0]?.createdAt).toBe(original.createdAt)
  expect(next[0]?.receipt).toBeUndefined()
  expect(getAccountBalances(next, '2026-10-05')).toMatchObject({ cash: 450000, bank: 6480000 })
  expect(original.receipt).toBe(receipt)
})
it('blocks deleting, reducing, reclassifying or moving spent income and checks the full resulting balances', () => {
  const spent = { ...expense, account: 'savings', amount: 90000 }
  const rows = [income, spent]
  for (const draft of [null, { ...income, amount: 50000 }, { ...income, account: 'bank' }, { ...income, type: 'expense' as const }]) {
    expect(() => reviseNote(rows, income, draft, '2026-10-05')).toThrow(/saldo Tabungan tidak cukup/)
  }
  expect(reviseNote(rows, income, { ...income, amount: 90000 }, '2026-10-05')[0]?.amount).toBe(90000)
  expect(reviseNote(rows, spent, null, '2026-10-05')).toEqual([income])
  expect(reviseNote([income], income, null, '2026-10-05')).toEqual([])
})
it('rejects concurrent modification or deletion and validates replacement drafts', () => {
  expect(() => reviseNote([], expense, expense, '2026-10-05')).toThrow(/tidak ditemukan/)
  expect(() => reviseNote([{ ...expense, description: 'Changed' }], expense, null, '2026-10-05')).toThrow(/sudah berubah/)
  expect(() => reviseNote([expense], expense, { ...expense, amount: -1 }, '2026-10-05')).toThrow(/Periksa/)
  expect(() => reviseNote([expense], expense, { ...expense, date: '2026-10-06' }, '2026-10-05')).toThrow(/Periksa/)
  expect(noteFingerprint({ ...expense })).toBe(noteFingerprint(expense))
})
