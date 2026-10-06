<script setup lang="ts">
const route = useRoute()
const activeStep = computed(() => route.query.step === '3' ? 3 : route.query.step === '2' ? 2 : 1)
const backTarget = computed(() => activeStep.value === 3 ? '/onboarding?step=2' : activeStep.value === 2 ? '/onboarding' : '/login')
const backLabel = computed(() => activeStep.value > 1 ? 'Kembali ke langkah ' + (activeStep.value - 1) : 'Kembali ke halaman masuk')
useHead(() => ({ title: activeStep.value === 3 ? 'Dompet Santai - Onboarding Selesai' : 'Dompet Santai - Onboarding' }))
const draft = useState('onboarding-step-one', () => ({ nickname: '', goal: '' }))
const finances = useState('onboarding-step-two', () => ({ payday: '25', balance: '', accounts: ['cash', 'bank', 'ewallet'] }))
const attempted = ref(false)
const heading = ref<HTMLHeadingElement | null>(null)
const nicknameInput = ref<HTMLInputElement | null>(null)
const balanceInput = ref<HTMLInputElement | null>(null)
const goalInputs = ref<HTMLInputElement[]>([])
const accountInputs = ref<HTMLInputElement[]>([])
const goals = [
  { value: 'expenses', label: 'Mencatat Pengeluaran', icon: 'edit_note' },
  { value: 'budget', label: 'Mengatur Anggaran', icon: 'account_balance_wallet' },
  { value: 'savings', label: 'Menabung untuk Masa Depan', icon: 'savings' },
  { value: 'all', label: 'Semua di atas', icon: 'done_all' },
]
const accountTypes = [
  { value: 'cash', label: 'Tunai', icon: 'payments' },
  { value: 'bank', label: 'Bank', icon: 'account_balance' },
  { value: 'ewallet', label: 'E-Wallet', icon: 'phone_iphone' },
  { value: 'savings', label: 'Tabungan', icon: 'savings' },
]
const nameError = computed(() => attempted.value && !draft.value.nickname.trim())
const goalError = computed(() => attempted.value && !draft.value.goal)
const balanceValue = computed(() => {
  const text = finances.value.balance.trim()
  if (!text) return 0
  if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(text)) return null
  const value = Number(text.replaceAll('.', ''))
  return Number.isSafeInteger(value) && value <= 999_999_999_999_999 ? value : null
})
const balanceError = computed(() => attempted.value && balanceValue.value === null)
const accountsError = computed(() => attempted.value && finances.value.accounts.length === 0)
function formatBalance() {
  if (balanceValue.value !== null) finances.value.balance = new Intl.NumberFormat('id-ID').format(balanceValue.value)
}
watch(activeStep, async () => {
  attempted.value = false
  await nextTick()
  heading.value?.focus({ preventScroll: true })
})
async function continueOnboarding() {
  attempted.value = true
  if (activeStep.value === 1) {
    if (nameError.value) { nicknameInput.value?.focus(); return }
    if (goalError.value) { goalInputs.value[0]?.focus(); return }
    draft.value.nickname = draft.value.nickname.trim()
    await navigateTo({ path: '/onboarding', query: { step: '2' } })
    return
  }
  if (balanceError.value) { balanceInput.value?.focus(); return }
  if (accountsError.value) { accountInputs.value[0]?.focus(); return }
  formatBalance()
  await navigateTo({ path: '/onboarding', query: { step: '3' } })
}
</script>

