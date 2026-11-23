import { clearDevicePush, pushOwnerKey } from '~/utils/webPush'

export default defineNuxtPlugin(nuxtApp => {
  let cleanup = Promise.resolve()
  const { data } = useSupabaseClient().auth.onAuthStateChange((_event, session) => {
    const owner = session?.user.id
    cleanup = cleanup.catch(() => {}).then(async () => {
      const stored = localStorage.getItem(pushOwnerKey)
      if (stored && stored !== owner) await clearDevicePush()
    })
    void cleanup.catch(() => {})
  })
  nuxtApp.vueApp.onUnmount(() => data.subscription.unsubscribe())
})
