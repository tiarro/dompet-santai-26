<script setup lang="ts">
import CardPagination from './CardPagination.vue'
import { billStatus, sortBills, type Bill, type BillDraft } from '~/utils/bills'
import { noteAccounts } from '~/utils/notes'
import { formatRupiah } from '~/utils/currency'
import type { CategoryCatalog } from '~/utils/categories'

const props = defineProps<{ bills: ReturnType<typeof useBills>; today: string; catalog: CategoryCatalog; activeAccounts: string[]; ready: boolean }>()
const { items, owner, loading, busy, error, refresh, save, complete, remove } = props.bills
const tab = ref<'pending' | 'paid'>('pending')
const pending = computed(() => sortBills(items.value.filter(b => b.status === 'pending')))
const visible = computed(() => tab.value === 'pending' ? pending.value : sortBills(items.value.filter(b => b.status === 'paid')).reverse())
const total = computed(() => pending.value.reduce((sum, bill) => sum + bill.amount, 0))
const urgent = computed(() => pending.value.filter(b => billStatus(b, props.today).tone !== 'normal').length)
const editor = ref<HTMLDialogElement | null>(null)
const confirmation = ref<HTMLDialogElement | null>(null)
const editing = ref<Bill>()
const selected = ref<Bill>()
const action = ref<'paid' | 'delete'>('paid')
const notice = ref('')
const formError = ref('')
const actionError = ref('')
const discard = ref(false)
const draft = ref<BillDraft>({ name: '', amount: 0, estimated: false, due_on: props.today, recurrence: 'once', category_code: 'bills', account_code: 'bank' })
let initial = ''
let previousOverflow: string | undefined
function showDialog(dialog: HTMLDialogElement | null) {
  if (!dialog || dialog.open) return
  dialog.showModal()
  if (previousOverflow === undefined) previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}
function restoreScroll() {
  if (editor.value?.open || confirmation.value?.open || previousOverflow === undefined) return
  document.body.style.overflow = previousOverflow
  previousOverflow = undefined
}
function closeDialogs() {
  editor.value?.close()
  confirmation.value?.close()
  restoreScroll()
}
const walletOptions = computed(() => noteAccounts.filter(w => w.id !== 'savings' && (props.activeAccounts.includes(w.id) || w.id === editing.value?.account_code)))
const categoryOptions = computed(() => props.catalog.expense.filter(c => !c.archived || c.id === editing.value?.category_code))
function open(bill?: Bill) {
  editing.value = bill ? { ...bill } : undefined
  draft.value = bill ? { name: bill.name, amount: bill.amount, estimated: bill.estimated, due_on: bill.due_on, recurrence: bill.recurrence, category_code: bill.category_code, account_code: bill.account_code }
    : { name: '', amount: 0, estimated: false, due_on: props.today, recurrence: 'once', category_code: categoryOptions.value.find(c => c.id === 'bills')?.id ?? categoryOptions.value[0]?.id ?? '', account_code: walletOptions.value[0]?.id ?? '' }
  initial = JSON.stringify(draft.value); formError.value = ''; discard.value = false
  showDialog(editor.value)
}
function close() {
  if (busy.value) return
  if (JSON.stringify(draft.value) !== initial) {
    discard.value = true
    nextTick(() => editor.value?.querySelector('.discard-prompt')?.scrollIntoView({ block: 'nearest' }))
  }
  else editor.value?.close()
}
async function submit() {
  formError.value = ''
  try {
    if (!categoryOptions.value.some(c => c.id === draft.value.category_code) || !walletOptions.value.some(w => w.id === draft.value.account_code)) throw new Error('Pilih kategori dan dompet yang tersedia.')
    if (await save(draft.value, editing.value)) { editor.value?.close(); notice.value = 'Pengingat tagihan tersimpan.' }
  } catch (reason) { formError.value = (reason as Error).message }
}
function ask(bill: Bill, next: 'paid' | 'delete') {
  selected.value = { ...bill }; action.value = next; actionError.value = ''; showDialog(confirmation.value)
}
async function confirm() {
  if (!selected.value) return
  try {
    const success = action.value === 'paid' ? await complete(selected.value) : await remove(selected.value)
    if (success) { confirmation.value?.close(); notice.value = action.value === 'paid' ? 'Ditandai lunas. Saldo dan catatan pengeluaran tidak berubah.' : 'Pengingat dihapus.' }
  } catch (reason) { actionError.value = (reason as Error).message }
}
watch(owner, () => { closeDialogs(); notice.value = ''; tab.value = 'pending' })
onBeforeUnmount(closeDialogs)
const route = useRoute()
const router = useRouter()
onMounted(() => watch([() => route.query.bill, items, loading, () => props.ready], async () => {
  const id = route.query.bill
  if (typeof id !== 'string' || loading.value || error.value || !props.ready || !editor.value) return
  const bill = items.value.find(item => item.id === id)
  if (bill?.status === 'pending') open(bill)
  else notice.value = 'Pengingat sudah selesai atau tidak tersedia.'
  const query = { ...route.query }; delete query.bill
  await router.replace({ query })
}, { immediate: true, flush: 'post' }))
</script>

