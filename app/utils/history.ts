import { localDate, validNoteDate, type MoneyNote, type NoteType } from './notes'
import type { CategoryCatalog } from './categories'

export interface HistoryFilters { query: string; type: NoteType | ''; account: string; category: string; from: string; to: string }
export type HistoryPeriod = 'this-month' | 'last-month' | 'custom' | 'all'
export function historyRange(period: Exclude<HistoryPeriod, 'custom'>, today: string) {
  const now = new Date(today + 'T12:00:00')
  if (period === 'all') return { from: '1900-01-01', to: today }
  if (period === 'last-month') return {
    from: localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: localDate(new Date(now.getFullYear(), now.getMonth(), 0)),
  }
  return { from: today.slice(0, 7) + '-01', to: today }
}
export function validHistoryRange(from: string, to: string, today: string) {
  return validNoteDate(from) && validNoteDate(to) && from <= to && to <= today
}
export function filterHistory(notes: MoneyNote[], filters: HistoryFilters, catalog: CategoryCatalog) {
  const normalize = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
  const query = normalize(filters.query)
  return notes.filter(note => {
    const label = catalog[note.type].find(category => category.id === note.category)?.label ?? ''
    return note.date >= filters.from && note.date <= filters.to
      && (!filters.type || note.type === filters.type)
      && (!filters.account || note.account === filters.account)
      && (!filters.category || note.type + ':' + note.category === filters.category)
      && (!query || normalize(note.description + ' ' + label).includes(query))
  }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}
export function historyTotals(notes: MoneyNote[]) {
  const income = notes.filter(note => note.type === 'income').reduce((total, note) => total + note.amount, 0)
  const expense = notes.filter(note => note.type === 'expense').reduce((total, note) => total + note.amount, 0)
  return { income, expense, net: income - expense }
}
export function groupHistory(notes: MoneyNote[]) {
  const groups: Array<{ date: string; notes: MoneyNote[] }> = []
  for (const note of notes) {
    const last = groups.at(-1)
    if (last?.date === note.date) last.notes.push(note)
    else groups.push({ date: note.date, notes: [note] })
  }
  return groups
}

