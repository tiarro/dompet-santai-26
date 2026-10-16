export default defineNuxtPlugin(nuxtApp => {
  const pending = usePendingNotes()
  const cloud = useCloudFinance()
  let disposed = false
  const refresh = async () => {
    await pending.reload()
    if (!disposed && document.visibilityState === 'visible') await pending.sync()
  }
  const stop = watch([pending.owner, cloud.online, cloud.ready], () => { void refresh() }, { immediate: true })
  const changed = () => { void pending.reload() }
  window.addEventListener('pending-notes-changed', changed)
  window.addEventListener('focus', refresh)
  window.addEventListener('online', refresh)
  const timer = setInterval(refresh, 15000)
  nuxtApp.hook('app:beforeUnmount', () => {
    disposed = true; stop(); clearInterval(timer)
    window.removeEventListener('pending-notes-changed', changed)
    window.removeEventListener('focus', refresh)
    window.removeEventListener('online', refresh)
  })
})
