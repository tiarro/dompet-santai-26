export const pushOwnerKey = 'dompet-santai-push-owner-v1'

export function pushApplicationKey(key: string): ArrayBuffer {
  const binary = atob(key.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, character => character.charCodeAt(0)).buffer
}

export async function pushRegistration(register = false): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (!register) return existing
  const registration = await navigator.serviceWorker.register(import.meta.dev ? '/push-sw.js' : '/sw.js', { scope: '/' })
  if (registration.active) return registration
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Notifikasi belum siap. Muat ulang halaman lalu coba lagi.')), 15000)),
  ])
}

export async function setPushOwner(registration: ServiceWorkerRegistration, owner: string) {
  const worker = registration.active
  if (!worker) throw new Error('Notifikasi belum siap. Coba lagi.')
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Pengaturan perangkat belum tersimpan. Coba lagi.')) }, 5000)
    channel.port1.onmessage = () => { clearTimeout(timeout); channel.port1.close(); resolve() }
    worker.postMessage({ type: 'PUSH_OWNER', owner }, [channel.port2])
  })
}

export async function clearDevicePush() {
  if (!localStorage.getItem(pushOwnerKey)) return
  const registration = await pushRegistration()
  if (!registration?.pushManager) { localStorage.removeItem(pushOwnerKey); return }
  await setPushOwner(registration, '')
  const subscription = await registration.pushManager.getSubscription()
  if (subscription && !await subscription.unsubscribe()) throw new Error('Notifikasi perangkat belum dapat dinonaktifkan. Coba lagi.')
  for (const notification of await registration.getNotifications()) notification.close()
  localStorage.removeItem(pushOwnerKey)
}
