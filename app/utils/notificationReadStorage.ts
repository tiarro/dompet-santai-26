export interface NotificationReadMark { readKey: string; readAt: string }
export interface NotificationReadRecord extends NotificationReadMark { owner: string; pending: boolean }

export function validReadKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && new TextEncoder().encode(value).length <= 512
}

export function mergeReadRecords(current: NotificationReadRecord[], incoming: NotificationReadMark[], owner: string, pending: boolean): NotificationReadRecord[] {
  const records = new Map(current.map(record => [record.readKey, record]))
  for (const mark of incoming) {
    if (!validReadKey(mark.readKey) || !Number.isFinite(Date.parse(mark.readAt))) continue
    const existing = records.get(mark.readKey)
    if (!existing || !pending) records.set(mark.readKey, { ...mark, owner, pending })
  }
  return [...records.values()]
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dompet-santai-notification-reads-v1', 1)
    let blocked = false
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('reads', { keyPath: ['owner', 'readKey'] })
      store.createIndex('owner', 'owner')
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => { blocked = true; reject(new Error('Penyimpanan status baca sedang digunakan versi lain.')) }
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result) }
  })
}

/** One IndexedDB transaction per owner avoids lost updates between browser tabs. */
export async function notificationReadRecords(owner: string, change?: (records: NotificationReadRecord[]) => NotificationReadRecord[]): Promise<NotificationReadRecord[]> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('reads', change ? 'readwrite' : 'readonly')
      const store = transaction.objectStore('reads')
      const request = store.index('owner').getAll(owner)
      let result: NotificationReadRecord[] = []
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('Status baca belum tersimpan.'))
      request.onsuccess = () => {
        const current = request.result as NotificationReadRecord[]
        result = change ? change(current) : current
        if (change) for (const record of result) store.put(record)
      }
    })
  } finally { db.close() }
}