<template>
  <div class="onboarding-backdrop" :class="{ 'onboarding-step-two': activeStep === 2, 'onboarding-step-three': activeStep === 3 }">
    <div class="onboarding-page">
      <div class="onboarding-progress">
        <div class="step-navigation">
          <NuxtLink class="back-button" :to="backTarget" :aria-label="backLabel">
            <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          </NuxtLink>
          <span>Langkah {{ activeStep }} dari 3</span>
          <ThemeToggle />
        </div>
        <div class="progress-track" role="progressbar" aria-label="Progres onboarding" :aria-valuenow="activeStep" :aria-valuemin="0" :aria-valuemax="3" :aria-valuetext="'Langkah ' + activeStep + ' dari 3'">
          <div class="progress-fill" :style="{ width: (activeStep / 3 * 100) + '%' }" />
        </div>
      </div>
      <header v-if="activeStep < 3" class="onboarding-header">
        <div v-if="activeStep === 1" class="welcome-illustration" aria-hidden="true">
          <span class="material-symbols-outlined">person_celebrate</span>
        </div>
        <h1 ref="heading" tabindex="-1">{{ activeStep === 1 ? 'Halo! Mari kenalan dengan kebiasaanmu.' : 'Yuk, rapikan uang kamu pelan-pelan.' }}</h1>
        <p class="intro-copy">{{ activeStep === 1 ? 'Bantu kami menyesuaikan pengalamanmu agar pengelolaan uang jadi lebih santai.' : 'Ceritakan sedikit soal keuanganmu sekarang. Santai aja, bisa diubah nanti kok.' }}</p>
      </header>

      <form v-if="activeStep < 3" class="onboarding-form" novalidate @submit.prevent="continueOnboarding">
        <template v-if="activeStep === 1">
        <section class="question-card" aria-labelledby="nickname-heading">
          <div class="question-heading">
            <span class="question-icon material-symbols-outlined" aria-hidden="true">badge</span>
            <div>
              <h2 id="nickname-heading"><label for="onboarding-nickname">Siapa nama panggilanmu?</label></h2>
              <p id="nickname-help">Biar kami bisa menyapamu dengan akrab.</p>
            </div>
          </div>
          <input
            id="onboarding-nickname"
            ref="nicknameInput"
            v-model="draft.nickname"
            class="nickname-input"
            name="nickname"
            type="text"
            autocomplete="nickname"
            maxlength="50"
            placeholder="Contoh: Budi"
            required
            :aria-invalid="nameError"
            :aria-describedby="nameError ? 'nickname-help nickname-error' : 'nickname-help'"
          />
          <p v-if="nameError" id="nickname-error" class="field-error" role="alert">Isi nama panggilanmu terlebih dahulu.</p>
        </section>

        <section class="question-card" aria-labelledby="goal-heading">
          <div class="question-heading">
            <span class="question-icon material-symbols-outlined" aria-hidden="true">target</span>
            <div>
              <h2 id="goal-heading">Apa tujuan utamamu?</h2>
              <p id="goal-help">Pilih alasan kamu menggunakan Dompet Santai.</p>
            </div>
          </div>
          <div class="goal-options" role="radiogroup" aria-labelledby="goal-heading" :aria-describedby="goalError ? 'goal-help goal-error' : 'goal-help'" :aria-invalid="goalError" aria-required="true">
            <label v-for="goal in goals" :key="goal.value" class="goal-option">
              <input ref="goalInputs" v-model="draft.goal" class="goal-radio" type="radio" name="goal" :value="goal.value" required />
              <span class="goal-content">
                <span class="material-symbols-outlined" aria-hidden="true">{{ goal.icon }}</span>
                <span>{{ goal.label }}</span>
              </span>
            </label>
          </div>
          <p v-if="goalError" id="goal-error" class="field-error" role="alert">Pilih salah satu tujuanmu.</p>
        </section>

                </template>
        <template v-else>
          <section class="question-card payday-card" aria-labelledby="payday-heading">
            <div class="question-heading">
              <span class="question-icon material-symbols-outlined" aria-hidden="true">event</span>
              <div>
                <h2 id="payday-heading"><label for="onboarding-payday">Kapan biasanya gajian?</label></h2>
                <p id="payday-help">Biar kita bisa reset budget bulananmu di tanggal ini.</p>
              </div>
            </div>
            <div class="payday-select-wrap">
              <select id="onboarding-payday" v-model="finances.payday" class="payday-select" name="payday" aria-describedby="payday-help">
                <option v-for="day in 31" :key="day" :value="String(day)">Tanggal {{ day }}</option>
                <option value="last">Akhir Bulan</option>
              </select>
              <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
            </div>
          </section>
          <section class="question-card balance-card" aria-labelledby="balance-heading">
            <div class="question-heading">
              <span class="question-icon material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
              <div>
                <h2 id="balance-heading"><label for="onboarding-balance">Berapa total uangmu sekarang?</label></h2>
                <p id="balance-help">Gabungan dari semua tempat kamu simpan uang saat ini.</p>
              </div>
            </div>
            <div class="balance-field" :class="{ 'balance-field--invalid': balanceError }">
              <span id="balance-currency">Rp</span>
              <input id="onboarding-balance" ref="balanceInput" v-model="finances.balance" name="balance" title="Masukkan rupiah bulat mulai dari 0, maksimal 15 digit." type="text" inputmode="numeric" maxlength="25" placeholder="0" autocomplete="off" :aria-invalid="balanceError" :aria-describedby="balanceError ? 'balance-currency balance-help balance-error' : 'balance-currency balance-help'" @blur="formatBalance" />
            </div>
            <p v-if="balanceError" id="balance-error" class="field-error" role="alert">Nominal tidak valid.</p>
          </section>
          <section class="question-card accounts-card" aria-labelledby="accounts-heading">
            <div class="question-heading">
              <span class="question-icon material-symbols-outlined" aria-hidden="true">category</span>
              <div>
                <h2 id="accounts-heading">Uangnya disimpan di mana aja?</h2>
                <p id="accounts-help">Pilih yang biasa kamu pakai, nanti kita bagi saldonya.</p>
              </div>
            </div>
            <div class="account-options" role="group" aria-labelledby="accounts-heading" :aria-describedby="accountsError ? 'accounts-help accounts-error' : 'accounts-help'">
              <label v-for="account in accountTypes" :key="account.value" class="goal-option">
                <input ref="accountInputs" v-model="finances.accounts" class="goal-radio" type="checkbox" name="accounts" :value="account.value" :aria-invalid="accountsError" />
                <span class="goal-content account-content">
                  <span class="material-symbols-outlined" aria-hidden="true">{{ account.icon }}</span>
                  <span>{{ account.label }}</span>
                </span>
              </label>
            </div>
            <p v-if="accountsError" id="accounts-error" class="field-error" role="alert">Pilih minimal satu tempat penyimpanan uang.</p>
          </section>
        </template>


        <footer class="onboarding-footer">
          <button class="continue-button" type="submit">
            <span>Lanjut</span>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>
        </footer>
      </form>
      <section v-else class="completion-content" aria-labelledby="completion-heading">
        <div class="completion-message">
          <img
            class="completion-illustration"
            src="/onboarding-complete.jpg"
            alt="Seseorang bersantai sambil memegang ponsel dengan tanda centang hijau."
            width="512"
            height="279"
            fetchpriority="high"
          />
          <h1 id="completion-heading" ref="heading" tabindex="-1">Semua Siap! Mari Mulai Hidup Santai.</h1>
          <p class="completion-copy">
            Terima kasih<span v-if="draft.nickname.trim()">, {{ draft.nickname.trim() }}</span>.
            Dompet Santai siap membantumu mengatur pengeluaran harian.
            Siap untuk mencatat transaksi pertamamu?
          </p>
        </div>
        <footer class="completion-footer">
          <NuxtLink class="continue-button completion-button" to="/">
            <span>Mulai Sekarang</span>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </NuxtLink>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.onboarding-backdrop {
  --primary: #00685f;
  --primary-hover: #00574f;
  --on-primary: #fff;
  --ink: #191c1d;
  --muted: #3d4947;
  --canvas: #f8f9fa;
  --surface: #fff;
  --card: #f8f9fa;
  --line: #e7e8e9;
  --line-hover: #bcc9c6;
  --track: #edeeef;
  --accent-soft: #e5f3f1;
  --selected: #ecf5f3;
  --placeholder: #727d7a;
  --error: #ba1a1a;
  --shadow: 0 12px 48px rgb(25 28 29 / 6%);
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--canvas);
  color: var(--ink);
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
html.theme-dark .onboarding-backdrop {
  --primary: #74d9cb;
  --primary-hover: #a2f1e4;
  --on-primary: #00201d;
  --ink: #e1e4e1;
  --muted: #c0c8c4;
  --canvas: #121615;
  --surface: #1c2120;
  --card: #242b28;
  --line: #424a47;
  --line-hover: #687770;
  --track: #343d38;
  --accent-soft: #1e4d47;
  --selected: #233e37;
  --placeholder: #a0ada6;
  --error: #ffb4ab;
  --shadow: 0 12px 48px rgb(0 0 0 / 20%);
  color-scheme: dark;
}
.onboarding-page {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  margin-inline: auto;
  background: var(--surface);
}
.onboarding-progress { padding: 24px 20px 0; }
.step-navigation { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 24px; color: var(--muted); font-size: 14px; font-weight: 500; line-height: 20px; }
.back-button { display: grid; flex-shrink: 0; width: 40px; height: 40px; place-items: center; border-radius: 50%; color: inherit; text-decoration: none; transition: background .2s; }
.back-button:hover { background: var(--card); }
.back-button:focus-visible, .continue-button:focus-visible { outline: 3px solid var(--primary); outline-offset: 4px; }
.progress-track { height: 8px; overflow: hidden; border-radius: 999px; background: var(--track); }
.progress-fill { width: 33.3333%; height: 100%; border-radius: inherit; background: var(--primary); }
.onboarding-header { min-width: 0; margin-top: 12px; padding: 24px 20px 16px; }
.welcome-illustration { display: grid; aspect-ratio: 16 / 9; margin-bottom: 24px; place-items: center; border-radius: 12px; background: var(--accent-soft); color: var(--primary); }
.welcome-illustration .material-symbols-outlined { font-size: 48px; }
h1 { margin: 0 0 8px; font-size: 24px; font-weight: 600; line-height: 1.34; overflow-wrap: break-word; }
.intro-copy { margin: 0; color: var(--muted); font-size: 16px; line-height: 24px; }
.onboarding-form { display: flex; min-width: 0; flex-direction: column; gap: 24px; padding: 16px 20px calc(132px + env(safe-area-inset-bottom, 0px)); }
.question-card { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
.question-heading { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.question-heading > div { min-width: 0; }
.question-icon { display: grid; flex: 0 0 32px; width: 32px; height: 32px; place-items: center; border-radius: 50%; background: var(--accent-soft); color: var(--primary); font-size: 20px; }
h2 { margin: 0 0 4px; font-size: 20px; font-weight: 600; line-height: 28px; overflow-wrap: break-word; }
.question-heading p { margin: 0; color: var(--muted); font-size: 12px; line-height: 18px; }
.nickname-input { display: block; width: 100%; padding: 12px 0; border: 0; border-bottom: 2px solid var(--line); border-radius: 0; outline: none; background: transparent; color: var(--ink); font-size: 18px; line-height: 28px; transition: border-color .2s; }
.nickname-input::placeholder { color: var(--placeholder); opacity: 1; }
.nickname-input:focus { border-bottom-color: var(--primary); }
.nickname-input[aria-invalid='true'] { border-bottom-color: var(--error); }
.goal-options { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.goal-option { position: relative; min-width: 0; cursor: pointer; }
.goal-radio { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.goal-content { display: flex; align-items: center; gap: 12px; height: 100%; min-height: 60px; padding: 16px; border: 2px solid var(--line); border-radius: 8px; font-size: 14px; font-weight: 500; line-height: 20px; overflow-wrap: break-word; transition: border-color .2s, background .2s; }
.goal-content .material-symbols-outlined { flex-shrink: 0; color: var(--muted); font-size: 24px; }
.goal-option:hover .goal-content { border-color: var(--line-hover); }
.goal-radio:checked + .goal-content { border-color: var(--primary); background: var(--selected); }
.goal-radio:checked + .goal-content .material-symbols-outlined { color: var(--primary); }
.goal-radio:focus-visible + .goal-content { outline: 2px solid var(--primary); outline-offset: 3px; }
.field-error { margin: 12px 0 0; color: var(--error); font-size: 13px; line-height: 20px; }
.next-step-notice { margin: 0; padding: 16px; border: 1px solid var(--line-hover); border-radius: 12px; background: var(--selected); color: var(--muted); font-size: 14px; line-height: 22px; }
.onboarding-footer { position: fixed; z-index: 10; right: 0; bottom: 0; left: 0; width: 100%; padding: 16px 20px calc(24px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--line); background: var(--surface); }
.continue-button { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; min-height: 56px; padding: 12px 20px; border: 0; border-radius: 999px; background: var(--primary); color: var(--on-primary); box-shadow: 0 4px 12px rgb(0 104 95 / 15%); font-size: 14px; font-weight: 600; line-height: 20px; cursor: pointer; transition: transform .15s, background .15s; }
.continue-button:hover { background: var(--primary-hover); }
.continue-button:active { transform: scale(.98); }
.nickname-input, .goal-radio { scroll-margin-block: 24px 132px; }


/* Fit the layout to the available viewport height, including mobile browser chrome. */
.onboarding-backdrop {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  padding: 0;
}
.onboarding-page {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}
.onboarding-progress { padding: 12px 20px 0; }
.step-navigation { margin-bottom: 8px; }
.progress-track { height: 6px; }
.onboarding-header { padding: 12px 20px 8px; }
.welcome-illustration { height: clamp(48px, 12dvh, 128px); aspect-ratio: auto; margin-bottom: 12px; }
h1 { font-size: clamp(20px, 2.8dvh, 24px); line-height: 1.25; margin-bottom: 6px; }
.intro-copy { font-size: 14px; line-height: 20px; }
.onboarding-form { min-height: 0; gap: 12px; padding: 8px 20px max(16px, env(safe-area-inset-bottom, 0px)); }
.question-card { flex-shrink: 0; padding: 12px; }
.question-heading { gap: 8px; margin-bottom: 8px; }
h2 { font-size: 16px; line-height: 22px; }
.question-heading p { font-size: 12px; line-height: 16px; }
.nickname-input { padding: 6px 0; font-size: 16px; line-height: 24px; }
.goal-options { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.goal-content { gap: 8px; min-height: 64px; padding: 10px; font-size: 13px; line-height: 18px; }
.goal-content .material-symbols-outlined { font-size: 20px; }
.field-error { margin-top: 6px; font-size: 12px; line-height: 16px; }
.next-step-notice { padding: 10px; font-size: 12px; line-height: 16px; }
.onboarding-footer { position: static; margin-top: auto; padding: 0; border: 0; background: transparent; }
.continue-button { min-height: 44px; padding: 10px 16px; }
.nickname-input, .goal-radio { scroll-margin: 0; }

@media (min-width: 600px) {
  .onboarding-backdrop { padding: clamp(12px, 2dvh, 24px) 24px; }
  .onboarding-page { max-width: 760px; border: 1px solid var(--line); border-radius: 24px; box-shadow: var(--shadow); }
  .onboarding-progress { padding: 16px 28px 0; }
  .onboarding-header { padding: 16px 28px 8px; }
  .welcome-illustration { height: clamp(56px, 15dvh, 160px); }
  .welcome-illustration .material-symbols-outlined { font-size: 56px; }
  h1 { font-size: 28px; }
  .onboarding-form { padding: 8px 28px 24px; gap: 16px; }
  .question-card { padding: 16px; }
  h2 { font-size: 18px; line-height: 24px; }
  .goal-content { min-height: 72px; font-size: 14px; line-height: 20px; }
  .continue-button { min-height: 48px; }
}
@media (min-width: 1024px) {
  .onboarding-backdrop { padding: clamp(16px, 3dvh, 40px) 40px; }
  .onboarding-page { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); grid-template-rows: auto minmax(0, 1fr); max-width: 1160px; }
  .onboarding-progress { grid-column: 1 / -1; padding: clamp(12px, 2dvh, 24px) 32px 0; }
  .onboarding-header { display: flex; flex-direction: column; justify-content: center; min-height: 0; margin: 12px 0 24px; padding: 0 32px; border-right: 1px solid var(--line); }
  .welcome-illustration { flex: 0 1 300px; min-height: 64px; max-height: 34dvh; margin-bottom: 24px; border-radius: 20px; }
  .welcome-illustration .material-symbols-outlined { font-size: 72px; }
  h1 { font-size: clamp(26px, 3.5dvh, 36px); line-height: 1.25; letter-spacing: -.02em; margin-bottom: 12px; }
  .intro-copy { font-size: 16px; line-height: 26px; }
  .onboarding-form { justify-content: center; gap: clamp(12px, 2dvh, 24px); padding: 24px 32px; }
  .question-card { padding: clamp(12px, 2dvh, 20px); }
  .question-heading { margin-bottom: 12px; }
  h2 { font-size: 20px; line-height: 26px; }
  .nickname-input { padding: 10px 0; }
  .goal-content { flex-direction: column; align-items: flex-start; justify-content: center; min-height: clamp(76px, 12dvh, 112px); padding: 12px; }
  .onboarding-footer { margin-top: 0; }
  .continue-button { min-height: 48px; }
  html.theme-dark .onboarding-backdrop {
    --ink: #e1e3e4;
    --muted: #cac4d0;
    --line: #333;
    --canvas: #121212;
    --surface: #1e1e1e;
    --card: #252525;
  }
}
@media (max-height: 740px) and (max-width: 1023px) {
  .welcome-illustration { display: none; }
  .onboarding-header { padding-top: 10px; }
  .onboarding-form { gap: 8px; }
  .question-card { padding: 10px; }
  .goal-content { min-height: 60px; padding: 8px; }
}
@media (min-width: 600px) and (max-width: 1023px) and (max-height: 900px) {
  .welcome-illustration { display: none; }
  .onboarding-header { padding-top: 10px; }
  h1 { font-size: 24px; }
  .onboarding-form { gap: 10px; }
  .question-card { padding: 12px; }
  .goal-content { min-height: 60px; padding: 8px; }
}
@media (max-height: 650px) {
  .onboarding-backdrop { padding-block: 0; }
  .onboarding-progress { padding-top: 4px; }
  .onboarding-header { padding-top: 8px; padding-bottom: 4px; }
  .onboarding-form { gap: 8px; padding-top: 4px; padding-bottom: max(8px, env(safe-area-inset-bottom, 0px)); }
  .question-heading p, .intro-copy { display: none; }
  .question-heading { margin-bottom: 6px; }
  .question-icon { width: 24px; height: 24px; flex-basis: 24px; font-size: 18px; }
  h1 { font-size: 20px; line-height: 24px; }
  h2 { font-size: 16px; line-height: 22px; }
  .question-card { padding: 10px; }
  .nickname-input { padding: 4px 0; }
  .goal-content { min-height: 56px; flex-direction: row; align-items: center; justify-content: flex-start; padding: 6px 8px; }
}
@media (max-height: 500px) and (min-width: 500px) {
  .onboarding-backdrop { padding: 0 12px; }
  .onboarding-page { max-width: 1160px; grid-template-rows: auto minmax(0, 1fr); }
  .onboarding-progress { grid-column: 1 / -1; padding: 4px 16px 0; }
  .step-navigation { margin-bottom: 4px; }
  .onboarding-header { display: none; }
  .onboarding-form { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); grid-template-rows: minmax(0, 1fr) auto; align-items: start; gap: 8px 12px; padding: 8px 16px; }
  .question-card { height: 100%; }
  .goal-content { min-height: 44px; font-size: 12px; line-height: 16px; }
  .goal-content .material-symbols-outlined { display: none; }
  .next-step-notice { grid-column: 1; grid-row: 2; align-self: center; margin: 0; padding: 4px 8px; font-size: 11px; line-height: 14px; }
  .onboarding-footer { grid-column: 2; grid-row: 2; align-self: end; }
  .field-error { margin-top: 2px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; }
}

/* Step 2 uses the same viewport layout and theme tokens. */
.payday-select-wrap { position: relative; }
.payday-select { width: 100%; min-height: 40px; padding: 6px 36px 6px 8px; appearance: none; border: 0; border-bottom: 2px solid var(--line); border-radius: 0; background: transparent; color: var(--ink); font-size: 16px; line-height: 24px; }
.payday-select option { background: var(--surface); color: var(--ink); }
.payday-select-wrap > .material-symbols-outlined { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--muted); }
.payday-select:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-bottom-color: var(--primary); }
.balance-field { display: flex; align-items: center; gap: 12px; padding-bottom: 6px; border-bottom: 2px solid var(--line); }
.balance-field:focus-within { border-bottom-color: var(--primary); }
.balance-field--invalid { border-bottom-color: var(--error); }
.balance-field > span { color: var(--muted); font-size: 24px; font-weight: 600; }
.balance-field input { width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; background: transparent; color: var(--ink); text-align: right; font-size: clamp(24px, 4dvh, 36px); line-height: 1.25; font-weight: 700; letter-spacing: -.02em; }
.balance-field input::placeholder { color: var(--placeholder); }
.account-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.account-content { flex-direction: row; align-items: center; justify-content: flex-start; min-height: 48px; }
.onboarding-step-two .onboarding-form { gap: 12px; }
@media (min-width: 1024px) {
  .onboarding-step-two .onboarding-header { justify-content: center; }
  .onboarding-step-two .account-content { min-height: clamp(48px, 8dvh, 64px); }
  .onboarding-step-two .question-heading { margin-bottom: 8px; }
}
@media (max-height: 740px) {
  .onboarding-step-two .onboarding-form { gap: 8px; }
  .onboarding-step-two .question-card { padding: 10px; }
  .onboarding-step-two .question-heading { margin-bottom: 6px; }
  .onboarding-step-two .account-content { min-height: 44px; padding: 6px 8px; }
}
@media (max-height: 780px) {
  .onboarding-step-two .intro-copy, .onboarding-step-two .question-heading p { display: none; }
  .onboarding-step-two .onboarding-header { padding-block: 6px 2px; }
  .onboarding-step-two h1 { font-size: 18px; line-height: 22px; }
  .onboarding-step-two h2 { font-size: 14px; line-height: 18px; }
  .onboarding-step-two .question-card { padding: 8px; }
  .onboarding-step-two .question-heading { margin-bottom: 4px; }
  .onboarding-step-two .payday-select { min-height: 32px; padding-block: 2px; }
  .onboarding-step-two .balance-field { padding-bottom: 2px; }
  .onboarding-step-two .balance-field input { font-size: 24px; }
  .onboarding-step-two .balance-field > span { font-size: 20px; }
}
@media (max-height: 500px) and (min-width: 500px) {
  .onboarding-step-two .onboarding-form { grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 6px 12px; }
  .onboarding-step-two .payday-card { grid-column: 1; grid-row: 1; }
  .onboarding-step-two .balance-card { grid-column: 1; grid-row: 2; }
  .onboarding-step-two .accounts-card { grid-column: 2; grid-row: 1 / 3; }
  .onboarding-step-two .onboarding-footer { grid-column: 2; grid-row: 3; }
  .onboarding-step-two .next-step-notice { grid-column: 1; grid-row: 3; }
  .onboarding-step-two .question-icon { display: none; }
  .onboarding-step-two .question-card { padding: 6px 8px; }
  .onboarding-step-two .question-heading { margin-bottom: 2px; }
  .onboarding-step-two h2 { font-size: 13px; line-height: 16px; }
  .onboarding-step-two .payday-select { min-height: 28px; font-size: 14px; line-height: 20px; }
  .onboarding-step-two .balance-field input { font-size: 20px; }
}

@media (min-width: 1024px) and (min-height: 651px) and (max-height: 780px) {
  .onboarding-step-two h1 { font-size: 32px; line-height: 1.25; }
  .onboarding-step-two .intro-copy { display: block; }
  .onboarding-step-two h2 { font-size: 18px; line-height: 24px; }
}

/* The final screen has a centered illustration and a persistent footer row. */
.onboarding-step-three .onboarding-page {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  max-width: 640px;
}
.onboarding-step-three .onboarding-progress { grid-column: 1; }
.completion-content {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  padding: 16px 20px max(16px, env(safe-area-inset-bottom, 0px));
  text-align: center;
}
.completion-message {
  display: flex;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(12px, 2dvh, 24px);
  padding-bottom: 20px;
  animation: completion-appear .4s ease-out;
}
.completion-illustration {
  display: block;
  width: min(100%, 360px);
  height: auto;
  max-height: 32dvh;
  flex: 0 1 auto;
  min-height: 0;
  object-fit: contain;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 6%);
}
.completion-message h1 {
  max-width: 460px;
  margin: 0;
  font-size: clamp(24px, 3.5dvh, 32px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -.02em;
}
.completion-copy {
  max-width: 440px;
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 24px;
  overflow-wrap: anywhere;
}
.completion-footer { width: 100%; }
.completion-button { min-height: 52px; border-radius: 12px; text-decoration: none; }
@keyframes completion-appear {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (min-width: 600px) {
  .completion-content { padding: 24px 32px; }
  .completion-message { gap: 24px; }
}
@media (max-height: 650px) {
  .completion-content { padding-top: 8px; padding-bottom: max(8px, env(safe-area-inset-bottom, 0px)); }
  .completion-message { gap: 12px; padding-bottom: 12px; }
  .completion-message h1 { font-size: 22px; line-height: 28px; }
  .completion-copy { font-size: 14px; line-height: 20px; }
  .completion-illustration { max-height: 25dvh; width: min(100%, 280px); }
  .completion-button { min-height: 44px; }
}
@media (max-height: 500px) and (min-width: 500px) {
  .onboarding-step-three .onboarding-page { max-width: 880px; }
  .completion-content { padding: 8px 16px; gap: 8px; }
  .completion-message { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); grid-template-rows: auto auto; align-content: center; gap: 8px 16px; padding-bottom: 0; text-align: left; }
  .completion-illustration { grid-column: 1; grid-row: 1 / 3; width: 100%; max-height: 40dvh; }
  .completion-message h1 { grid-column: 2; font-size: 20px; line-height: 24px; }
  .completion-copy { grid-column: 2; font-size: 13px; line-height: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .completion-message { animation: none; }
}

</style>
