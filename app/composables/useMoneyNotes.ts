import { defaultCategories as noteCategories, type CategoryCatalog } from '~/utils/categories'
import { getAccountBalances, isNoteDraft, localDate, readNotes, reviseNote, type MoneyNote, type NoteDraft } from '~/utils/notes'

// Browser-only first version, isolated by account. Keep separate from the unfinished database schema.
export function useMoneyNotes(getCategories: () => CategoryCatalog = () => noteCategories) {
  const user = useSupabaseUser()
  const notes = ref<MoneyNote[]>([])
  const ready = ref(false)
  const storageError = ref('')
  const storageKey = computed(() => user.value?.sub ? 'dompet-santai-notes-v1:' + user.value.sub : null)
  const today = ref(localDate())
  const balances = computed(() => getAccountBalances(notes.value, today.value))

  function refresh() {
    today.value = localDate()
    notes.value = []
    storageError.value = ''
    ready.value = false
    if (!storageKey.value) return
    try {
      notes.value = readNotes(localStorage.getItem(storageKey.value), getCategories())
      ready.value = true
    } catch {
      storageError.value = 'Catatan di browser belum bisa dibaca. Coba muat ulang atau periksa izin penyimpanan browser.'
    }
  }

  function persist(update: (current: MoneyNote[]) => MoneyNote[]) {
    if (!storageKey.value || !ready.value) throw new Error(storageError.value || 'Silakan masuk kembali sebelum menyimpan catatan.')
    let current: MoneyNote[]
    try {
      // Check funds against the latest stored notes, including changes from another tab.
      current = readNotes(localStorage.getItem(storageKey.value), getCategories())
    } catch {
      throw new Error('Catatan belum bisa dibaca. Muat ulang halaman sebelum mencoba lagi.')
    }
    notes.value = current
    today.value = localDate()
    const next = update(current)
    try {
      localStorage.setItem(storageKey.value, JSON.stringify(next))
    } catch {
      throw new Error('Perubahan belum tersimpan. Periksa ruang dan izin penyimpanan browser, lalu coba lagi.')
    }
    notes.value = next
  }

  function save(draft: NoteDraft) {
    if (!isNoteDraft(draft, getCategories()) || draft.date > localDate()) throw new Error('Periksa kembali nominal, kategori, rekening, dan tanggal catatan.')
    const note: MoneyNote = { ...draft, description: draft.description.trim(), id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    persist(current => {
      const available = getAccountBalances(current, localDate())[draft.account] ?? 0
      if (draft.type === 'expense' && draft.amount > available) {
        throw new Error('Saldo sumber uang tidak cukup. Kurangi nominal atau pilih sumber uang lain.')
      }
      return [...current, note]
    })
    return note
  }

  function update(original: MoneyNote, draft: NoteDraft) {
    let result: MoneyNote | undefined
    persist(current => {
      const next = reviseNote(current, original, draft, localDate(), getCategories())
      result = next.find(note => note.id === original.id)
      return next
    })
    return result!
  }

  function remove(id: string, original?: MoneyNote) {
    persist(current => {
      const target = original ?? current.find(note => note.id === id)
      if (!target || target.id !== id) throw new Error('Catatan tidak ditemukan. Periksa riwayat kembali.')
      return reviseNote(current, target, null, localDate(), getCategories())
    })
  }

  function onStorage(event: StorageEvent) {
    if (event.key === storageKey.value || event.key === 'dompet-santai-categories-v1:' + user.value?.sub || event.key === null) refresh()
  }
  let stopWatching: (() => void) | undefined
  let dayTimer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    stopWatching = watch(storageKey, refresh, { immediate: true })
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    dayTimer = setInterval(() => { today.value = localDate() }, 60_000)
  })
  onBeforeUnmount(() => {
    stopWatching?.()
    clearInterval(dayTimer)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', refresh)
  })
  return { notes, balances, ready, storageError, today, save, update, remove }
}
