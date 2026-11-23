<script setup lang="ts">
import { hasAuthCallbackParameters } from '~/utils/passwordRecovery'

const supabase = useSupabaseClient()
const invalidCallback = useState<boolean | null>('password-recovery-invalid-callback', () => null)
const status = ref<'checking' | 'ready' | 'invalid' | 'success'>('checking')
const owner = ref('')
const email = ref('')
const password = ref('')
const confirmation = ref('')
const showPassword = ref(false)
const attempted = ref(false)
const saving = ref(false)
const signingOut = ref(false)
const signedOut = ref(false)
const errorMessage = ref('')
const logoutError = ref('')
const passwordInput = ref<HTMLInputElement | null>(null)
const confirmationInput = ref<HTMLInputElement | null>(null)
const passwordError = computed(() => attempted.value && password.value.length < 8 ? 'Gunakan kata sandi minimal 8 karakter.' : '')
const confirmationError = computed(() => attempted.value && confirmation.value !== password.value ? 'Konfirmasi kata sandi belum sama.' : '')
const invalidLinkMessage = 'Tautan pemulihan tidak valid, sudah digunakan, atau kedaluwarsa. Minta tautan baru melalui Lupa kata sandi di halaman masuk, lalu buka di browser yang sama.'

function invalidate(message = invalidLinkMessage) {
  status.value = 'invalid'
  errorMessage.value = message
  password.value = ''
  confirmation.value = ''
}

function sessionExpired(reason: unknown) {
  const error = reason as { name?: string; status?: number; code?: string }
  return error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403 || ['session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt'].includes(error.code ?? '')
}

async function verifiedAccount() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw Object.assign(new Error('Sesi tidak tersedia.'), { status: 401 })
  return data.user
}

async function initializeRecovery() {
  try {
    // The Nuxt Supabase client exchanges the PKCE code during initialization.
    // Exchanging it again here would reuse a one-time code.
    const { error } = await supabase.auth.initialize()
    // An unconsumed code can mean the PKCE verifier is missing. Do not fall
    // back to another account's existing session when a recovery link fails.
    const unfinishedCallback = invalidCallback.value ?? hasAuthCallbackParameters(new URL(window.location.href))
    invalidCallback.value = null
    if (error || unfinishedCallback) {
      invalidate()
      return
    }
    const account = await verifiedAccount()
    owner.value = account.id
    email.value = account.email ?? ''
    status.value = 'ready'
  } catch (reason) {
    invalidate(sessionExpired(reason) ? invalidLinkMessage : 'Sesi pemulihan belum dapat diperiksa. Periksa koneksi, lalu buka kembali tautan dari email atau minta tautan baru.')
  } finally {
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }
}

async function finishSignOut() {
  if (signingOut.value) return
  signingOut.value = true
  logoutError.value = ''
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || data.session) throw error
    }
    signedOut.value = true
  } catch {
    logoutError.value = 'Kata sandi sudah tersimpan, tetapi sesi browser ini belum dapat diakhiri. Coba keluar lagi untuk masuk dengan kata sandi baru.'
  } finally {
    signingOut.value = false
  }
}

async function submit() {
  if (saving.value || status.value !== 'ready') return
  attempted.value = true
  errorMessage.value = ''
  if (passwordError.value) { passwordInput.value?.focus(); return }
  if (confirmationError.value) { confirmationInput.value?.focus(); return }
  saving.value = true
  try {
    const account = await verifiedAccount()
    if (status.value !== 'ready' || account.id !== owner.value) {
      invalidate('Akun atau sesi berubah. Buka kembali tautan pemulihan untuk akun yang ingin diubah.')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: password.value })
    if (error) throw error
    password.value = ''
    confirmation.value = ''
    showPassword.value = false
    status.value = 'success'
    await finishSignOut()
  } catch (reason) {
    if (sessionExpired(reason)) {
      invalidate('Sesi pemulihan sudah berakhir. Minta tautan pemulihan baru melalui halaman masuk.')
      return
    }
    const code = (reason as { code?: string }).code
    const messages: Record<string, string> = {
      weak_password: 'Kata sandi belum memenuhi ketentuan keamanan akun. Gunakan kata sandi yang lebih kuat.',
      same_password: 'Kata sandi baru harus berbeda dari kata sandi sebelumnya.',
      over_request_rate_limit: 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.',
      reauthentication_needed: 'Verifikasi ulang diperlukan. Minta tautan pemulihan baru melalui halaman masuk.',
    }
    errorMessage.value = messages[code ?? ''] ?? 'Kata sandi belum dapat diperbarui. Periksa koneksi lalu coba lagi. Isian Anda tetap tersedia.'
  } finally {
    saving.value = false
  }
}

