import { clearDevicePush, pushApplicationKey, pushOwnerKey, pushRegistration, setPushOwner } from '~/utils/webPush'

export function useWebPush() {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  const supported = ref(false)
  const permission = ref<NotificationPermission>('default')
  const enabled = ref(false)
  const busy = ref(false)
  const configured = ref(false)
  const error = ref('')
  const notice = ref('')
  const timezone = ref('')
  const publicKey = ref('')

  async function invoke(action: string, body: Record<string, unknown> = {}) {
    const { data, error: failure } = await client.functions.invoke('daily-reminders', { body: { action, ...body } })
    if (failure) {
      let message = 'Layanan notifikasi belum tersedia. Coba lagi nanti.'
      try { message = (await failure.context?.json())?.error || message } catch {}
      throw new Error(message)
    }
    return data
  }
  async function run(action: () => Promise<void>) {
    if (busy.value) return
    busy.value = true; error.value = ''; notice.value = ''
    try { await action() }
    catch (reason) { error.value = reason instanceof Error ? reason.message : 'Notifikasi belum berhasil diperbarui.' }
    finally { busy.value = false }
  }
  async function refresh() {
    await run(async () => {
      supported.value = window.isSecureContext && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator
      timezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!supported.value) return
      permission.value = Notification.permission
      const registration = await pushRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      const result = await invoke('status', { endpoint: subscription?.endpoint })
      configured.value = result.configured
      publicKey.value = result.publicKey || ''
      enabled.value = !!result.enabled && permission.value === 'granted'
      if (enabled.value && registration) {
        await setPushOwner(registration, user.value?.sub || '')
        localStorage.setItem(pushOwnerKey, user.value?.sub || '')
        if (subscription && result.timezone !== timezone.value) {
          await invoke('subscribe', { subscription: subscription.toJSON(), timezone: timezone.value })
        }
      }
    })
  }
  async function enable() {
    // Request permission directly from the click, before any network await (Safari).
    const requested = Notification.permission === 'granted' ? Promise.resolve('granted' as const) : Notification.requestPermission()
    await run(async () => {
      permission.value = await requested
      if (permission.value !== 'granted') throw new Error('Izin notifikasi belum diberikan. Izinkan melalui pengaturan situs pada browser untuk mencoba lagi.')
      const owner = user.value?.sub
      if (!owner) throw new Error('Silakan masuk kembali.')
      const registration = await pushRegistration(true)
      if (!registration) throw new Error('Browser ini belum mendukung notifikasi perangkat.')
      let subscription = await registration.pushManager.getSubscription()
      if (localStorage.getItem(pushOwnerKey) !== owner && subscription) {
        await subscription.unsubscribe(); subscription = null
      }
      if (!subscription) {
        try { subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushApplicationKey(publicKey.value) }) }
        catch { throw new Error('Browser belum dapat mendaftarkan notifikasi perangkat. Periksa koneksi dan izin notifikasi, lalu coba lagi.') }
      }
      await setPushOwner(registration, owner)
      localStorage.setItem(pushOwnerKey, owner)
      try { await invoke('subscribe', { subscription: subscription.toJSON(), timezone: timezone.value }) }
      catch (reason) { await clearDevicePush(); throw reason }
      enabled.value = true
      notice.value = 'Notifikasi perangkat aktif. Pengingat harian mengikuti jam yang tersimpan.'
    })
  }
  async function disable() {
    await run(async () => {
      const registration = await pushRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      // Stop local delivery first, even if the network request fails.
      await clearDevicePush()
      enabled.value = false
      if (subscription) await invoke('unsubscribe', { endpoint: subscription.endpoint })
      notice.value = 'Notifikasi pada perangkat ini dinonaktifkan.'
    })
  }
  async function testNotification() {
    await run(async () => {
      const registration = await pushRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (!subscription) throw new Error('Aktifkan notifikasi perangkat terlebih dahulu.')
      await invoke('test', { endpoint: subscription.endpoint })
      notice.value = 'Notifikasi uji dikirim. Periksa notifikasi perangkat; tampilan mengikuti izin dan mode senyap perangkat.'
    })
  }
  onMounted(refresh)
  return { supported, permission, enabled, busy, configured, error, notice, timezone, enable, disable, testNotification, refresh }
}