<template>
  <section class="widget-card bills-card" aria-labelledby="bills-title">
    <div class="section-heading"><h2 id="bills-title">Tagihan Mendatang</h2><button type="button" :disabled="!ready || loading || busy || !!error" @click="open()">Tambah tagihan</button></div>
    <p class="explanation">Pengingat saja. Menandai lunas tidak mengurangi saldo atau membuat catatan pengeluaran.</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" :disabled="busy || loading" @click="refresh">Muat ulang</button></p>
    <p v-else-if="loading" role="status">Memuat tagihan...</p>
    <div v-show="!loading && !error">
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="urgent" class="bill-reminder" role="status"><span aria-hidden="true">⚠</span> {{ urgent }} tagihan terlambat atau jatuh tempo dalam 3 hari.</p>
      <p class="bill-total">Total belum lunas: <strong>{{ formatRupiah(total) }}</strong><small v-if="pending.some(b => b.estimated)">Termasuk nominal perkiraan.</small></p>
      <div class="bill-tabs" aria-label="Status tagihan"><button type="button" :aria-pressed="tab === 'pending'" @click="tab = 'pending'">Belum lunas</button><button type="button" :aria-pressed="tab === 'paid'" @click="tab = 'paid'">Lunas</button></div>
      <CardPagination :items="visible" label="Tagihan Mendatang" :reset-key="owner + tab" v-slot="{ items: bills }">
        <ul v-if="bills.length" class="reminder-list">
          <li v-for="bill in bills" :key="bill.id" class="reminder-item">
            <div class="bill-title"><strong>{{ bill.name }}</strong><span class="bill-status" :class="billStatus(bill, today).tone">{{ billStatus(bill, today).label }}</span></div>
            <p>{{ formatRupiah(bill.amount) }}{{ bill.estimated ? ' (perkiraan)' : '' }}</p>
            <p class="bill-meta">{{ new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(bill.due_on + 'T12:00:00')) }} · {{ bill.recurrence === 'monthly' ? 'Bulanan' : 'Sekali bayar' }}</p>
            <p class="bill-meta">{{ catalog.expense.find(c => c.id === bill.category_code)?.label ?? 'Kategori tidak tersedia' }} · {{ noteAccounts.find(w => w.id === bill.account_code)?.label }}</p>
            <div class="bill-actions"><template v-if="bill.status === 'pending'"><button type="button" :disabled="busy || !ready" @click="open(bill)">Ubah</button><button type="button" :disabled="busy" @click="ask(bill, 'paid')">Tandai lunas</button></template><button type="button" :disabled="busy" @click="ask(bill, 'delete')">Hapus</button></div>
          </li>
        </ul>
        <p v-else>{{ tab === 'pending' ? 'Belum ada tagihan mendatang.' : 'Belum ada tagihan yang ditandai lunas.' }}</p>
      </CardPagination>
    </div>
    <dialog ref="editor" class="bill-dialog bill-editor" :aria-label="editing ? 'Ubah tagihan' : 'Tambah tagihan'" @cancel.prevent="close" @close="restoreScroll">
      <header class="bill-header"><h2>{{ editing ? 'Ubah tagihan' : 'Tambah tagihan' }}</h2></header>
      <form class="bill-form" :aria-busy="busy" @submit.prevent="submit">
        <div class="bill-fields">
        <fieldset :disabled="busy"><label>Nama tagihan<input v-model="draft.name" maxlength="80" required autofocus></label>
        <label>Nominal (Rp)<input v-model.number="draft.amount" type="number" min="1" max="999999999999" step="1" required></label>
        <label class="check"><input v-model="draft.estimated" type="checkbox">Nominal perkiraan</label>
        <label>Jatuh tempo<input v-model="draft.due_on" type="date" min="1900-01-01" max="9998-12-31" required></label>
        <label>Pengulangan<select v-model="draft.recurrence"><option value="once">Sekali bayar</option><option value="monthly">Bulanan</option></select></label>
        <label>Kategori pengeluaran<select v-model="draft.category_code" required><option v-for="c in categoryOptions" :key="c.id" :value="c.id">{{ c.label }}</option></select></label>
        <label>Dompet pembayaran<select v-model="draft.account_code" required><option v-for="wallet in walletOptions" :key="wallet.id" :value="wallet.id">{{ wallet.label }}</option></select></label>
        <p v-if="draft.recurrence === 'monthly'">Pengingat bulan berikutnya dibuat saat tagihan ini ditandai lunas. Tanggal akhir bulan menyesuaikan kalender.</p>
        <p v-if="formError" role="alert">{{ formError }}</p>
        <div v-if="discard" class="discard-prompt" role="alert"><p>Buang perubahan yang belum disimpan?</p><button type="button" @click="editor?.close()">Buang perubahan</button><button type="button" @click="discard = false">Lanjut edit</button></div>
        </fieldset>
        </div>
        <footer class="bill-footer bill-actions"><button type="button" :disabled="busy" @click="close">Batal</button><button type="submit" :disabled="busy">{{ busy ? 'Menyimpan…' : 'Simpan tagihan' }}</button></footer>
      </form>
    </dialog>
    <dialog ref="confirmation" class="bill-dialog" :aria-label="action === 'paid' ? 'Konfirmasi lunas' : 'Hapus tagihan'" @cancel.prevent="!busy && confirmation?.close()" @close="restoreScroll">
      <h2>{{ action === 'paid' ? 'Tandai lunas?' : 'Hapus pengingat?' }}</h2><p>{{ selected?.name }}</p>
      <p>{{ action === 'paid' ? 'Ini hanya mengubah status pengingat. Saldo dan catatan pengeluaran tidak berubah.' : 'Pengingat ini akan dihapus. Saldo dompet tidak berubah.' }}</p>
      <p v-if="action === 'paid' && selected?.recurrence === 'monthly'">Pengingat bulan berikutnya akan dibuat otomatis.</p>
      <p v-if="actionError" role="alert">{{ actionError }}</p>
      <div class="bill-actions"><button type="button" :disabled="busy" @click="confirmation?.close()">Batal</button><button type="button" :disabled="busy" @click="confirm">{{ busy ? 'Menyimpan…' : action === 'paid' ? 'Ya, tandai lunas' : 'Ya, hapus' }}</button></div>
    </dialog>
  </section>
