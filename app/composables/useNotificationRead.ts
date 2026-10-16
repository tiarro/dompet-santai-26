import type { FinanceNotification } from '~/utils/notifications'

// Read markers stay on this browser, isolated from other signed-in accounts.
export function useNotificationRead(owner: Ref<string>) {
  const read = ref<string[]>([])
  const storageWarning = ref('')
  const key = () => 'dompet-santai-notifications-v1:' + owner.value
  function stored(): string[] {
    const value: unknown = JSON.parse(localStorage.getItem(key()) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(-1000) : []
  }
  function load() {
    read.value = []
    storageWarning.value = ''
    if (!owner.value) return
    try { read.value = stored() }
    catch { storageWarning.value = 'Status baca hanya tersimpan selama sesi ini.' }
  }
  function mark(items: readonly FinanceNotification[]) {
    if (!owner.value) return
    let saved: string[] = []
    try { saved = stored() } catch { /* Keep session markers when storage is unavailable. */ }
    read.value = [...new Set([...saved, ...read.value, ...items.map(item => item.readKey)])].slice(-1000)
    try { localStorage.setItem(key(), JSON.stringify(read.value)); storageWarning.value = '' }
    catch { storageWarning.value = 'Status baca hanya tersimpan selama sesi ini.' }
  }
  function onStorage(event: StorageEvent) { if (event.key === key() || event.key === null) load() }
  let stop: (() => void) | undefined
  onMounted(() => {
    stop = watch(owner, load, { immediate: true, flush: 'sync' })
    window.addEventListener('storage', onStorage)
  })
  onBeforeUnmount(() => { stop?.(); window.removeEventListener('storage', onStorage) })
  return { read, mark, storageWarning }
}
