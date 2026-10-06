import { defaultCategories as noteCategories, type CategoryCatalog } from '~/utils/categories'
import { readBudgets, setBudget, type BudgetMode, type MonthlyBudget } from '~/utils/budgets'

export function useBudgets(getCategories: () => CategoryCatalog = () => noteCategories) {
  const user = useSupabaseUser()
  const budgets = ref<MonthlyBudget[]>([])
  const ready = ref(false)
  const storageError = ref('')
  const storageKey = computed(() => user.value?.sub ? 'dompet-santai-budgets-v1:' + user.value.sub : null)

  function refresh() {
    budgets.value = []
    ready.value = false
    storageError.value = ''
    if (!storageKey.value) return
    try {
      budgets.value = readBudgets(localStorage.getItem(storageKey.value), getCategories())
      ready.value = true
    } catch {
      storageError.value = 'Anggaran di browser belum bisa dibaca. Muat ulang atau periksa izin penyimpanan browser.'
    }
  }
  function save(draft: MonthlyBudget, mode: BudgetMode) {
    if (!storageKey.value || !ready.value) throw new Error(storageError.value || 'Silakan masuk kembali sebelum menyimpan anggaran.')
    let current: MonthlyBudget[]
    try { current = readBudgets(localStorage.getItem(storageKey.value), getCategories()) }
    catch { throw new Error('Anggaran belum bisa dibaca. Muat ulang sebelum mencoba lagi.') }
    budgets.value = current
    const next = setBudget(current, draft, mode, getCategories())
    try { localStorage.setItem(storageKey.value, JSON.stringify(next)) }
    catch { throw new Error('Anggaran belum tersimpan. Periksa ruang dan izin penyimpanan browser, lalu coba lagi.') }
    budgets.value = next
  }
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey.value || event.key === 'dompet-santai-categories-v1:' + user.value?.sub || event.key === null) refresh()
  }
  let stopWatching: (() => void) | undefined
  onMounted(() => {
    stopWatching = watch(storageKey, refresh, { immediate: true })
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
  })
  onBeforeUnmount(() => {
    stopWatching?.()
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', refresh)
  })
  return { budgets, ready, storageError, save }
}
