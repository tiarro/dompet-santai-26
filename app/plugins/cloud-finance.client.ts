export default defineNuxtPlugin(nuxtApp => {
  const cloud = useCloudFinance()
  const user = useSupabaseUser()
  cloud.online.value = navigator.onLine
  const refresh = () => { if (document.visibilityState === 'visible') void cloud.refresh() }
  const connection = () => { cloud.online.value = navigator.onLine; if (navigator.onLine) refresh() }
  const stop = watch(() => user.value?.sub, () => { cloud.clear(); refresh() }, { immediate: true })
  const removeRouteHook = nuxtApp.$router.afterEach(refresh)
  window.addEventListener('online', connection)
  window.addEventListener('offline', connection)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
  nuxtApp.hook('app:beforeUnmount', () => {
    stop(); removeRouteHook()
    window.removeEventListener('online', connection)
    window.removeEventListener('offline', connection)
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', refresh)
  })
})
