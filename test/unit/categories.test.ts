import { expect, it } from 'vitest'
import { addCategory, categoryCatalog, readCategories } from '../../app/utils/categories'
import { isNoteDraft, readNotes, type MoneyNote } from '../../app/utils/notes'
import { readBudgets, setBudget, summarizeBudgets } from '../../app/utils/budgets'
const id = 'custom-00000000-0000-4000-8000-000000000001'
const id2 = 'custom-00000000-0000-4000-8000-000000000002'
const draft = { type: 'expense' as const, label: '  Biaya   Sekolah ', icon: 'school' }

it('normalizes labels and rejects duplicate built-in/custom names within the same type', () => {
  const custom = addCategory([], draft, id)
  expect(custom[0]?.label).toBe('Biaya Sekolah')
  expect(() => addCategory(custom, { ...draft, label: 'biaya SEKOLAH' }, id2)).toThrow(/sudah digunakan/)
  expect(() => addCategory([], { ...draft, label: '  makan & MINUM ' }, id)).toThrow(/sudah digunakan/)
  expect(addCategory(custom, { ...draft, type: 'income' }, id2)).toHaveLength(2)
  expect(() => addCategory(custom, { ...draft, label: 'Buku' }, id)).toThrow()
  for (const label of ['', '   ', 'a'.repeat(33)]) expect(() => addCategory([], { ...draft, label }, id)).toThrow()
  expect(() => addCategory([], { ...draft, icon: 'not-an-icon' }, id)).toThrow()
})
it('round-trips custom categories and refuses corrupt storage', () => {
  const custom = addCategory([], draft, id)
  expect(readCategories(JSON.stringify(custom))).toEqual(custom)
  expect(readCategories(null)).toEqual([])
  for (const raw of ['invalid', '{}', '[null]', JSON.stringify([...custom, ...custom])]) expect(() => readCategories(raw)).toThrow()
})
it('validates custom notes and budgets against the correct account catalog and type', () => {
  const catalog = categoryCatalog(addCategory([], draft, id))
  const note: MoneyNote = { id: 'note-1', type: 'expense', amount: 20000, category: id, account: 'cash', date: '2026-10-05', description: '', createdAt: '2026-10-05T01:00:00Z' }
  expect(isNoteDraft(note, catalog)).toBe(true)
  expect(isNoteDraft(note)).toBe(false)
  expect(isNoteDraft({ ...note, type: 'income' }, catalog)).toBe(false)
  expect(readNotes(JSON.stringify([note]), catalog)).toEqual([note])
  expect(() => readNotes(JSON.stringify([note]))).toThrow()
  const budget = { category: id, month: '2026-10', limit: 100000 }
  expect(setBudget([], budget, 'create', catalog)).toEqual([budget])
  expect(readBudgets(JSON.stringify([budget]), catalog)).toEqual([budget])
  expect(() => readBudgets(JSON.stringify([budget]))).toThrow()
  const summary = summarizeBudgets([budget], [note], '2026-10', '2026-10-05', catalog)
  expect(summary.allocated[0]?.label).toBe('Biaya Sekolah')
  expect(summary.remaining).toBe(80000)
  expect(summarizeBudgets([], [note], '2026-10', '2026-10-05', catalog).unbudgetedSpent).toBe(20000)
})

