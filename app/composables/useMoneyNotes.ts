import { defaultCategories, type CategoryCatalog } from '~/utils/categories'
import { budgetAccountError, expenseBudgetError, requiredExpenseAccount } from '~/utils/budgets'
import { getSpendableBalances, isNoteDraft, localDate, noteAccounts, reviseNote, type MoneyNote, type NoteDraft, type WalletTransfer } from '~/utils/notes'
import { useCloudFinance } from './useCloudFinance'

export function useMoneyNotes(getCategories: () => CategoryCatalog = () => defaultCategories) {
  const cloud = useCloudFinance()
  const pending = usePendingNotes()
  const notes = computed(() => cloud.data.value.notes)
  const transfers = computed<WalletTransfer[]>(() => cloud.data.value.savings.movements)
  const settings = computed(() => cloud.data.value.settings)
  const openings = computed(() => settings.value.openingBalances)
  const ready = cloud.ready
  const storageError = cloud.error
  const today = ref(localDate())
  const balances = computed(() => getSpendableBalances(notes.value, today.value, transfers.value, openings.value))

  function ensureReady() {
    if (!ready.value) throw new Error(storageError.value || 'Silakan masuk kembali sebelum menyimpan catatan.')
  }

  function requireExpenseRules(draft: NoteDraft, enforceAccount = false) {
    if (draft.type !== 'expense') return
    const budgets = cloud.data.value.budgets
    const error = expenseBudgetError(draft, budgets)
    if (error) throw new Error(error)
    const required = enforceAccount ? requiredExpenseAccount(draft, budgets) : undefined
    if (required && draft.account !== required) {
      throw new Error('Bayar dari harus mengikuti dompet anggaran terbaru. Pilih ulang kategori atau muat ulang halaman sebelum mencoba lagi.')
    }
  }

  async function save(draft: NoteDraft) {
    ensureReady()
    if (!cloud.online.value) return pending.enqueue(draft)
    today.value = localDate()
    if (!isNoteDraft(draft, getCategories()) || draft.date > today.value) throw new Error('Periksa kembali nominal, kategori, rekening, dan tanggal catatan.')
    if (!settings.value.activeAccounts.includes(draft.account)) throw new Error('Dompet sudah dinonaktifkan. Pilih dompet aktif.')
    requireExpenseRules(draft, true)
    if (draft.type === 'expense' && draft.amount > (balances.value[draft.account] ?? 0)) {
      throw new Error('Saldo sumber uang tidak cukup. Kurangi nominal atau pilih sumber uang lain.')
    }
    const note: MoneyNote = { ...draft, description: draft.description.trim(), id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    const owner = pending.owner.value, expected = cloud.fingerprint.value
    try { await cloud.save({ ...cloud.data.value, notes: [...notes.value, note] }) }
    catch (reason) {
      const failure = reason as Error & { code?: string }
      if (pending.owner.value === owner && !failure.code && (!cloud.online.value || /fetch|network|koneksi/i.test(failure.message))) {
        return pending.enqueue(draft, note, expected)
      }
      throw reason
    }
    return note
  }

  async function update(original: MoneyNote, draft: NoteDraft) {
    ensureReady()
    today.value = localDate()
    if (!isNoteDraft(draft, getCategories()) || draft.date > today.value) throw new Error('Periksa kembali nominal, kategori, rekening, dan tanggal catatan.')
    const current = notes.value
    if (!current.some(note => note.id === original.id) || JSON.stringify(current.find(note => note.id === original.id)) !== JSON.stringify(original)) {
      throw new Error('Catatan sudah berubah. Muat ulang riwayat sebelum mencoba lagi.')
    }
    requireExpenseRules(draft)
    const next = reviseNote(current, original, { ...draft, description: draft.description.trim() }, today.value, getCategories(), transfers.value, openings.value)
    await cloud.save({ ...cloud.data.value, notes: next })
    return next.find(note => note.id === original.id)!
  }

  async function remove(idOrNote: string | MoneyNote, original?: MoneyNote) {
    ensureReady()
    today.value = localDate()
    const target = typeof idOrNote === 'string' ? original ?? notes.value.find(note => note.id === idOrNote) : idOrNote
    if (!target) throw new Error('Catatan tidak ditemukan. Periksa riwayat kembali.')
    const current = notes.value
    const latest = current.find(note => note.id === target.id)
    if (!latest || JSON.stringify(latest) !== JSON.stringify(target)) throw new Error('Catatan sudah berubah. Muat ulang riwayat sebelum mencoba lagi.')
    const next = reviseNote(current, target, null, today.value, getCategories(), transfers.value, openings.value)
    await cloud.save({ ...cloud.data.value, notes: next })
  }

  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => { timer = setInterval(() => { today.value = localDate() }, 60_000) })
  onBeforeUnmount(() => clearInterval(timer))

  return { notes, transfers, balances, openings, settings, ready, storageError, today, save, update, remove }
}
