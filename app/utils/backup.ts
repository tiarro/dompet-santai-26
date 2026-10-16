import { categoryCatalog, readCategories } from './categories'
import { readNotes, localDate } from './notes'
import { readBudgets } from './budgets'
import { readSavings } from './savings'
import { readSettings, validateSettings, defaultSettings } from './settings'
import { financialKinds, type FinancialDocuments } from './financialStorage'
export interface FinanceBackup { app: 'dompet-santai'; version: 1; owner: string; exportedAt: string; documents: FinancialDocuments }
export function validateDocuments(documents: FinancialDocuments) {
  if (!documents || Object.keys(documents).length !== financialKinds.length
    || financialKinds.some(kind => !Object.hasOwn(documents, kind) || (documents[kind] !== null && typeof documents[kind] !== 'string'))) throw new Error('Isi backup tidak lengkap.')
  const categories = readCategories(documents.categories)
  const catalog = categoryCatalog(categories)
  const notes = readNotes(documents.notes, catalog)
  const budgets = readBudgets(documents.budgets, catalog)
  const savings = readSavings(documents.savings)
  const settings = readSettings(documents.settings)
  if (notes.some(note => note.date > localDate()) || savings.movements.some(item => item.date > localDate())) throw new Error('Backup memiliki transaksi bertanggal masa depan.')
  validateSettings(settings, notes, budgets, savings)
  return { notes, budgets, categories, savings, settings }
}
export function parseBackup(raw: string, owner: string): FinanceBackup {
  if (raw.length > 15_000_000) throw new Error('Ukuran backup maksimal 15 MB.')
  const backup = JSON.parse(raw) as FinanceBackup
  if (!backup || backup.app !== 'dompet-santai' || backup.version !== 1 || backup.owner !== owner
    || typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))) {
    throw new Error('Backup tidak cocok. Gunakan backup versi 1 milik akun yang sedang masuk.')
  }
  validateDocuments(backup.documents)
  return backup
}
export function emptyDocuments(): FinancialDocuments {
  const settings = defaultSettings()
  settings.openingBalances = { cash: 0, bank: 0, ewallet: 0, savings: 0 }
  return { notes: null, budgets: null, categories: null, savings: null, settings: JSON.stringify(settings) }
}
