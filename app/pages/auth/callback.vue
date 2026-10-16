<script setup lang="ts">
import type { Database } from '#shared/types/database'

useHead({ title: 'Masuk dengan Google - Dompet Santai' })
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const session = useSupabaseSession()
const errorMessage = ref('')
const processing = ref(false)
const draft = useState('onboarding-step-one', () => ({ nickname: '', goal: '' }))

async function completeSignIn() {
  if (processing.value) return
  processing.value = true
  errorMessage.value = ''
  try {
    // The Nuxt Supabase browser client exchanges the PKCE code during
    // initialization. Await that result; exchanging it again would reuse a code.
    const { error: initializationError } = await supabase.auth.initialize()
    const params = new URLSearchParams(window.location.search)
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const providerError = params.get('error') || fragment.get('error')
    // Remove OAuth parameters from browser history, including on failed callbacks.
    window.history.replaceState(window.history.state, '', window.location.pathname)
    if (providerError || initializationError) {
      throw new Error('Login Google belum selesai atau tautannya sudah kedaluwarsa. Silakan mulai lagi dari halaman masuk.')
    }
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) {
      throw new Error('Sesi Google belum tersedia. Silakan mulai lagi dari halaman masuk.')
    }
    const { data: verified, error: verificationError } = await supabase.auth.getClaims(data.session.access_token)
    if (verificationError || !verified?.claims) {
      throw new Error('Sesi login belum dapat diverifikasi. Periksa koneksi lalu coba lagi.')
    }
    session.value = data.session
    user.value = verified.claims

    // Read the existing profile for this verified identity. OAuth sign-in itself
    // reuses the Supabase user; neither button creates or resets a profile here.
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('username, onboarding_goal, onboarding_completed_at')
      .eq('id', verified.claims.sub)
      .maybeSingle()
    if (profileError) {
      throw new Error('Status akun belum bisa dimuat. Periksa koneksi lalu coba lagi.')
    }
    if (!profile?.onboarding_completed_at) {
      draft.value = {
        nickname: profile?.username || data.session.user.user_metadata?.full_name || '',
        goal: profile?.onboarding_goal || '',
      }
    }
    await navigateTo(profile?.onboarding_completed_at ? '/' : '/onboarding', { replace: true })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Login Google belum berhasil. Silakan coba lagi.'
  } finally {
    processing.value = false
  }
}

onMounted(completeSignIn)
</script>

<template>
  <main class="auth-callback" :aria-busy="processing">
    <h1>Masuk dengan Google</h1>
    <template v-if="errorMessage">
      <p role="alert">{{ errorMessage }}</p>
      <button type="button" :disabled="processing" @click="completeSignIn">Coba lagi</button>
      <NuxtLink to="/login">Kembali ke halaman masuk</NuxtLink>
    </template>
    <p v-else role="status">Menyiapkan akun Anda…</p>
  </main>
</template>

<style scoped>
.auth-callback { max-width: 32rem; margin: 15vh auto; padding: 1.5rem; text-align: center; }
h1 { font-size: 1.5rem; }
p { margin: 1.25rem 0; line-height: 1.6; }
button, a { display: inline-block; margin: .5rem; padding: .75rem 1rem; }
button { cursor: pointer; }
</style>