let unsubscribe: (() => void) | undefined
onMounted(() => {
  const { data } = supabase.auth.onAuthStateChange((_, session) => {
    if (status.value === 'ready' && session?.user.id !== owner.value) {
      invalidate('Akun atau sesi berubah. Buka kembali tautan pemulihan untuk akun yang ingin diubah.')
    }
  })
  unsubscribe = () => data.subscription.unsubscribe()
  void initializeRecovery()
})
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <section class="reset-password-page">
    <div class="recovery-card" :aria-busy="status === 'checking' || saving || signingOut">
      <span class="brand-icon material-symbols-outlined" aria-hidden="true">lock_reset</span>
      <p class="eyebrow">Dompet Santai</p>
      <h1>Atur ulang kata sandi</h1>
      <p v-if="status === 'checking'" role="status">Memeriksa tautan pemulihan…</p>
      <template v-else-if="status === 'success'">
        <p class="success-message" role="status">Kata sandi berhasil diperbarui.</p>
        <p v-if="signingOut" role="status">Mengakhiri sesi browser ini…</p>
        <p v-else-if="signedOut">Silakan masuk kembali dengan kata sandi baru Anda.</p>
        <p v-if="logoutError" class="error-message" role="alert">{{ logoutError }}</p>
        <button v-if="logoutError" class="primary-button" :disabled="signingOut" @click="finishSignOut">Coba keluar lagi</button>
        <NuxtLink v-if="signedOut" class="primary-button" to="/login">Masuk dengan kata sandi baru</NuxtLink>
      </template>
      <template v-else>
        <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
        <form v-if="status === 'ready'" novalidate @submit.prevent="submit">
          <p class="account">Buat kata sandi baru untuk <strong>{{ email }}</strong>.</p>
          <fieldset :disabled="saving">
            <label for="new-password">Kata sandi baru</label>
            <input id="new-password" ref="passwordInput" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" minlength="8" required :aria-invalid="!!passwordError" :aria-describedby="passwordError ? 'new-password-error' : 'new-password-help'">
            <p v-if="passwordError" id="new-password-error" class="field-error" role="alert">{{ passwordError }}</p>
            <p v-else id="new-password-help" class="hint">Gunakan minimal 8 karakter.</p>
            <label for="confirm-password">Konfirmasi kata sandi baru</label>
            <input id="confirm-password" ref="confirmationInput" v-model="confirmation" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" required :aria-invalid="!!confirmationError" :aria-describedby="confirmationError ? 'confirm-password-error' : undefined">
            <p v-if="confirmationError" id="confirm-password-error" class="field-error" role="alert">{{ confirmationError }}</p>
            <label class="show-password"><input v-model="showPassword" type="checkbox">Tampilkan kata sandi</label>
            <button class="primary-button" type="submit">{{ saving ? 'Menyimpan…' : 'Simpan kata sandi baru' }}</button>
          </fieldset>
        </form>
        <NuxtLink class="back-link" to="/login">Kembali ke halaman masuk</NuxtLink>
      </template>
    </div>
  </section>
</template>

<style scoped>
.reset-password-page { --canvas: var(--light-canvas, #f5f7fc); --surface: var(--light-surface, #fff); --ink: var(--light-ink, #202c43); --muted: var(--light-muted, #657189); --line: var(--light-line, #dce3ef); --primary: var(--light-primary, #233b6e); --link: var(--primary); --danger: #a43829; min-height: 100dvh; display: grid; place-items: center; padding: 2rem 1rem; background: var(--canvas); color: var(--ink); }
.recovery-card { width: 100%; max-width: 30rem; padding: clamp(1.5rem, 5vw, 2.5rem); background: var(--surface); border: 1px solid var(--line); border-radius: 1.25rem; box-shadow: 0 1rem 3rem #202c430d; }
.brand-icon { display: inline-block; color: var(--link); font-size: 2rem; }
.eyebrow { color: var(--link); font-size: .8rem; font-weight: 800; }
h1 { font-size: clamp(1.5rem, 5vw, 1.85rem); margin: .75rem 0; }
p { line-height: 1.65; overflow-wrap: anywhere; }
.account, .hint { color: var(--muted); }
.account { font-size: .9rem; margin-bottom: 1.5rem; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
label { display: block; margin: 1.25rem 0 .5rem; font-size: .9rem; font-weight: 700; }
input:not([type='checkbox']) { width: 100%; min-height: 3rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--canvas); color: var(--ink); padding: .75rem; }
input:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid var(--primary); outline-offset: 3px; }
input[aria-invalid='true'] { border-color: var(--danger); }
.hint, .field-error { font-size: .8rem; margin: .5rem 0; }
.error-message, .field-error { color: var(--danger); }
.error-message, .success-message { border: 1px solid currentColor; border-radius: .6rem; padding: .9rem; font-size: .9rem; }
.success-message { color: #147047; }
.show-password { display: flex; align-items: center; gap: .6rem; font-weight: 500; min-height: 2.75rem; }
.show-password input { width: 1.1rem; height: 1.1rem; accent-color: var(--primary); }
.primary-button { display: block; width: 100%; margin-top: 1rem; padding: .9rem 1rem; border: 0; border-radius: .65rem; background: var(--primary); color: #fff; font-weight: 700; text-align: center; text-decoration: none; cursor: pointer; }
fieldset:disabled, button:disabled { opacity: .65; }
button:disabled { cursor: wait; }
.back-link { display: block; margin-top: 1.5rem; color: var(--link); font-size: .9rem; text-align: center; text-underline-offset: .2em; }
:global(html.theme-dark .reset-password-page) { --canvas: #121615; --surface: #1b2220; --ink: #e8eeeb; --muted: #a8b6af; --line: #36433d; --primary: #287d9e; --link: #8dcbe0; --danger: #ffb4a5; }
:global(html.theme-dark .reset-password-page .success-message) { color: #8de2b6; }
@media (max-width: 480px) { .reset-password-page { padding: 1rem; } }
</style>
