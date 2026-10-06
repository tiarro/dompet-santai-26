import { describe, expect, it } from 'vitest'
import { getAccountBalances, openingWalletTotal, isNoteDraft, localDate, readNotes, summarizeNotes, validNoteDate, type MoneyNote } from '../../app/utils/notes'

const expense: MoneyNote = {
  id: 'note-1', type: 'expense', amount: 25000, category: 'food', account: 'cash',
  date: '2026-10-05', description: 'Makan siang', createdAt: '2026-10-05T04:00:00Z',
}
describe('money notes', () => {
  it('validates positive integer rupiah, type-specific categories and known accounts', () => {
    expect(isNoteDraft(expense)).toBe(true)
    for (const amount of [0, -1, 1.5, NaN, Infinity, 1_000_000_000_000]) {
      expect(isNoteDraft({ ...expense, amount })).toBe(false)
    }
    expect(isNoteDraft({ ...expense, type: 'income' })).toBe(false)
    expect(isNoteDraft({ ...expense, category: 'unknown' })).toBe(false)
    expect(isNoteDraft({ ...expense, account: 'unknown' })).toBe(false)
    expect(isNoteDraft({ ...expense, description: 'a'.repeat(121) })).toBe(false)
  })
  it('rejects rolled-over calendar dates and preserves the local calendar day', () => {
    expect(validNoteDate('2026-02-30')).toBe(false)
    expect(validNoteDate('2026-02-29')).toBe(false)
    expect(validNoteDate('2024-02-29')).toBe(true)
    expect(validNoteDate('2026-13-01')).toBe(false)
    expect(localDate(new Date(2026, 9, 5, 0, 1))).toBe('2026-10-05')
  })
  it('keeps historical transactions out of today and this month while updating the balance', () => {
    const income: MoneyNote = { ...expense, id: '2', type: 'income', category: 'salary', amount: 100000 }
    const old: MoneyNote = { ...expense, id: '3', amount: 50000, date: '2026-09-30' }
    const future: MoneyNote = { ...expense, id: '4', amount: 900000, date: '2026-10-06' }
    expect(summarizeNotes([expense, income, old, future], '2026-10-05')).toEqual({
      net: 25000, todayExpenses: 25000, monthExpenses: { food: 25000 },
    })
    expect(summarizeNotes([income, old], '2026-10-05').todayExpenses).toBe(0)
  })
  it('round-trips stored notes and rejects corrupt data without silently discarding it', () => {
    expect(readNotes(null)).toEqual([])
    expect(readNotes(JSON.stringify([expense]))).toEqual([expense])
    for (const raw of ['broken', '{}', '[null]', JSON.stringify([{ ...expense, amount: -1 }]), JSON.stringify([expense, expense])]) {
      expect(() => readNotes(raw)).toThrow()
    }
  })
})


it('calculates each wallet independently and keeps their total consistent with the dashboard', () => {
  const notes: MoneyNote[] = [
    expense,
    { ...expense, id: '2', account: 'bank', type: 'income', category: 'salary', amount: 100000, date: '2026-09-01' },
    { ...expense, id: '3', account: 'ewallet', amount: 50000 },
    { ...expense, id: '4', account: 'cash', amount: 999999, date: '2099-01-01' },
  ]
  const balances = getAccountBalances(notes, '2026-10-05')
  expect(balances).toEqual({ cash: 425000, bank: 6600000, ewallet: 1450000, savings: 0 })
  expect(Object.values(balances).reduce((sum, amount) => sum + amount, 0))
    .toBe(openingWalletTotal + summarizeNotes(notes, '2026-10-05').net)
  expect(getAccountBalances([], '2026-10-05').cash).toBe(450000)
  expect(getAccountBalances([{ ...expense, amount: 450000 }], '2026-10-05').cash).toBe(0)
})

it('keeps old notes compatible and only accepts bounded JPEG receipt attachments', () => {
  const receipt = { name: 'struk.jpg', dataUrl: 'data:image/jpeg;base64,/9j/AA==' }
  expect(isNoteDraft(expense)).toBe(true)
  expect(readNotes(JSON.stringify([{ ...expense, receipt }]))[0]?.receipt).toEqual(receipt)
  for (const invalid of [
    { ...receipt, dataUrl: 'https://example.com/receipt.jpg' },
    { ...receipt, dataUrl: 'data:image/svg+xml,<svg></svg>' },
    { ...receipt, dataUrl: receipt.dataUrl + 'A'.repeat(520000) },
    { ...receipt, name: '' },
    null,
  ]) {
    expect(isNoteDraft({ ...expense, receipt: invalid })).toBe(false)
  }
})
