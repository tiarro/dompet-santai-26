import type { FinanceNotification } from '~/utils/notifications'
import type { Database } from '#shared/types/database'
import { mergeReadRecords, notificationReadRecords, validReadKey, type NotificationReadMark } from '~/utils/notificationReadStorage'

export function useNotificationRead(owner: Ref<string>) {
  const client = useSupabaseClient<Database>()
  const memory = useState<Record<string, NotificationReadMark[]>>('notification-read-memory', () => ({}))
  const read = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')
  const persistenceError = ref(false)
  const pending = ref(0)
  const online = ref(true)
  const storageWarning = computed(() => persistenceError.value
    ? 'Penyimpanan perangkat tidak tersedia. Status baca yang belum tersinkron hanya tersimpan selama sesi ini.'
    : pending.value ? (online.value ? 'Status baca menunggu sinkronisasi.' : 'Status baca tersimpan di perangkat dan akan disinkronkan saat online.') : '')
  let version = 0
  let active = false
  let rerun = false
  let request: AbortController | undefined
  let channel: BroadcastChannel | undefined

  function valid(id: string, generation: number) { return active && owner.value === id && version === generation }
  function keys(id: string, stored: NotificationReadMark[]) {
    return [...new Set([...stored, ...(memory.value[id] ?? [])].map(mark => mark.readKey))]
  }
  function remember(id: string, marks: NotificationReadMark[]) {
    const all = new Map((memory.value[id] ?? []).map(mark => [mark.readKey, mark]))
    for (const mark of marks) if (!all.has(mark.readKey)) all.set(mark.readKey, mark)
    memory.value[id] = [...all.values()]
  }
  function announce(id: string) {
    channel?.postMessage(id)
    try { localStorage.setItem('dompet-santai-notification-read-change', JSON.stringify([id, crypto.randomUUID()])) } catch { /* IndexedDB remains durable. */ }
  }
  async function loadLocal(id: string, generation: number) {
    let legacy: NotificationReadMark[] = []
    try {
      const raw: unknown = JSON.parse(localStorage.getItem('dompet-santai-notifications-v1:' + id) ?? '[]')
      // The old format had no timestamps; migration records the import time.
      if (Array.isArray(raw)) legacy = raw.filter(validReadKey).slice(-1000).map(readKey => ({ readKey, readAt: new Date().toISOString() }))
    } catch { /* A broken legacy cache must not discard cloud or IndexedDB data. */ }
    if (!valid(id, generation)) return []
    remember(id, legacy)
    try {
      const records = await notificationReadRecords(id, current => mergeReadRecords(current, memory.value[id] ?? [], id, true))
      if (!valid(id, generation)) return []
      const saved = new Set(records.map(record => record.readKey))
      memory.value[id] = (memory.value[id] ?? []).filter(mark => !saved.has(mark.readKey))
      read.value = keys(id, records)
      pending.value = records.filter(record => record.pending).length
      persistenceError.value = false
      return records
    } catch {
      if (valid(id, generation)) {
        persistenceError.value = true
        read.value = [...new Set([...read.value, ...keys(id, [])])]
        pending.value = (memory.value[id] ?? []).length
      }
      return []
    }
  }
  function failure(reason: unknown) {
    const code = (reason as { code?: string }).code
    return ['42P01', 'PGRST205'].includes(code ?? '')
      ? 'Penyimpanan status baca belum tersedia. Terapkan migrasi notification_reads di Supabase.'
      : 'Status baca belum dapat disinkronkan antarperangkat. Penandaan di perangkat ini tetap tersedia. Coba lagi saat koneksi siap.'
  }
  async function refresh() {
    const id = owner.value, generation = version
    if (!id || !active) return
    if (loading.value) { rerun = true; return }
    loading.value = true
    rerun = false
    request = new AbortController()
    const controller = request
    const timeout = setTimeout(() => controller.abort(), 15_000)
    const signal = request.signal
    try {
      const local = await loadLocal(id, generation)
      if (!valid(id, generation)) return
      online.value = navigator.onLine
      if (!online.value) { error.value = ''; return }
      const outgoing = new Map([...local.filter(record => record.pending), ...(memory.value[id] ?? [])].map(mark => [mark.readKey, mark]))
      const batch = [...outgoing.values()]
      for (let offset = 0; offset < batch.length; offset += 100) {
        if (!valid(id, generation)) return
        const marks = batch.slice(offset, offset + 100)
        const { error: writeError } = await client.from('notification_reads').upsert(
          marks.map(mark => ({ user_id: id, read_key: mark.readKey, read_at: mark.readAt })),
          { onConflict: 'user_id,read_key', ignoreDuplicates: true },
        ).abortSignal(signal)
        if (writeError) throw writeError
        if (!valid(id, generation)) return
        const sent = new Set(marks.map(mark => mark.readKey))
        memory.value[id] = (memory.value[id] ?? []).filter(mark => !sent.has(mark.readKey))
        try {
          await notificationReadRecords(id, records => records.map(record => sent.has(record.readKey) ? { ...record, pending: false } : record))
        } catch { persistenceError.value = true }
      }
      const remote: NotificationReadMark[] = []
      let cursor = ''
      while (valid(id, generation)) {
        let query = client.from('notification_reads').select('read_key,read_at').eq('user_id', id).order('read_key').limit(500)
        if (cursor) query = query.gt('read_key', cursor)
        const { data, error: readError } = await query.abortSignal(signal).retry(false)
        if (readError) throw readError
        if (!valid(id, generation)) return
        const rows = data ?? []
        remote.push(...rows.map(row => ({ readKey: row.read_key, readAt: row.read_at })))
        if (rows.length < 500) break
        const next = rows.at(-1)!.read_key
        if (next === cursor) throw new Error('Status baca belum selesai dimuat.')
        cursor = next
      }
      if (!valid(id, generation)) return
      try {
        const records = await notificationReadRecords(id, current => mergeReadRecords(current, remote, id, false))
        if (!valid(id, generation)) return
        read.value = keys(id, records)
        pending.value = records.filter(record => record.pending).length + (memory.value[id] ?? []).length
        persistenceError.value = false
      } catch {
        if (!valid(id, generation)) return
        read.value = [...new Set([...read.value, ...keys(id, remote)])]
        pending.value = (memory.value[id] ?? []).length
        persistenceError.value = true
      }
      error.value = ''
    } catch (reason) {
      if (valid(id, generation)) error.value = failure(reason)
    } finally {
      clearTimeout(timeout)
      if (valid(id, generation)) {
        loading.value = false
        request = undefined
        if (rerun) { rerun = false; void refresh() }
      }
    }
  }
  function mark(items: readonly FinanceNotification[]) {
    const id = owner.value, generation = version
    if (!id || !active) return
    const marks = items.filter(item => validReadKey(item.readKey) && !read.value.includes(item.readKey))
      .map(item => ({ readKey: item.readKey, readAt: new Date().toISOString() }))
    if (!marks.length) return
    remember(id, marks)
    read.value = [...new Set([...read.value, ...keys(id, [])])]
    pending.value += marks.length
    void loadLocal(id, generation).then(() => {
      if (valid(id, generation)) { announce(id); void refresh() }
    })
  }
  function wake() { online.value = navigator.onLine; if (!online.value) request?.abort(); if (document.visibilityState === 'visible') void refresh() }
  function changed(event: StorageEvent) {
    if (event.key === 'dompet-santai-notification-read-change' || event.key === 'dompet-santai-notifications-v1:' + owner.value) wake()
  }
  let stop: (() => void) | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    active = true
    online.value = navigator.onLine
    try { channel = new BroadcastChannel('dompet-santai-notification-reads'); channel.onmessage = event => { if (event.data === owner.value) wake() } } catch { /* Focus/polling still synchronize tabs. */ }
    stop = watch(owner, id => {
      version++; request?.abort(); loading.value = false
      read.value = keys(id, []); pending.value = (memory.value[id] ?? []).length
      error.value = ''; persistenceError.value = false
      void refresh()
    }, { immediate: true, flush: 'sync' })
    window.addEventListener('online', wake)
    window.addEventListener('offline', wake)
    window.addEventListener('focus', wake)
    window.addEventListener('storage', changed)
    document.addEventListener('visibilitychange', wake)
    timer = setInterval(wake, 30_000)
  })
  onBeforeUnmount(() => {
    active = false; version++; request?.abort(); stop?.(); clearInterval(timer); channel?.close()
    window.removeEventListener('online', wake)
    window.removeEventListener('offline', wake)
    window.removeEventListener('focus', wake)
    window.removeEventListener('storage', changed)
    document.removeEventListener('visibilitychange', wake)
  })
  return { read, mark, storageWarning, loading, error, refresh }
}
