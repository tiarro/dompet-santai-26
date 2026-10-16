<script setup lang="ts">
import type { CategoryCatalog } from '~/utils/categories'
import { formatRupiah } from '~/utils/currency'
import { maxNoteAmount, noteAccounts } from '~/utils/notes'
import { goalBalance, savingsIcons, summarizeSavings, type SavingsGoal, type GoalDraft } from '~/utils/savings'
const props = defineProps<{ getCategories: () => CategoryCatalog; today: string }>()
const { data, ready, error, balances, save, transfer, status } = useSavings(props.getCategories)
const summary = computed(() => summarizeSavings(data.value, props.today))
const filter = ref('active')
const selected = ref('')
const detail = computed(() => summary.value.goals.find(goal => goal.id === selected.value))
const visible = computed(() => summary.value.goals.filter(goal => filter.value === 'archived' ? goal.archived : !goal.archived && (filter.value === 'completed' ? goal.complete : true)))
const { data: settings } = useSettings()
const reminders = computed(() => settings.value.reminders.savings ? summary.value.goals.filter(goal => goal.reminderDue) : [])
const historyGoal = ref('')
const route = useRoute()
const router = useRouter()
onMounted(() => watch([() => route.query.goal, ready], async () => {
  const id = route.query.goal
  if (typeof id !== 'string' || !ready.value) return
  if (summary.value.goals.some(goal => goal.id === id)) { selected.value = id; historyGoal.value = id }
  const query = { ...route.query }; delete query.goal
  await router.replace({ query })
  await nextTick()
  document.getElementById('notification-goal-detail')?.focus()
}, { immediate: true, flush: 'post' }))
const visibleCount = ref(50)
const history = computed(() => [...data.value.movements].reverse().filter(item => !historyGoal.value || item.goalId === historyGoal.value))
watch(historyGoal, () => { visibleCount.value = 50 })
watch(detail, goal => { if (!goal) selected.value = '' })
const wallets = computed(() => noteAccounts.filter(item => ['cash', 'bank', 'ewallet'].includes(item.id) && settings.value.activeAccounts.includes(item.id)))
const editor = ref<HTMLDialogElement | null>(null)
const kind = ref<'goal' | 'deposit' | 'withdraw' | 'archive' | 'restore' | 'delete'>('goal')
const original = ref<SavingsGoal>()
const name = ref('')
const target = ref('')
const icon = ref('savings')
const deadline = ref('')
const reminderDay = ref(0)
const amount = ref('')
const account = ref('cash')
const description = ref('')
const saving = ref(false)
const formError = ref('')
const notice = ref('')
const discard = ref(false)
const withdrawalConfirmed = ref(false)
let initial = ''
let oldOverflow = ''
let opener: HTMLElement | null = null
const snapshot = () => JSON.stringify([name.value, target.value, icon.value, deadline.value, reminderDay.value, amount.value, account.value, description.value])
const title = computed(() => kind.value === 'goal' ? original.value ? 'Ubah Target' : 'Buat Target' : ({ deposit: 'Tambah Tabungan', withdraw: 'Tarik Dana', archive: 'Arsipkan Target', restore: 'Aktifkan Target', delete: 'Hapus Target' })[kind.value])
const parseMoney = (value: string) => /^\d[\d.]*$/.test(value) ? Number(value.replaceAll('.', '')) : NaN
const amountNumber = computed(() => parseMoney(amount.value))
const validAmount = computed(() => Number.isSafeInteger(amountNumber.value) && amountNumber.value > 0 && amountNumber.value <= maxNoteAmount)
const available = computed(() => kind.value === 'withdraw' ? goalBalance(data.value, original.value?.id ?? '') : balances.value[account.value] ?? 0)
const moneyError = computed(() => validAmount.value && amountNumber.value > available.value ? kind.value === 'withdraw' ? 'Dana target tidak cukup untuk penarikan ini.' : 'Saldo dompet sumber tidak cukup.' : '')
const deleteBlocked = computed(() => kind.value === 'delete' && original.value && goalBalance(data.value, original.value.id) > 0)
watch([amount, account, description], () => { withdrawalConfirmed.value = false })
function dateLabel(date: string) { return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date + 'T12:00:00')) }
function close() {
  if (!editor.value?.open) return
  editor.value.close(); document.body.style.overflow = oldOverflow
  opener?.focus({ preventScroll: true })
}
function requestClose() {
  if (saving.value) return
  if (snapshot() !== initial) discard.value = true
  else close()
}
async function open(next: typeof kind.value, goal?: SavingsGoal) {
  kind.value = next; original.value = goal ? { ...goal } : undefined
  name.value = goal?.name ?? ''; target.value = goal ? String(goal.target) : ''; icon.value = goal?.icon ?? 'savings'
  deadline.value = goal?.deadline ?? ''; reminderDay.value = goal?.reminderDay ?? 0
  amount.value = ''; account.value = 'cash'; description.value = ''
  formError.value = ''; discard.value = false; withdrawalConfirmed.value = false; initial = snapshot()
  opener = document.activeElement as HTMLElement
  oldOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  await nextTick()
  editor.value?.showModal()
  editor.value?.querySelector<HTMLInputElement>('input')?.focus()
}
async function submit() {
  if (saving.value || !ready.value || moneyError.value || deleteBlocked.value) return
  formError.value = ''
  if ((kind.value === 'deposit' || kind.value === 'withdraw') && !validAmount.value) { formError.value = 'Isi nominal rupiah bulat mulai Rp1.'; return }
  if (kind.value === 'withdraw' && !withdrawalConfirmed.value) { withdrawalConfirmed.value = true; return }
  saving.value = true
  try {
    if (kind.value === 'goal') {
      const draft: GoalDraft = { name: name.value, target: parseMoney(target.value), icon: icon.value, deadline: deadline.value, reminderDay: reminderDay.value }
      await save(draft, original.value)
      notice.value = original.value ? 'Target berhasil diperbarui.' : 'Target berhasil dibuat.'
    } else if (kind.value === 'deposit' || kind.value === 'withdraw') {
      await transfer(original.value!, { direction: kind.value, amount: amountNumber.value, account: account.value, description: description.value })
      notice.value = kind.value === 'deposit' ? 'Tabungan berhasil ditambahkan.' : 'Dana berhasil dikembalikan ke dompet.'
    } else {
      await status(original.value!, kind.value)
      notice.value = kind.value === 'delete' ? 'Target dihapus. Riwayat tetap tersimpan.' : kind.value === 'archive' ? 'Target diarsipkan.' : 'Target aktif kembali.'
    }
    close()
  } catch (reason) { formError.value = reason instanceof Error ? reason.message : 'Perubahan belum tersimpan.' }
  finally { saving.value = false }
}
onBeforeUnmount(close)
</script>

