<script setup lang="ts">
import CategoryCreator from './CategoryCreator.vue'
import type { CategoryCatalog, SaveCategory } from '~/utils/categories'
import { summarizeBudgets, budgetStatusLabels, validBudgetMonth, type MonthlyBudget, type BudgetMode } from '~/utils/budgets'
import { noteAccounts, maxNoteAmount, type MoneyNote } from '~/utils/notes'
import { formatRupiah } from '~/utils/currency'
import ReceiptViewer from './ReceiptViewer.vue'

const props = defineProps<{
  accounts: Array<{ id: string; label: string; balance: number }>
  catalog: CategoryCatalog
  saveCategory: SaveCategory
  categoriesReady: boolean
  budgets: MonthlyBudget[]
  notes: MoneyNote[]
  today: string
  ready: boolean
  error: string
  save: (draft: MonthlyBudget, mode: BudgetMode) => void
}>()
const emit = defineEmits<{ expense: [category: string, month: string] }>()
const month = ref(props.today.slice(0, 7))
const summary = computed(() => summarizeBudgets(props.budgets, props.notes, month.value, props.today, props.catalog))
const selected = ref('')
const detail = computed(() => summary.value.allocated.find(item => item.id === selected.value))
const receiptViewer = ref<InstanceType<typeof ReceiptViewer> | null>(null)
const monthLabel = computed(() => validBudgetMonth(month.value)
  ? new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(month.value + '-01T12:00:00'))
  : 'Pilih periode')
const editor = ref<HTMLDialogElement | null>(null)
const firstInput = ref<HTMLSelectElement | null>(null)
const mode = ref<BudgetMode>('create')
const draftCategory = ref('')
const categoryCreator = ref<InstanceType<typeof CategoryCreator> | null>(null)
const categoryDraftDirty = ref(false)
const categoryCreating = ref(false)
const draftMonth = ref('')
const draftLimit = ref('')
const draftAccount = ref('')
const formError = ref('')
const confirmDiscard = ref(false)
const notice = ref('')
let initialDraft = ''
let previousOverflow = ''
const snapshot = () => JSON.stringify([draftCategory.value, draftMonth.value, draftLimit.value, draftAccount.value])
const duplicate = computed(() => mode.value === 'create' && props.budgets.some(item => item.category === draftCategory.value && item.month === draftMonth.value))
function openEditor(category = '', budget?: MonthlyBudget) {
  categoryCreator.value?.reset()
  mode.value = budget ? 'update' : 'create'
  draftCategory.value = budget?.category ?? category
  draftMonth.value = budget?.month ?? month.value
  draftLimit.value = budget ? String(budget.limit) : ''
  draftAccount.value = budget?.defaultAccount ?? ''
  formError.value = ''
  confirmDiscard.value = false
  initialDraft = snapshot()
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  editor.value?.showModal()
  nextTick(() => {
    if (budget) editor.value?.querySelector<HTMLInputElement>('#budget-limit')?.focus()
    else firstInput.value?.focus()
  })
}
function closeEditor() {
  if (!editor.value?.open) return
  categoryCreator.value?.reset()
  editor.value.close()
  document.body.style.overflow = previousOverflow
}
function requestClose() {
  if (snapshot() !== initialDraft || categoryDraftDirty.value) confirmDiscard.value = true
  else closeEditor()
}
function submit() {
  if (categoryCreating.value) return
  formError.value = ''
  const limit = /^\d[\d.]*$/.test(draftLimit.value) ? Number(draftLimit.value.replaceAll('.', '')) : NaN
  if (!props.catalog.expense.some(item => item.id === draftCategory.value)) {
    formError.value = 'Pilih kategori anggaran.'; return
  }
  if (!validBudgetMonth(draftMonth.value)) { formError.value = 'Pilih periode yang valid.'; return }
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > maxNoteAmount) {
    formError.value = 'Isi batas Rp1 sampai Rp999.999.999.999, tanpa desimal.'; return
  }
  try {
    props.save({ month: draftMonth.value, category: draftCategory.value, limit,
      ...(draftAccount.value ? { defaultAccount: draftAccount.value } : {}),
    }, mode.value)
    month.value = draftMonth.value
    notice.value = mode.value === 'create' ? 'Anggaran berhasil dibuat.' : 'Anggaran berhasil diubah.'
    closeEditor()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Anggaran belum tersimpan. Coba lagi.'
  }
}
function selectMonth(event: Event) {
  const input = event.target as HTMLInputElement
  if (validBudgetMonth(input.value)) month.value = input.value
  else input.value = month.value
}
watch(month, () => { selected.value = ''; notice.value = ''; receiptViewer.value?.close() })
onBeforeUnmount(closeEditor)
</script>