</template>

<style scoped>
.bills-card { min-width: 0; color: var(--ink); }
.section-heading, .bill-title, .bill-actions, .bill-tabs { display: flex; align-items: center; justify-content: space-between; gap: .5rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1rem; }
p { font-size: .8rem; line-height: 1.6; }
.explanation, .bill-meta { color: var(--muted); }
.bill-total small { display: block; }
.bill-reminder { padding: .75rem; border: 1px solid var(--warning); border-radius: .5rem; }
button { padding: .5rem .65rem; min-height: 2.75rem; border: 1px solid var(--line); border-radius: .5rem; background: var(--surface); color: var(--ink); font: inherit; font-size: .8rem; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
button[aria-pressed=true] { border-color: var(--teal); color: var(--teal); }
.reminder-list { list-style: none; padding: 0; margin: 1rem 0 0; }
.reminder-item { padding: 1rem 0; border-bottom: 1px solid var(--line); }
.bill-title strong { overflow-wrap: anywhere; }
.reminder-item p { margin: .4rem 0; }
.bill-actions { justify-content: flex-end; }
.bill-status { font-size: .7rem; border-radius: .4rem; padding: .25rem .5rem; }
.late { background: #7f1d1d; color: #fff; }.today { background: #9a3412; color: #fff; }.soon { background: #fde68a; color: #422006; }.paid { background: #065f46; color: #fff; }
.bill-dialog { width: min(30rem, calc(100vw - 2rem)); max-height: 85dvh; overflow-y: auto; box-sizing: border-box; border: 1px solid var(--line); border-radius: 1rem; padding: 1.5rem; background: var(--surface); color: var(--ink); }
.bill-dialog::backdrop { background: rgb(0 0 0 / 55%); }
.bill-editor { padding: 0; overflow: hidden; }
.bill-editor[open] { display: flex; flex-direction: column; }
.bill-header { flex: none; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--line); }
.bill-form { display: flex; flex-direction: column; min-height: 0; }
.bill-fields { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 1.25rem 1.5rem; }
.bill-footer { flex: none; padding: 1rem 1.5rem; border-top: 1px solid var(--line); background: var(--surface); }
fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: .9rem; }
label { display: grid; gap: .35rem; font-size: .85rem; }
input, select { min-width: 0; padding: .65rem; border: 1px solid var(--line); border-radius: .5rem; background: var(--surface); color: var(--ink); font: inherit; }
.check { display: flex; align-items: center; }
:is(button,input,select):focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
@media (max-width: 600px) {
  .bill-editor { width: 100%; max-width: 100%; max-height: 94dvh; margin: auto 0 0; border-bottom: 0; border-radius: 1.4rem 1.4rem 0 0; }
  .bill-header, .bill-fields { padding: 1rem 1.1rem; }
  .bill-footer { padding: .9rem 1.1rem max(.9rem, env(safe-area-inset-bottom)); }
}
</style>
