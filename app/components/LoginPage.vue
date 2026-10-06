<script setup lang="ts">
const supabase = useSupabaseClient();
const router = useRouter();

const props = withDefaults(defineProps<{ mode?: 'login' | 'register' }>(), { mode: 'login' });
const isRegister = computed(() => props.mode === 'register');
const username = ref("");
const usernameInput = ref<HTMLInputElement | null>(null);
const onboardingDraft = useState('onboarding-step-one', () => ({ nickname: '', goal: '' }));

const registrationError = (error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    user_already_exists: 'Email ini sudah terdaftar. Silakan masuk ke akun Anda.',
    email_exists: 'Email ini sudah terdaftar. Silakan masuk ke akun Anda.',
    weak_password: 'Kata sandi belum memenuhi ketentuan keamanan. Gunakan kata sandi yang lebih kuat.',
    email_address_invalid: 'Alamat email belum valid. Periksa kembali penulisannya.',
    email_address_not_authorized: 'Email ini belum diizinkan untuk pendaftaran. Gunakan alamat email lain.',
    over_email_send_rate_limit: 'Terlalu banyak email dikirim. Tunggu beberapa saat lalu coba lagi.',
    over_request_rate_limit: 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.',
    signup_disabled: 'Pendaftaran akun sedang tidak tersedia. Silakan coba lagi nanti.',
  };
  if (messages[code]) return messages[code];
  if (error instanceof Error && /fetch|network/i.test(error.message)) return 'Koneksi belum berhasil. Periksa internet Anda lalu coba lagi.';
  return 'Pendaftaran belum berhasil. Periksa isian Anda lalu coba lagi.';
};

const signUp = async () => {
  if (isSubmitting.value) return;
  errorMessage.value = '';
  noticeMessage.value = '';
  const nickname = username.value.trim();
  if (!nickname) {
    errorMessage.value = 'Isi nama panggilan santai Anda terlebih dahulu.';
    usernameInput.value?.focus();
    return;
  }
  if (nickname.length > 50 || !email.value.trim() || password.value.length < 8) {
    errorMessage.value = 'Isi nama maksimal 50 karakter, email yang valid, dan kata sandi minimal 8 karakter.';
    return;
  }
  isSubmitting.value = true;
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: password.value,
      options: {
        data: { username: nickname },
        emailRedirectTo: new URL('/onboarding', window.location.origin).href,
      },
    });
    if (error) throw error;
    if (!data.user && !data.session) throw new Error('Missing signup result');
    password.value = '';
    if (data.session) {
      onboardingDraft.value = { nickname, goal: '' };
      await router.push('/onboarding');
    } else {
      noticeMessage.value = 'Cek email Anda untuk melanjutkan pendaftaran. Ikuti tautan konfirmasi yang diterima. Jika sudah punya akun, silakan masuk.';
    }
  } catch (error) {
    errorMessage.value = registrationError(error);
  } finally {
    isSubmitting.value = false;
  }
};

const submitForm = () => isRegister.value ? signUp() : signIn();


const email = ref("");
const password = ref("");
const showPassword = ref(false);
const isSubmitting = ref(false);
const isSendingReset = ref(false);
const errorMessage = ref("");
const noticeMessage = ref("");

const submitLabel = computed(() =>
  isSubmitting.value ? "Memproses..." : isRegister.value ? "Daftar ke Dompet Santai" : "Masuk ke Dompet Santai",
);

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const signIn = async () => {
  errorMessage.value = "";
  noticeMessage.value = "";
  isSubmitting.value = true;

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });

    if (error) throw error;
    await router.push("/");
  } catch (error) {
    errorMessage.value = getErrorMessage(
      error,
      "Email atau kata sandi belum benar.",
    );
  } finally {
    isSubmitting.value = false;
  }
};

const sendPasswordReset = async () => {
  errorMessage.value = "";
  noticeMessage.value = "";

  if (!email.value.trim()) {
    errorMessage.value =
      "Masukkan email terlebih dahulu untuk mengatur ulang kata sandi.";
    return;
  }

  isSendingReset.value = true;

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.value.trim(),
      {
        redirectTo: `${window.location.origin}/atur-ulang-kata-sandi`,
      },
    );

    if (error) throw error;
    noticeMessage.value =
      "Tautan pengaturan ulang kata sandi sudah dikirim ke email Anda.";
  } catch (error) {
    errorMessage.value = getErrorMessage(
      error,
      "Tautan pengaturan ulang belum dapat dikirim.",
    );
  } finally {
    isSendingReset.value = false;
  }
};
</script>