<template>
  <section class="budget-overview">
    <header class="page-heading">
      <div><p class="eyebrow">Rencana kecil, langkah lebih tenang</p><h2>Anggaran</h2><p>Atur batas pengeluaran bulanan sesuai kebutuhanmu.</p></div>
      <button class="primary" :disabled="!ready" @click="openEditor()"><span class="material-symbols-outlined" aria-hidden="true">add</span>Buat Anggaran</button>
    </header>
    <div class="period-row">
      <label for="budget-period">Periode <input id="budget-period" type="month" :value="month" min="1900-01" max="9999-12" @change="selectMonth"></label>
      <span class="local-label"><span class="material-symbols-outlined" aria-hidden="true">devices</span>Tersimpan di browser ini</span>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!ready" role="status">Memuat anggaran dan catatan...</p>
    <template v-else>
      <p v-if="notice" class="success" role="status">{{ notice }}</p>
      <template v-if="detail">
        <button class="text-button back" @click="selected = ''"><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>Semua anggaran</button>
        <section class="detail-card">
          <div class="section-title"><div class="category-title"><span class="category-icon material-symbols-outlined" aria-hidden="true">{{ detail.icon }}</span><div><h3>{{ detail.label }}</h3><p>{{ monthLabel }}</p></div></div><span class="status" :class="detail.status!">{{ budgetStatusLabels[detail.status!] }}</span></div>
          <div class="metrics detail-metrics">
            <div><span>Batas anggaran</span><strong>{{ formatRupiah(detail.limit) }}</strong></div>
            <div><span>Terpakai</span><strong>{{ formatRupiah(detail.spent) }}</strong></div>
            <div :class="{ error: detail.remaining < 0 }"><span>{{ detail.remaining < 0 ? 'Melebihi batas' : 'Sisa anggaran' }}</span><strong>{{ formatRupiah(Math.abs(detail.remaining)) }}</strong></div>
          </div>
          <div class="track" :class="detail.status!" aria-hidden="true"><span :style="{ width: detail.progress + '%' }" /></div>
          <p v-if="detail.budget?.defaultAccount" class="wallet-preference"><span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>Biasanya bayar dari {{ noteAccounts.find(account => account.id === detail?.budget?.defaultAccount)?.label }}. Bisa diganti saat mencatat.</p>
          <div class="detail-actions"><button class="primary" :disabled="month > today.slice(0, 7)" @click="emit('expense', detail.id, month)">Catat Pengeluaran</button><button class="secondary" @click="openEditor(detail.id, detail.budget)">Ubah Anggaran</button></div>
          <p v-if="month > today.slice(0, 7)" class="muted">Pengeluaran dapat dicatat saat periode ini dimulai.</p>
        </section>
        <section class="transactions"><h3>Pengeluaran {{ monthLabel }}</h3><p class="muted">Catatan dari semua dompet untuk kategori {{ detail.label }}.</p>
          <ul v-if="detail.transactions.length">
            <li v-for="note in detail.transactions" :key="note.id"><div><strong>{{ note.description || detail.label }}</strong><p>{{ new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(note.date + 'T12:00:00')) }} &middot; {{ noteAccounts.find(account => account.id === note.account)?.label }}</p><button v-if="note.receipt" class="text-button" @click="receiptViewer?.open(note.receipt)">Lihat struk</button></div><strong>{{ formatRupiah(note.amount) }}</strong></li>
          </ul><p v-else class="empty-small">Belum ada pengeluaran untuk kategori ini pada periode tersebut.</p>
        </section>
      </template>
      <template v-else>
        <div class="metrics summary-metrics" aria-label="Ringkasan anggaran">
          <div><span>Total anggaran</span><strong>{{ formatRupiah(summary.limit) }}</strong><small>{{ summary.allocated.length }} kategori diatur</small></div>
          <div><span>Terpakai</span><strong>{{ formatRupiah(summary.spent) }}</strong><small>Pada kategori yang dianggarkan</small></div>
          <div :class="{ error: summary.remaining < 0 }"><span>{{ summary.remaining < 0 ? 'Melebihi total anggaran' : 'Sisa anggaran' }}</span><strong>{{ formatRupiah(Math.abs(summary.remaining)) }}</strong><small>{{ monthLabel }}</small></div>
        </div>
        <div class="section-title"><h3>Anggaran per kategori</h3><span class="muted">{{ monthLabel }}</span></div>
        <div v-if="summary.allocated.length" class="category-cards">
          <button v-for="item in summary.allocated" :key="item.id" class="category-card" :aria-label="'Lihat anggaran ' + item.label" @click="selected = item.id">
            <div class="section-title"><span class="category-icon material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span><span class="status" :class="item.status!">{{ budgetStatusLabels[item.status!] }}</span></div>
            <h4>{{ item.label }}</h4><p class="budget-spent"><strong>{{ formatRupiah(item.spent) }}</strong><span> dari {{ formatRupiah(item.limit) }}</span></p>
            <p v-if="item.budget?.defaultAccount" class="wallet-preference">Biasanya: {{ noteAccounts.find(account => account.id === item.budget?.defaultAccount)?.label }}</p>
            <div class="track" :class="item.status!" aria-hidden="true"><span :style="{ width: item.progress + '%' }" /></div>
            <div class="card-footer"><span :class="{ error: item.remaining < 0 }">{{ item.remaining < 0 ? 'Lebih ' : 'Sisa ' }}{{ formatRupiah(Math.abs(item.remaining)) }}</span><span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></div>
          </button>
        </div>
        <div v-else class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span><h3>Mulai atur anggaranmu</h3><p>Belum ada anggaran untuk {{ monthLabel }}.<br>Mulai dari satu kategori yang paling sering kamu gunakan.</p><button class="primary" @click="openEditor()">Atur anggaran pertama</button></div>
        <section v-if="summary.unbudgeted.length" class="unbudgeted">
          <div class="section-title"><h3>Pengeluaran tanpa anggaran</h3><strong>{{ formatRupiah(summary.unbudgetedSpent) }}</strong></div>
          <p class="muted">Pengeluaran ini belum masuk ringkasan anggaran di atas.</p>
          <div v-for="item in summary.unbudgeted" :key="item.id" class="unbudgeted-row"><span>{{ item.label }}</span><strong>{{ formatRupiah(item.spent) }}</strong><button class="secondary" @click="openEditor(item.id)">Atur Anggaran<span class="sr-only"> {{ item.label }}</span></button></div>
        </section>
      </template>
      <p class="footnote">Anggaran membantu memantau pengeluaran dan tidak mengurangi saldo dompet. Batas yang terlewati akan diberi peringatan.</p>
    </template>
    <dialog ref="editor" class="budget-editor" :aria-label="mode === 'create' ? 'Buat Anggaran' : 'Ubah Anggaran'" @cancel.prevent="requestClose">
      <header class="section-title"><h2 id="budget-editor-title">{{ mode === 'create' ? 'Buat Anggaran' : 'Ubah Anggaran' }}</h2><button class="close-button" aria-label="Tutup form anggaran" @click="requestClose"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></header>
      <p class="muted">Tentukan batas yang nyaman untuk satu kategori.</p>
      <form novalidate @submit.prevent="submit">
        <div class="budget-field"><label for="budget-category">Kategori</label><select id="budget-category" ref="firstInput" v-model="draftCategory" :disabled="mode === 'update'" required><option value="" disabled>Pilih kategori</option><option v-for="item in catalog.expense" :key="item.id" :value="item.id">{{ item.label }}</option></select></div>
        <CategoryCreator v-if="mode === 'create'" ref="categoryCreator" type="expense" :save="saveCategory" :ready="categoriesReady" @created="draftCategory = $event.id" @dirty="categoryDraftDirty = $event" @editing="categoryCreating = $event" />
        <label for="budget-month">Bulan anggaran<input id="budget-month" v-model="draftMonth" type="month" min="1900-01" max="9999-12" :disabled="mode === 'update'" required></label>
        <label for="budget-limit">Batas anggaran (Rp)<input id="budget-limit" v-model="draftLimit" type="text" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="Contoh: 500000" required></label>
        <div class="budget-field">
          <label for="budget-default-account">Biasanya bayar dari (opsional)</label>
          <select id="budget-default-account" v-model="draftAccount" aria-describedby="budget-default-account-help">
            <option value="">Tanpa pilihan default</option>
            <option v-if="draftAccount && !accounts.some(account => account.id === draftAccount)" :value="draftAccount" disabled>{{ noteAccounts.find(account => account.id === draftAccount)?.label }} (tidak tersedia)</option>
            <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.label }} &middot; {{ formatRupiah(account.balance) }}</option>
          </select>
          <p id="budget-default-account-help" class="muted">Dompet otomatis terpilih saat mencatat pengeluaran kategori ini. Kamu tetap bisa menggantinya. Mengatur pilihan ini tidak mengurangi saldo.</p>
        </div>
        <p v-if="duplicate" class="error" role="alert">Kategori ini sudah memiliki anggaran pada periode tersebut. Gunakan Ubah Anggaran.</p>
        <p v-if="formError" class="error" role="alert">{{ formError }}</p>
        <div v-if="confirmDiscard" class="discard"><p>Isian belum disimpan. Tutup dan buang isian?</p><div class="detail-actions"><button type="button" class="secondary" @click="confirmDiscard = false">Lanjut mengisi</button><button type="button" class="secondary" @click="closeEditor">Buang isian</button></div></div>
        <div class="editor-footer"><button type="button" class="secondary" @click="requestClose">Batal</button><button class="primary" type="submit" :disabled="!ready || duplicate || categoryCreating">Simpan Anggaran</button></div>
      </form>
    </dialog>
    <ReceiptViewer ref="receiptViewer" />
  </section>
