import { hasAuthCallbackParameters } from '~/utils/passwordRecovery'

export default defineNuxtPlugin({
  name: 'password-recovery-callback',
  dependsOn: ['supabase'],
  async setup() {
    if (window.location.pathname !== '/atur-ulang-kata-sandi') return
    const { error } = await useSupabaseClient().auth.initialize()
    // Record the result before Nuxt's initial navigation restores the original
    // URL. A successfully consumed code can reappear when that navigation runs.
    useState<boolean | null>('password-recovery-invalid-callback', () => null).value =
      !!error || hasAuthCallbackParameters(new URL(window.location.href))
  },
})