<template>
  <main class="login-page">
    <section class="login-visual" aria-label="Tentang Dompet Santai">
      <div class="visual-orb visual-orb--large" />
      <div class="visual-orb visual-orb--small" />

      <div class="visual-content">
        <div class="brand-mark brand-mark--light" aria-hidden="true">
          <span class="material-symbols-outlined">account_balance_wallet</span>
        </div>
        <p class="eyebrow">Dompet Santai</p>
        <h1>Uang lebih teratur,<br /><em>hidup lebih tenang.</em></h1>
        <p class="visual-copy">
          Catat, pahami, dan nikmati perjalanan keuangan Anda dengan cara yang
          sederhana.
        </p>

      </div>

      <p class="visual-footer">
        Teman kecil untuk keputusan finansial yang lebih baik.
      </p>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <div class="login-heading">
          <p class="eyebrow">{{ isRegister ? "Mulai perjalanan santaimu" : "Selamat datang kembali" }}</p>
          <h2>{{ isRegister ? "Buat akun Anda" : "Masuk ke akun Anda" }}</h2>
          <p>{{ isRegister ? "Daftar dan mulai atur keuangan dengan lebih santai." : "Kelola keuangan dengan tenang, mulai dari sini." }}</p>
        </div>

        <form class="login-form" :aria-busy="isSubmitting" @submit.prevent="submitForm">

          <div v-if="isRegister" class="field-group">
            <label for="username">Username (nama panggilan santai)</label>
            <div class="input-wrap">
              <span class="material-symbols-outlined" aria-hidden="true">person</span>
              <input
                id="username"
                ref="usernameInput"
                v-model="username"
                name="username"
                autocomplete="nickname"
                placeholder="Contoh: Tia"
                maxlength="50"
                required
                type="text"
              />
            </div>
          </div>

          <div class="field-group">
            <label for="email">Alamat email</label>
            <div class="input-wrap">
              <span class="material-symbols-outlined" aria-hidden="true"
                >mail</span
              >
              <input
                id="email"
                name="email"
                v-model="email"
                autocomplete="email"
                inputmode="email"
                placeholder="nama@email.com"
                required
                type="email"
              />
            </div>
          </div>

          <div class="field-group">
            <div class="field-label-row">
              <label for="password">Kata sandi</label>
              <button
                v-if="!isRegister"
                class="forgot-link"
                type="button"
                :disabled="isSendingReset"
                @click="sendPasswordReset"
              >
                {{ isSendingReset ? "Mengirim..." : "Lupa kata sandi?" }}
              </button>
            </div>
            <div class="input-wrap">
              <span class="material-symbols-outlined" aria-hidden="true"
                >lock</span
              >
              <input
                id="password"
                name="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="isRegister ? 'new-password' : 'current-password'" :minlength="isRegister ? 8 : undefined" :aria-describedby="isRegister ? 'password-help' : undefined"
                :placeholder="isRegister ? 'Buat kata sandi' : 'Masukkan kata sandi'"
                required
              />
              <button
                class="visibility-button"
                type="button"
                :aria-label="
                  showPassword
                    ? 'Sembunyikan kata sandi'
                    : 'Tampilkan kata sandi'
                "
                @click="showPassword = !showPassword"
              >
                <span class="material-symbols-outlined" aria-hidden="true">{{
                  showPassword ? "visibility_off" : "visibility"
                }}</span>
              </button>
            </div>
          </div>

          <p v-if="isRegister" id="password-help" class="password-help">Gunakan minimal 8 karakter untuk kata sandi.</p>

          <p
            v-if="errorMessage"
            class="form-message form-message--error"
            role="alert"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >error</span
            >
            {{ errorMessage }}
          </p>
          <p
            v-if="noticeMessage"
            class="form-message form-message--success"
            role="status"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >check_circle</span
            >
            {{ noticeMessage }}
          </p>

          <button class="submit-button" type="submit" :disabled="isSubmitting">
            <span>{{ submitLabel }}</span>
            <span class="material-symbols-outlined" aria-hidden="true"
              >arrow_forward</span
            >
          </button>
        </form>

        <div v-if="!isRegister" class="divider"><span>atau</span></div>

        <button
          v-if="!isRegister"
          class="google-button"
          type="button"
          disabled
          title="Login Google segera hadir"
        >
          <span class="google-logo" aria-hidden="true">G</span>
          <span>Masuk dengan Google</span>
        </button>

        <p class="signup-copy">
          <template v-if="isRegister">Sudah punya akun? <NuxtLink to="/login">Masuk sekarang</NuxtLink></template>
          <template v-else>Belum punya akun? <NuxtLink to="/register">Daftar sekarang</NuxtLink></template>
        </p>
        <p v-if="!isRegister" class="login-legal">
          Dengan masuk, Anda menyetujui
          <a href="#syarat">Syarat & Ketentuan</a> dan
          <a href="#privasi">Kebijakan Privasi</a> kami.
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.password-help { margin: -.5rem 0 0; color: var(--muted); font-size: .7rem; line-height: 1.5; }
.visibility-button:focus-visible, .submit-button:focus-visible { outline: 2px solid var(--teal); outline-offset: 4px; }
.login-page {
  --teal: #006a61;
  --teal-dark: #005149;
  --teal-soft: #d8f3ec;
  --ink: #17201f;
  --muted: #65706d;
  display: grid;
  min-height: 100vh;
  color: var(--ink);
  background: #f7faf8;
  font-family: Manrope, Inter, ui-sans-serif, system-ui, sans-serif;
}
.login-visual {
  position: relative;
  display: flex;
  min-height: 34rem;
  overflow: hidden;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(2rem, 6vw, 5rem);
  color: #effbf7;
  background: var(--teal);
  isolation: isolate;
}
.login-visual::before {
  position: absolute;
  inset: 0;
  z-index: -2;
  background:
    radial-gradient(circle at 75% 20%, rgb(106 226 203 / 30%), transparent 30%),
    linear-gradient(145deg, #005149 0%, #006a61 56%, #007d70 100%);
  content: "";
}
.visual-orb {
  position: absolute;
  z-index: -1;
  border: 1px solid rgb(207 255 241 / 18%);
  border-radius: 50%;
  background: rgb(173 247 229 / 8%);
}
.visual-orb--large {
  top: 16%;
  right: -10rem;
  width: 28rem;
  height: 28rem;
}
.visual-orb--small {
  right: 28%;
  bottom: 12%;
  width: 8rem;
  height: 8rem;
  background: rgb(173 247 229 / 13%);
}
.visual-content {
  width: min(100%, 30rem);
  margin: auto 0;
}
.brand-mark {
  display: grid;
  width: 2.6rem;
  height: 2.6rem;
  place-items: center;
  border-radius: 0.75rem;
  color: var(--teal);
  background: var(--teal-soft);
  box-shadow: 0 0.5rem 1.3rem rgb(0 47 42 / 12%);
}
.brand-mark .material-symbols-outlined {
  font-size: 1.4rem;
  font-variation-settings: "FILL" 1;
}
.brand-mark--light {
  margin-bottom: 1.35rem;
  color: var(--teal-dark);
  background: #d5f6eb;
}
.eyebrow {
  margin: 0 0 0.7rem;
  color: var(--teal);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.login-visual .eyebrow {
  color: #a9f0df;
}
.visual-content h1 {
  margin: 0;
  color: #fff;
  font-size: clamp(2.2rem, 4vw, 3.8rem);
  font-weight: 800;
  letter-spacing: -0.07em;
  line-height: 1.05;
}
.visual-content h1 em {
  color: #a9f0df;
  font-style: normal;
}
.visual-copy {
  max-width: 26rem;
  margin: 1.25rem 0 0;
  color: rgb(239 251 247 / 78%);
  font-size: 0.9rem;
  line-height: 1.7;
}
.visual-footer {
  margin: 2rem 0 0;
  color: rgb(239 251 247 / 58%);
  font-size: 0.65rem;
}
.login-panel {
  display: grid;
  place-items: center;
  padding: 2rem 1.25rem;
  background: #f7faf8;
}
.login-card {
  width: min(100%, 27rem);
  padding: 1rem 0;
}
.mobile-brand {
  display: none;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 2.5rem;
  color: var(--teal-dark);
  font-size: 0.9rem;
  font-weight: 800;
}
.mobile-brand .brand-mark {
  width: 2.3rem;
  height: 2.3rem;
}
.login-heading {
  margin-bottom: 1.8rem;
}
.login-heading h2 {
  margin: 0;
  font-size: clamp(1.65rem, 3vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.055em;
}
.login-heading > p:last-child {
  margin: 0.55rem 0 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.6;
}
.login-form {
  display: grid;
  gap: 1.15rem;
}
.field-group {
  display: grid;
  gap: 0.5rem;
}
.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.field-group label {
  color: #34413e;
  font-size: 0.7rem;
  font-weight: 800;
}
.input-wrap {
  display: flex;
  min-height: 3.15rem;
  align-items: center;
  gap: 0.65rem;
  padding: 0 0.85rem;
  border: 1px solid #d8e2de;
  border-radius: 0.65rem;
  background: #fff;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}
.input-wrap:focus-within {
  border-color: var(--teal);
  box-shadow: 0 0 0 0.2rem rgb(0 106 97 / 11%);
}
.input-wrap > .material-symbols-outlined {
  color: #85928e;
  font-size: 1.1rem;
}
.input-wrap input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--ink);
  background: transparent;
  font-size: 0.76rem;
}
.input-wrap input::placeholder {
  color: #9ba7a3;
}
.visibility-button,
.forgot-link {
  padding: 0;
  border: 0;
  color: var(--teal);
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.visibility-button {
  display: grid;
  place-items: center;
  color: #85928e;
}
.visibility-button:hover,
.forgot-link:hover {
  color: var(--teal-dark);
}
.visibility-button .material-symbols-outlined {
  font-size: 1.1rem;
}
.forgot-link {
  font-size: 0.65rem;
  font-weight: 800;
}
.forgot-link:disabled {
  cursor: wait;
  opacity: 0.6;
}
.form-message {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: -0.15rem 0 0;
  padding: 0.7rem 0.8rem;
  border-radius: 0.55rem;
  font-size: 0.65rem;
  line-height: 1.5;
}
.form-message .material-symbols-outlined {
  flex: 0 0 auto;
  font-size: 1rem;
}
.form-message--error {
  color: #a23732;
  background: #fff0ee;
}
.form-message--success {
  color: #236844;
  background: #eaf8ef;
}
.submit-button,
.google-button {
  display: flex;
  min-height: 3.1rem;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  border-radius: 0.65rem;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}
.submit-button {
  border: 0;
  color: #fff;
  background: var(--teal);
  box-shadow: 0 0.55rem 1rem rgb(0 106 97 / 18%);
}
.submit-button:hover:not(:disabled) {
  background: var(--teal-dark);
  box-shadow: 0 0.7rem 1.25rem rgb(0 106 97 / 24%);
  transform: translateY(-1px);
}
.submit-button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.submit-button .material-symbols-outlined {
  font-size: 1rem;
}
.divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.5rem 0 1rem;
  color: #9ba7a3;
  font-size: 0.65rem;
}
.divider::before,
.divider::after {
  height: 1px;
  flex: 1;
  background: #dfe7e3;
  content: "";
}
.google-button {
  width: 100%;
  border: 1px solid #d8e2de;
  color: #52605c;
  background: #fff;
}
.google-button:hover:not(:disabled) {
  background: #f3f8f5;
}
.google-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.google-logo {
  display: grid;
  width: 1.15rem;
  height: 1.15rem;
  place-items: center;
  color: #4285f4;
  font-family: Arial, sans-serif;
  font-size: 0.9rem;
  font-weight: 700;
}
.signup-copy {
  margin: 1.6rem 0 0;
  color: var(--muted);
  font-size: 0.68rem;
  text-align: center;
}
.signup-copy a,
.login-legal a {
  color: var(--teal);
  font-weight: 800;
  text-decoration: none;
}
.signup-copy a:hover,
.login-legal a:hover {
  text-decoration: underline;
}
.login-legal {
  margin: 3rem auto 0;
  color: #8a9692;
  font-size: 0.58rem;
  line-height: 1.6;
  text-align: center;
}

@media (min-width: 52rem) {
  .login-page {
    grid-template-columns: minmax(22rem, 0.9fr) minmax(28rem, 1.1fr);
  }
  .login-visual {
    min-height: 100vh;
  }
  .login-panel {
    min-height: 100vh;
    padding: 3rem;
  }
}
@media (max-width: 51.99rem) {
  .login-visual {
    min-height: 19rem;
    padding: 2rem 1.5rem;
  }
  .visual-content {
    margin: 0;
  }
  .visual-content h1 {
    font-size: 2.1rem;
  }
  .visual-copy,
  .visual-footer {
    display: none;
  }
  .login-panel {
    padding: 2rem 1.5rem 2.5rem;
  }
  .mobile-brand {
    display: flex;
  }
  .login-card {
    padding: 0;
  }
}
@media (max-width: 25rem) {
  .login-visual {
    min-height: 17rem;
  }
  .login-panel {
    padding-inline: 1rem;
  }
  .login-heading {
    margin-bottom: 1.4rem;
  }
}
</style>