</template>

<style scoped>
.wallet-preference { display: flex; align-items: center; gap: .4rem; margin-top: .75rem; color: var(--muted); font-size: .73rem; line-height: 1.6; }
.wallet-preference .material-symbols-outlined { font-size: 1.1rem; flex: none; }
.budget-overview { color: var(--ink); }
h2, h3, h4, p { margin: 0; }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--teal); outline-offset: 3px; }
.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; margin-bottom: 1.8rem; }
.page-heading h2 { margin: .35rem 0 .65rem; font-size: clamp(1.8rem, 4vw, 2.4rem); letter-spacing: -.04em; }
.page-heading p { color: var(--muted); font-size: .88rem; line-height: 1.6; }
.page-heading .eyebrow { color: var(--teal); font-size: .7rem; font-weight: 800; letter-spacing: .04em; }
.primary, .secondary, .text-button { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; min-height: 2.75rem; padding: .7rem 1rem; border-radius: .7rem; font-size: .8rem; font-weight: 800; text-decoration: none; }
.primary { background: var(--teal); color: #fff; border: 1px solid var(--teal); }
.secondary { color: var(--ink); background: var(--surface); border: 1px solid var(--line); }
.text-button { padding: .4rem 0; border: 0; color: var(--teal); background: transparent; }
.period-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
.period-row label { display: flex; align-items: center; gap: .8rem; color: var(--muted); font-size: .8rem; }
input, select { width: 100%; box-sizing: border-box; min-height: 2.8rem; padding: .65rem .8rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--surface); color: var(--ink); }
.period-row input { width: auto; max-width: 14rem; }
.local-label { display: flex; align-items: center; gap: .4rem; color: var(--muted); font-size: .7rem; }
.local-label .material-symbols-outlined { font-size: 1rem; }
.metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.metrics > div { min-width: 0; }
.summary-metrics { margin-bottom: 2rem; }
.summary-metrics > div { padding: 1.3rem; background: var(--surface); border: 1px solid var(--line); border-radius: 1rem; }
.summary-metrics > div:first-child { background: color-mix(in srgb, var(--teal) 8%, var(--surface)); }
.metrics span, .metrics small { display: block; color: var(--muted); font-size: .75rem; line-height: 1.5; }
.metrics strong { display: block; margin: .7rem 0 .35rem; font-size: clamp(1.1rem, 2vw, 1.7rem); letter-spacing: -.04em; overflow-wrap: anywhere; }
.metrics small { font-size: .68rem; }
.section-title { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
.section-title h3, .transactions h3 { font-size: 1rem; }
.section-title > .muted { font-size: .75rem; }
.category-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 1rem; }
.category-card { min-width: 0; text-align: left; padding: 1.2rem; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 1rem; transition: border-color .15s, transform .15s; }
.category-card:hover { border-color: var(--teal); transform: translateY(-2px); }
.category-icon { display: grid; flex: none; place-items: center; width: 2.8rem; height: 2.8rem; border-radius: .8rem; background: color-mix(in srgb, var(--teal) 10%, var(--surface)); color: var(--teal); }
.status { flex-shrink: 0; padding: .35rem .55rem; border-radius: 999px; font-size: .63rem; font-weight: 800; color: var(--teal); background: color-mix(in srgb, var(--teal) 8%, var(--surface)); }
.status.near-limit { color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, var(--surface)); }
.status.reached, .status.exceeded { color: var(--danger); background: color-mix(in srgb, var(--danger) 9%, var(--surface)); }
.category-card h4 { overflow-wrap: anywhere; margin: 1rem 0 .75rem; font-size: .95rem; }
.budget-spent { display: flex; flex-wrap: wrap; gap: .25rem; align-items: baseline; overflow-wrap: anywhere; }
.budget-spent strong { font-size: 1.1rem; }
.budget-spent span, .card-footer { font-size: .72rem; color: var(--muted); }
.track { height: .45rem; margin: 1rem 0; overflow: hidden; background: var(--line); border-radius: 99px; }
.track span { display: block; height: 100%; border-radius: inherit; background: var(--teal); }
.track.near-limit span { background: var(--warning); }
.track.reached span, .track.exceeded span { background: var(--danger); }
.card-footer { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.card-footer .material-symbols-outlined { font-size: 1.1rem; color: var(--teal); }
.empty-state { margin-top: 1rem; padding: 2.75rem 1rem; text-align: center; border: 1px dashed var(--line); border-radius: 1rem; background: var(--surface); }
.empty-state > .material-symbols-outlined { color: var(--teal); font-size: 2.75rem; margin-bottom: 1rem; }
.empty-state p { margin: .75rem 0 1.25rem; color: var(--muted); font-size: .85rem; line-height: 1.7; }
.unbudgeted, .transactions { margin-top: 1.5rem; padding: 1.25rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--surface); }
.muted { color: var(--muted); font-size: .8rem; line-height: 1.6; }
.unbudgeted > p, .transactions > p { margin-top: .5rem; }
.unbudgeted-row { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; padding-top: 1rem; margin-top: 1rem; border-top: 1px solid var(--line); font-size: .8rem; }
.unbudgeted-row > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.footnote { margin: 1.5rem 0 0; color: var(--muted); font-size: .73rem; line-height: 1.7; }
.error { color: var(--danger); }
.success { margin-bottom: 1rem; color: var(--teal); font-size: .8rem; }
.back { margin-bottom: .75rem; }
.detail-card { padding: 1.5rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--surface); }
.category-title > div { min-width: 0; overflow-wrap: anywhere; }
.category-title { min-width: 0; display: flex; align-items: center; gap: .8rem; }
.category-title p { margin-top: .3rem; color: var(--muted); font-size: .75rem; }
.detail-metrics { margin-top: 1.5rem; }
.detail-actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: 1.2rem; }
.detail-card > .muted { margin-top: .75rem; }
.transactions ul { padding: 0; margin: 1rem 0 0; list-style: none; }
.transactions li { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem 0; border-top: 1px solid var(--line); font-size: .83rem; }
.transactions li > div { min-width: 0; overflow-wrap: anywhere; }
.transactions li > strong { flex: none; }
.transactions li p { margin-top: .4rem; color: var(--muted); font-size: .73rem; }
.empty-small { padding: 1.5rem 0; text-align: center; }
.budget-editor { box-sizing: border-box; max-width: 100vw; width: min(30rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); margin: auto; padding: 1.5rem; border: 1px solid var(--line); border-radius: 1.2rem; background: var(--surface); color: var(--ink); box-shadow: 0 1.5rem 5rem rgb(0 0 0 / 20%); }
.budget-editor::backdrop { background: rgb(12 24 22 / 55%); backdrop-filter: blur(4px); }
.budget-editor h2 { font-size: 1.2rem; }
.close-button { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; background: transparent; border: 0; color: var(--muted); border-radius: 50%; }
.budget-editor form > label, .budget-field { display: grid; gap: .5rem; margin-top: 1.25rem; font-size: .8rem; font-weight: 700; }
.budget-editor .error, .discard { margin-top: 1rem; font-size: .8rem; line-height: 1.6; }
.editor-footer { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1.5rem; }
.discard { padding: .8rem; background: var(--canvas); border-radius: .6rem; border: 1px solid var(--line); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
html.theme-dark .status.safe, html.theme-dark .success, html.theme-dark .text-button, html.theme-dark .eyebrow, html.theme-dark .category-icon, html.theme-dark .card-footer .material-symbols-outlined { color: #74d9cb; }
html.theme-dark input { color-scheme: dark; }
html.theme-dark .primary { background: #006a61; border-color: #158f83; }
@media (max-width: 1200px) { .category-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .page-heading { align-items: flex-start; flex-direction: column; gap: 1rem; }
  .page-heading > .primary { width: 100%; }
  .period-row { align-items: flex-start; flex-direction: column; gap: .75rem; }
  .metrics { grid-template-columns: 1fr; gap: .7rem; }
  .summary-metrics > div { padding: 1rem; }
  .metrics strong { font-size: 1.5rem; margin-top: .4rem; }
  .category-cards { grid-template-columns: 1fr; }
  .detail-card { padding: 1rem; }
  .detail-metrics { grid-template-columns: 1fr 1fr; }
  .detail-metrics strong { font-size: 1.15rem; }
  .unbudgeted > .section-title { align-items: flex-start; flex-direction: column; }
  .unbudgeted-row .secondary { width: 100%; }
  .budget-editor { width: 100%; max-height: 92dvh; margin: auto 0 0; border-radius: 1.2rem 1.2rem 0 0; padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }
}
</style>

