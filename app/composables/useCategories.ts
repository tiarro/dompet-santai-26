import { addCategory, categoryCatalog, readCategories, type CategoryDraft, type CustomCategory } from '~/utils/categories'

export function useCategories() {
  const user = useSupabaseUser()
  const custom = ref<CustomCategory[]>([])
  const ready = ref(false)
  const storageError = ref('')
  const key = computed(() => user.value?.sub ? 'dompet-santai-categories-v1:' + user.value.sub : null)
  const catalog = computed(() => categoryCatalog(custom.value))
  function readLatest() {
    if (!key.value) throw new Error('Silakan masuk kembali sebelum menggunakan kategori.')
    const rows = readCategories(localStorage.getItem(key.value))
    custom.value = rows
    return categoryCatalog(rows)
  }
  function refresh() {
    custom.value = []
    ready.value = false
    storageError.value = ''
    if (!key.value) return
    try { readLatest(); ready.value = true }
    catch { storageError.value = 'Kategori di browser belum bisa dibaca. Muat ulang atau periksa izin penyimpanan browser.' }
  }
  function save(draft: CategoryDraft) {
    if (!key.value || !ready.value) throw new Error(storageError.value || 'Kategori belum siap. Coba muat ulang.')
    let current: CustomCategory[]
    try { current = readCategories(localStorage.getItem(key.value)) }
    catch { throw new Error('Kategori belum bisa dibaca. Muat ulang sebelum mencoba lagi.') }
    custom.value = current
    const next = addCategory(current, draft, 'custom-' + crypto.randomUUID())
    try { localStorage.setItem(key.value, JSON.stringify(next)) }
    catch { throw new Error('Kategori belum tersimpan. Periksa ruang dan izin penyimpanan browser, lalu coba lagi.') }
    custom.value = next
    return next[next.length - 1]!
  }
  function onStorage(event: StorageEvent) { if (event.key === key.value || event.key === null) refresh() }
  let stop: (() => void) | undefined
  onMounted(() => {
    stop = watch(key, refresh, { immediate: true })
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
  })
  onBeforeUnmount(() => {
    stop?.()
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', refresh)
  })
  return { catalog, ready, storageError, save, readLatest }
}