<template>
  <section class="savings-page">
    <header class="savings-heading"><div><p class="eyebrow">Sedikit demi sedikit, jadi berarti</p><h2>Tabungan</h2><p>Wujudkan tujuanmu dengan dana yang disisihkan.</p></div><button class="primary" :disabled="!ready" @click="open('goal')"><span class="material-symbols-outlined" aria-hidden="true">add</span>Buat Target</button></header>
    <p v-if="notice" class="success" role="status">{{ notice }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!ready" role="status">Memuat tabungan...</p>
    <template v-else>
      <div class="savings-summary" aria-label="Ringkasan tabungan">
        <article><span>Total dana tabungan</span><strong>{{ formatRupiah(summary.total) }}</strong><small>Termasuk target yang diarsipkan</small></article>
        <article><span>Target aktif</span><strong>{{ summary.active }}</strong><small>Masih dalam perjalanan</small></article>
        <article><span>Target tercapai</span><strong>{{ summary.completed }}</strong><small>Setiap langkah patut dirayakan</small></article>
      </div>
      <aside v-if="reminders.length" class="reminders" aria-label="Pengingat menabung"><h3>Waktunya menabung</h3><div v-for="goal in reminders" :key="goal.id"><p>{{ goal.name }}<small>{{ goal.monthly !== null ? formatRupiah(goal.monthly) + ' perkiraan per bulan' : 'Sisihkan sesuai kemampuanmu bulan ini.' }}</small></p><button class="secondary" @click="open('deposit', goal)">Tambah tabungan untuk {{ goal.name }}</button></div></aside>
      <template v-if="detail">
        <button class="text-button" @click="selected = ''">← Semua target</button>
        <article id="notification-goal-detail" class="goal-detail" tabindex="-1">
          <div class="goal-title"><span class="goal-icon material-symbols-outlined" aria-hidden="true">{{ detail.icon }}</span><div><h3>{{ detail.name }}</h3><p>{{ detail.archived ? 'Diarsipkan' : detail.complete ? 'Target tercapai!' : detail.overdue ? 'Tenggat terlewati' : 'Sedang ditabung' }}</p></div></div>
          <strong class="large-amount">{{ formatRupiah(detail.balance) }}</strong><p class="muted">dari target {{ formatRupiah(detail.target) }}</p>
          <progress :value="detail.progress" max="100" :aria-label="'Progres ' + detail.name">{{ detail.progress }}%</progress>
          <p>{{ detail.progress }}% · Sisa {{ formatRupiah(detail.remaining) }}</p>
          <p class="muted">{{ detail.deadline ? 'Tenggat ' + dateLabel(detail.deadline) : 'Tanpa tenggat waktu' }}</p>
          <p v-if="detail.monthly !== null && !detail.complete" class="estimate">{{ detail.overdue ? 'Tenggat terlewati. Sisa yang perlu disisihkan:' : 'Perkiraan setoran per bulan:' }} <strong>{{ formatRupiah(detail.monthly) }}</strong></p>
          <p class="muted">{{ detail.reminderDay ? 'Pengingat setiap tanggal ' + detail.reminderDay + ' saat aplikasi dibuka.' : 'Pengingat belum diaktifkan.' }}</p>
          <div class="actions">
            <template v-if="!detail.archived"><button class="primary" @click="open('deposit', detail)">Tambah Tabungan</button><button class="secondary" :disabled="detail.balance === 0" @click="open('withdraw', detail)">Tarik Dana</button><button class="secondary" @click="open('goal', detail)">Ubah Target</button><button v-if="detail.complete" class="secondary" @click="open('archive', detail)">Arsipkan Target</button></template>
            <button v-else class="primary" @click="open('restore', detail)">Aktifkan Target</button>
            <button class="danger-button" @click="open('delete', detail)">Hapus Target</button>
          </div>
        </article>
      </template>
      <template v-else>
        <div class="target-filters" role="group" aria-label="Status target"><button v-for="item in [{ id: 'active', label: 'Aktif' }, { id: 'completed', label: 'Tercapai' }, { id: 'archived', label: 'Arsip' }]" :key="item.id" :aria-pressed="filter === item.id" @click="filter = item.id">{{ item.label }}</button></div>
        <div v-if="visible.length" class="target-grid"><button v-for="goal in visible" :key="goal.id" class="target-card" :aria-label="'Lihat target ' + goal.name" @click="selected = goal.id; historyGoal = goal.id">
          <div class="goal-title"><span class="goal-icon material-symbols-outlined" aria-hidden="true">{{ goal.icon }}</span><span class="badge">{{ goal.archived ? 'Arsip' : goal.complete ? 'Tercapai' : goal.overdue ? 'Tenggat terlewati' : 'Dalam proses' }}</span></div>
          <h3>{{ goal.name }}</h3><strong>{{ formatRupiah(goal.balance) }}</strong><p>dari {{ formatRupiah(goal.target) }}</p>
          <progress :value="goal.progress" max="100" :aria-label="'Progres ' + goal.name">{{ goal.progress }}%</progress><p>{{ goal.progress }}% · Sisa {{ formatRupiah(goal.remaining) }}</p>
          <small v-if="goal.deadline">{{ dateLabel(goal.deadline) }}<span v-if="goal.monthly !== null && !goal.complete"> · {{ formatRupiah(goal.monthly) }}/bulan</span></small>
        </button></div>
        <div v-else class="savings-empty"><span class="material-symbols-outlined" aria-hidden="true">savings</span><h3>{{ filter === 'active' ? 'Mulai dari satu tujuan' : 'Belum ada target di sini' }}</h3><p>Buat target, lalu sisihkan dana dari dompetmu.</p><button class="primary" @click="open('goal')">Buat target pertama</button></div>
      </template>
      <section class="savings-history"><div class="history-heading"><h3>Riwayat tabungan</h3><label>Riwayat target<select v-model="historyGoal"><option value="">Semua target</option><option v-for="goal in data.goals" :key="goal.id" :value="goal.id">{{ goal.name }}{{ goal.deleted ? ' (dihapus)' : '' }}</option></select></label></div>
        <p v-if="!history.length" class="muted">Belum ada setoran atau penarikan.</p>
        <ul v-else><li v-for="item in history.slice(0, visibleCount)" :key="item.id"><div><strong>{{ item.direction === 'deposit' ? 'Setoran' : 'Penarikan' }} · {{ data.goals.find(goal => goal.id === item.goalId)?.name }}</strong><p>{{ dateLabel(item.date) }} · {{ item.direction === 'deposit' ? 'Dari' : 'Ke' }} {{ noteAccounts.find(wallet => wallet.id === item.account)?.label }}</p><p v-if="item.description">{{ item.description }}</p></div><strong :class="item.direction">{{ item.direction === 'deposit' ? '+' : '−' }}{{ formatRupiah(item.amount) }}</strong></li></ul>
        <button v-if="history.length > visibleCount" class="secondary" @click="visibleCount += 50">Muat lebih banyak</button>
      </section>
      <p class="footnote">Setoran dan penarikan merupakan transfer internal: total uang tetap sama, tanpa menambah pemasukan atau pengeluaran.</p>
    </template>
    <dialog ref="editor" class="savings-editor" :aria-label="title" @cancel.prevent="requestClose">
      <header><h2>{{ title }}</h2><button type="button" class="close-button" aria-label="Tutup form tabungan" :disabled="saving" @click="requestClose">×</button></header>
      <form novalidate :aria-busy="saving" @submit.prevent="submit">
        <template v-if="kind === 'goal'">
          <label>Nama target<input v-model="name" maxlength="60" placeholder="Contoh: Dana Darurat" autocomplete="off" required></label>
          <label>Nominal target (Rp)<input v-model="target" inputmode="numeric" maxlength="20" placeholder="Contoh: 1000000" required></label>
          <label>Ikon target<select v-model="icon"><option v-for="item in savingsIcons" :key="item" :value="item">{{ ({ savings: 'Tabungan', shield: 'Dana darurat', home: 'Rumah', school: 'Pendidikan', flight: 'Liburan', laptop: 'Perangkat', favorite: 'Kesehatan', directions_car: 'Kendaraan' })[item] }}</option></select></label>
          <label>Tenggat (opsional)<input v-model="deadline" type="date" :min="original?.deadline && original.deadline < today ? original.deadline : today" max="9999-12-31"></label>
          <label>Pengingat bulanan<select v-model.number="reminderDay"><option :value="0">Tidak diaktifkan</option><option v-for="day in 31" :key="day" :value="day">Tanggal {{ day }}</option></select></label>
          <p class="muted">Pengingat muncul di aplikasi mulai tanggal pilihan sampai ada setoran bulan tersebut. Tanggal 29–31 mengikuti hari terakhir pada bulan yang lebih pendek.</p>
        </template>
        <template v-else-if="kind === 'deposit' || kind === 'withdraw'">
          <p class="transfer-target">{{ original?.name }}</p><p class="muted">Tanggal transaksi: {{ dateLabel(today) }}</p>
          <label>{{ kind === 'deposit' ? 'Sumber dana' : 'Dompet tujuan' }}<select v-model="account"><option v-for="wallet in wallets" :key="wallet.id" :value="wallet.id">{{ wallet.label }} · {{ formatRupiah(balances[wallet.id] ?? 0) }}</option></select></label>
          <label>Nominal transfer (Rp)<input v-model="amount" inputmode="numeric" maxlength="20" required :aria-invalid="!!moneyError" :aria-describedby="moneyError ? 'savings-money-error' : 'savings-available'"></label>
          <p id="savings-available" class="muted">{{ kind === 'deposit' ? 'Saldo sumber' : 'Dana target' }} tersedia: {{ formatRupiah(available) }}</p>
          <label>Keterangan (opsional)<input v-model="description" maxlength="120"></label>
          <p v-if="withdrawalConfirmed" class="confirmation" role="status">Tarik {{ formatRupiah(amountNumber) }} dari {{ original?.name }} ke {{ noteAccounts.find(wallet => wallet.id === account)?.label }}?</p>
        </template>
        <template v-else><p class="confirmation">{{ kind === 'archive' ? 'Arsipkan target yang sudah tercapai? Dana tetap disisihkan dan riwayat tetap tersimpan.' : kind === 'restore' ? 'Aktifkan kembali target ini agar dapat menambah atau menarik dana?' : 'Hapus target ini? Riwayat setoran dan penarikan tetap disimpan.' }}</p><strong>{{ original?.name }}</strong><p v-if="deleteBlocked" class="error" role="alert">Tarik seluruh dana ke dompet terlebih dahulu sebelum menghapus target.</p></template>
        <p v-if="moneyError && (kind === 'deposit' || kind === 'withdraw')" id="savings-money-error" class="error" role="alert">{{ moneyError }}</p>
        <p v-if="formError" class="error" role="alert">{{ formError }}</p>
        <div v-if="discard" class="confirmation" role="alert"><p>Isian belum disimpan. Tutup dan buang isian?</p><div class="actions"><button type="button" class="secondary" @click="discard = false">Lanjut mengisi</button><button type="button" class="danger-button" @click="close">Buang isian</button></div></div>
        <footer v-else><button type="button" class="secondary" :disabled="saving" @click="requestClose">Batal</button><button class="primary" :disabled="saving || !ready || !!moneyError || !!deleteBlocked" type="submit">{{ saving ? 'Menyimpan...' : kind === 'goal' ? 'Simpan Target' : kind === 'deposit' ? 'Simpan Setoran' : kind === 'withdraw' ? withdrawalConfirmed ? 'Konfirmasi Penarikan' : 'Lanjut Penarikan' : kind === 'delete' ? 'Ya, Hapus Target' : kind === 'archive' ? 'Ya, Arsipkan' : 'Ya, Aktifkan' }}</button></footer>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.savings-page { color: var(--ink); }
h2,h3,p { margin: 0; } button,input,select { font: inherit; } button { cursor: pointer; } button:disabled { cursor: not-allowed; opacity: .5; }
button:focus-visible,input:focus-visible,select:focus-visible { outline: 3px solid var(--teal); outline-offset: 3px; }
.savings-heading,.history-heading,.goal-title { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
.savings-heading { margin-bottom: 1.6rem; } .savings-heading h2 { font-size: clamp(1.8rem,4vw,2.4rem); margin: .4rem 0; letter-spacing: -.04em; }
.savings-heading p,.muted,.footnote { color: var(--muted); line-height: 1.7; font-size: .82rem; }
.savings-heading .eyebrow { color: var(--teal); font-size: .72rem; font-weight: 800; }
.primary,.secondary,.danger-button { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; min-height: 2.75rem; padding: .7rem 1rem; border-radius: .65rem; font-weight: 800; font-size: .8rem; }
.primary { border: 1px solid var(--teal); background: var(--teal); color: white; }.secondary { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }.danger-button { border: 1px solid var(--line); background: transparent; color: var(--danger); }
.text-button { border: 0; background: transparent; color: var(--teal); margin: 1rem 0; padding: .6rem 0; font-weight: 700; }
.savings-summary { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.savings-summary article,.goal-detail,.target-card,.savings-history { background: var(--surface); border: 1px solid var(--line); border-radius: 1rem; padding: 1.3rem; min-width: 0; }
.savings-summary article:first-child { background: color-mix(in srgb,var(--teal) 8%,var(--surface)); }
.savings-summary span,.savings-summary small { display: block; color: var(--muted); font-size: .75rem; line-height: 1.6; }
.savings-summary strong { display: block; margin: .6rem 0; font-size: clamp(1.25rem,2.5vw,1.8rem); overflow-wrap: anywhere; }
.target-filters { display: flex; gap: .5rem; margin: 1.2rem 0; }.target-filters button { padding: .65rem 1rem; border: 1px solid var(--line); border-radius: 99px; color: var(--muted); background: var(--surface); }.target-filters button[aria-pressed=true] { color: var(--teal); background: color-mix(in srgb,var(--teal) 10%,var(--surface)); border-color: var(--teal); }
.target-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 1rem; }.target-card { text-align: left; color: var(--ink); }.target-card:hover { border-color: var(--teal); }.target-card h3 { margin: 1rem 0; overflow-wrap: anywhere; }.target-card strong { font-size: 1.25rem; }.target-card p,.target-card small { display: block; margin-top: .4rem; color: var(--muted); font-size: .75rem; line-height: 1.6; }
.goal-icon { display: grid; place-items: center; background: color-mix(in srgb,var(--teal) 10%,var(--surface)); color: var(--teal); width: 2.7rem; height: 2.7rem; flex: none; border-radius: .7rem; }
.badge { color: var(--teal); font-size: .72rem; }.goal-detail .goal-title { justify-content: flex-start; }.goal-detail h3 { overflow-wrap: anywhere; }.goal-detail p { margin-top: .6rem; line-height: 1.6; }.goal-detail .large-amount { display: block; font-size: 2rem; margin-top: 1.4rem; overflow-wrap: anywhere; }
progress { display: block; width: 100%; height: .55rem; border: 0; border-radius: 99px; overflow: hidden; margin: 1rem 0; background: var(--line); accent-color: var(--teal); }progress::-webkit-progress-bar { background: var(--line); }progress::-webkit-progress-value { background: var(--teal); }progress::-moz-progress-bar { background: var(--teal); }
.actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: 1rem; }.reminders { padding: 1rem; border-radius: .8rem; margin: 1.2rem 0; background: color-mix(in srgb,var(--teal) 8%,var(--surface)); border: 1px solid var(--line); }.reminders > div { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .6rem; margin-top: .75rem; }.reminders small { display: block; color: var(--muted); line-height: 1.7; }.reminders h3 { font-size: .95rem; }
.savings-empty { text-align: center; border: 1px dashed var(--line); border-radius: 1rem; padding: 2.5rem 1rem; }.savings-empty > span { font-size: 3rem; color: var(--teal); }.savings-empty p { color: var(--muted); margin: 1rem 0; }
.savings-history { margin-top: 1.5rem; }.history-heading { flex-wrap: wrap; margin-bottom: 1rem; }.history-heading label { font-size: .75rem; color: var(--muted); }.savings-history ul { margin: 0; padding: 0; list-style: none; }.savings-history li { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 0; border-top: 1px solid var(--line); font-size: .8rem; }.savings-history li > div { min-width: 0; overflow-wrap: anywhere; }.savings-history li > strong { flex: none; }.savings-history li p { color: var(--muted); margin-top: .35rem; line-height: 1.6; }.deposit,.success { color: var(--teal); }.withdraw { color: var(--muted); }.error { color: var(--danger); line-height: 1.6; }.success { margin-bottom: 1rem; }.footnote { margin-top: 1.2rem; }.estimate { background: var(--canvas); padding: .8rem; border-radius: .6rem; }
.savings-editor { width: min(32rem,calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); box-sizing: border-box; overflow: auto; border: 1px solid var(--line); border-radius: 1rem; background: var(--surface); color: var(--ink); padding: 1.5rem; }.savings-editor::backdrop { background: rgb(12 24 22 / 55%); backdrop-filter: blur(4px); }.savings-editor header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }.savings-editor h2 { font-size: 1.2rem; }.close-button { border: 0; background: transparent; color: var(--muted); font-size: 1.8rem; width: 2.5rem; height: 2.5rem; }.savings-editor label { display: grid; gap: .5rem; margin-top: 1rem; font-size: .8rem; font-weight: 700; }
input,select { width: 100%; min-height: 2.7rem; box-sizing: border-box; border: 1px solid var(--line); border-radius: .5rem; background: var(--surface); color: var(--ink); padding: .65rem .75rem; }.savings-editor p { margin-top: .75rem; }.savings-editor footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: .5rem; margin-top: 1.5rem; }.confirmation { padding: .8rem; background: var(--canvas); border: 1px solid var(--line); border-radius: .6rem; line-height: 1.7; font-size: .85rem; }.transfer-target { font-weight: 800; overflow-wrap: anywhere; }
html.theme-dark .primary { background: #006a61; border-color: #158f83; }html.theme-dark input { color-scheme: dark; }
@media(max-width:1000px) { .target-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media(max-width:640px) { .savings-heading { align-items: flex-start; flex-direction: column; }.savings-heading > button { width: 100%; }.savings-summary,.target-grid { grid-template-columns: 1fr; }.savings-summary article { padding: 1rem; }.savings-editor { width: 100%; max-height: 92dvh; margin: auto 0 0; border-radius: 1rem 1rem 0 0; padding-bottom: max(1.5rem,env(safe-area-inset-bottom)); }.savings-history li { flex-wrap: wrap; }.savings-history li > strong { margin-left: auto; }.target-filters button { flex: 1; padding-inline: .5rem; } }
</style>
