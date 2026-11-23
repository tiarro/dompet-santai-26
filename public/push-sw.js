/* Shared by the production PWA worker and the localhost development worker. */
const pushOwnerDatabase = 'dompet-santai-push-owner-v1'
function pushOwner(change) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(pushOwnerDatabase, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('settings')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('settings', change === undefined ? 'readonly' : 'readwrite')
      const store = transaction.objectStore('settings')
      const result = change === undefined ? store.get('owner') : store.put(change, 'owner')
      transaction.oncomplete = () => { db.close(); resolve(result.result) }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
    }
  })
}
self.addEventListener('message', event => {
  if (event.data?.type !== 'PUSH_OWNER') return
  event.waitUntil(pushOwner(typeof event.data.owner === 'string' ? event.data.owner : '')
    .then(() => event.ports[0]?.postMessage({ saved: true })))
})
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data
    try { data = event.data?.json() } catch { return }
    if (!data || data.kind !== 'notes' || data.owner !== await pushOwner()) return
    if (typeof data.expiresAt !== 'number' || data.expiresAt <= Date.now()) return
    await self.registration.showNotification('Sudah mencatat hari ini?', {
      body: 'Luangkan sebentar untuk mencatat pemasukan atau pengeluaranmu di Dompet Santai.',
      icon: '/pwa.svg', badge: '/pwa.svg', tag: 'dompet-santai-notes-' + data.date,
      data: { url: '/?pengingat=catatan' },
    })
  })())
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const destination = new URL('/?pengingat=catatan', self.location.origin).href
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue
      await client.navigate(destination)
      await client.focus()
      return
    }
    await self.clients.openWindow(destination)
  })())
})
