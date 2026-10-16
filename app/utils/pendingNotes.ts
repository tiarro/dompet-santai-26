import { categoryCatalog } from './categories'
import { expenseBudgetError, requiredExpenseAccount } from './budgets'
import { getSpendableBalances, isNoteDraft, localDate, type MoneyNote, type NoteDraft } from './notes'
import type { CloudFinanceData } from '../composables/useCloudFinance'

export interface PendingNote {
  key: string
  owner: string
  note: MoneyNote
  status: 'pending' | 'blocked'
  error: string
  revision: number
  // A sent request may have committed even when its response was lost.
  attemptedFingerprint?: string
  lease?: { token: string; until: number }
}
export type SavedNote = MoneyNote & { pendingSync?: boolean }

export function validatePendingDraft(draft: NoteDraft, data: CloudFinanceData, today = localDate()) {
  const catalog = categoryCatalog(data.customCategories)
  if (!isNoteDraft(draft, catalog) || draft.date > today) throw new Error('Periksa nominal, kategori, dompet, dan tanggal catatan.')
}

export function pendingValidationError(note: MoneyNote, data: CloudFinanceData, today = localDate()): string {
  const catalog = categoryCatalog(data.customCategories)
  if (!isNoteDraft(note, catalog) || note.date > today) return 'Kategori atau isian catatan tidak lagi tersedia. Perbaiki catatan ini.'
  if (catalog[note.type].find(category => category.id === note.category)?.archived) return 'Kategori sudah diarsipkan. Pilih kategori aktif.'
  if (!data.settings.activeAccounts.includes(note.account)) return 'Dompet sudah dinonaktifkan. Pilih dompet aktif.'
  const budgetError = expenseBudgetError(note, data.budgets)
  if (budgetError) return budgetError
  const required = requiredExpenseAccount(note, data.budgets)
  if (required && required !== note.account) return 'Dompet anggaran berubah. Sesuaikan dompet pembayaran.'
  const balances = getSpendableBalances([...data.notes, note], today, data.savings.movements, data.settings.openingBalances)
  if (Object.values(balances).some(balance => !Number.isSafeInteger(balance) || balance < 0)) return 'Saldo terbaru tidak cukup atau melebihi batas. Perbaiki nominal atau dompet.'
  return ''
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dompet-santai-offline-v1', 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('notes', { keyPath: 'key' })
      store.createIndex('owner', 'owner')
    }
    request.onerror = () => reject(new Error('Penyimpanan perangkat tidak tersedia. Catatan belum disimpan; jangan tutup formulir.'))
    request.onblocked = () => reject(new Error('Tutup tab lama lalu coba menyimpan kembali.'))
    request.onsuccess = () => resolve(request.result)
  })
}

export async function listPendingNotes(owner: string): Promise<PendingNote[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readonly')
    const request = tx.objectStore('notes').index('owner').getAll(owner)
    tx.oncomplete = () => { db.close(); resolve((request.result as PendingNote[]).sort((a, b) => a.note.createdAt.localeCompare(b.note.createdAt) || a.key.localeCompare(b.key))) }
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Antrean catatan belum bisa dibaca. Coba lagi.')) }
  })
}

// Read and change one record in a single IndexedDB transaction: no lost edits
// or duplicate claims when two tabs synchronize the same account.
export async function changePendingNote(owner: string, id: string, change: (current: PendingNote | undefined) => PendingNote | null | undefined): Promise<PendingNote | null | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readwrite')
    const store = tx.objectStore('notes'), key = owner + ':' + id
    const request = store.get(key)
    let result: PendingNote | null | undefined, failure: unknown
    request.onsuccess = () => {
      try {
        result = change(request.result as PendingNote | undefined)
        if (result === null) store.delete(key)
        else if (result) store.put(JSON.parse(JSON.stringify({ ...result, key, owner })))
      } catch (error) { failure = error; tx.abort() }
    }
    tx.oncomplete = () => { db.close(); window.dispatchEvent(new Event('pending-notes-changed')); resolve(result) }
    tx.onabort = tx.onerror = () => {
      db.close()
      reject(failure instanceof Error && !(failure instanceof DOMException) ? failure : new Error('Catatan belum tersimpan di perangkat. Penyimpanan mungkin penuh; jangan tutup formulir.'))
    }
  })
}

export function canChangePending(item: PendingNote) {
  return !item.attemptedFingerprint && (!item.lease || item.lease.until < Date.now())
}
