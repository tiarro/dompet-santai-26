<script setup lang="ts">
import { filterHistory, groupHistory, historyRange, historyTotals, validHistoryRange, type HistoryPeriod } from '~/utils/history'
import { localDate, noteAccounts, noteFingerprint, type MoneyNote, type NoteType } from '~/utils/notes'
import type { CategoryCatalog } from '~/utils/categories'
import { formatRupiah } from '~/utils/currency'
import ReceiptViewer from './ReceiptViewer.vue'
const props = defineProps<{
  notes: MoneyNote[]; catalog: CategoryCatalog; today: string; ready: boolean; error: string
  remove: (note: MoneyNote) => void
}>()
const emit = defineEmits<{ edit: [note: MoneyNote]; add: []; deleted: [note: MoneyNote] }>()
const period = ref<HistoryPeriod>('this-month')
const query = ref('')
const type = ref<NoteType | ''>('')
const account = ref('')
const category = ref('')
const from = ref(props.today.slice(0, 7) + '-01')
const to = ref(props.today)
const filtersOpen = ref(false)
const visibleCount = ref(50)
const range = computed(() => period.value === 'custom' ? { from: from.value, to: to.value } : historyRange(period.value, props.today))
const rangeValid = computed(() => validHistoryRange(range.value.from, range.value.to, props.today))
const filtered = computed(() => rangeValid.value ? filterHistory(props.notes, {
  query: query.value, type: type.value, account: account.value, category: category.value, ...range.value,
}, props.catalog) : [])
const totals = computed(() => historyTotals(filtered.value))
const groups = computed(() => groupHistory(filtered.value.slice(0, visibleCount.value)))
const categoryOptions = computed(() => (['expense', 'income'] as const).flatMap(kind =>
  !type.value || type.value === kind ? props.catalog[kind].map(item => ({ value: kind + ':' + item.id, label: item.label + ' (' + (kind === 'expense' ? 'Pengeluaran' : 'Pemasukan') + ')' })) : []))
const periodLabels = { 'this-month': 'Bulan ini', 'last-month': 'Bulan sebelumnya', custom: 'Rentang tanggal', all: 'Semua tanggal' }
const activeFilters = computed(() => [
  ...(period.value !== 'this-month' ? [{ key: 'period', label: periodLabels[period.value] + (period.value === 'custom' ? ': ' + from.value + ' - ' + to.value : '') }] : []),
  ...(query.value ? [{ key: 'query', label: 'Cari: ' + query.value }] : []),
  ...(type.value ? [{ key: 'type', label: type.value === 'expense' ? 'Pengeluaran' : 'Pemasukan' }] : []),
  ...(account.value ? [{ key: 'account', label: noteAccounts.find(item => item.id === account.value)?.label ?? account.value }] : []),
  ...(category.value ? [{ key: 'category', label: categoryOptions.value.find(item => item.value === category.value)?.label ?? category.value }] : []),
])
function clearFilter(key: string) {
  if (key === 'period') period.value = 'this-month'
  if (key === 'query') query.value = ''
  if (key === 'type') type.value = ''
  if (key === 'account') account.value = ''
  if (key === 'category') category.value = ''
}
function resetFilters() {
  period.value = 'this-month'; query.value = ''; type.value = ''; account.value = ''; category.value = ''
  from.value = props.today.slice(0, 7) + '-01'; to.value = props.today
}
watch(type, () => {
  if (category.value && !categoryOptions.value.some(item => item.value === category.value)) category.value = ''
})
watch([query, type, account, category, period, from, to], () => { visibleCount.value = 50 })
function categoryFor(note: MoneyNote) {
  return props.catalog[note.type].find(item => item.id === note.category) ?? { label: 'Kategori tidak tersedia', icon: 'category' }
}
function dateLabel(date: string) {
  if (date === props.today) return 'Hari ini'
  const yesterday = new Date(props.today + 'T12:00:00')
  yesterday.setDate(yesterday.getDate() - 1)
  if (date === localDate(yesterday)) return 'Kemarin'
  return fullDate(date)
}
function fullDate(date: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date + 'T12:00:00'))
}
const detailDialog = ref<HTMLDialogElement | null>(null)
const receiptViewer = ref<InstanceType<typeof ReceiptViewer> | null>(null)
const detail = ref<MoneyNote | null>(null)
const confirmDelete = ref(false)
const deleteError = ref('')
const busy = ref(false)
const notice = ref('')
const pageNotice = ref('')
const stale = computed(() => {
  if (!detail.value) return false
  const latest = props.notes.find(note => note.id === detail.value?.id)
  return !latest || noteFingerprint(latest) !== noteFingerprint(detail.value)
})
let previousOverflow = ''
let previousScroll = 0
let returnFocus: HTMLElement | null = null
async function openDetail(note: MoneyNote) {
  detail.value = { ...note }
  confirmDelete.value = false; deleteError.value = ''; notice.value = ''
  previousScroll = window.scrollY
  returnFocus = document.activeElement as HTMLElement | null
  await nextTick()
  if (!detail.value || !detailDialog.value) return
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  detailDialog.value.showModal()
}
function closeDetail(restore = true) {
  receiptViewer.value?.close()
  if (detailDialog.value?.open) {
    detailDialog.value.close()
    document.body.style.overflow = previousOverflow
    if (restore) nextTick(() => {
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
      window.scrollTo({ top: previousScroll, behavior: 'instant' })
    })
  }
  detail.value = null
}
function afterUpdate(note: MoneyNote) {
  if (detail.value?.id === note.id) {
    detail.value = { ...note }; notice.value = 'Catatan berhasil diperbarui.'
    pageNotice.value = 'Catatan berhasil diperbarui.'
    confirmDelete.value = false; deleteError.value = ''
  }
}
function deleteNote() {
  if (!detail.value || busy.value || stale.value || !props.ready) return
  busy.value = true; deleteError.value = ''
  const original = detail.value
  try {
    props.remove(original)
    closeDetail()
    pageNotice.value = 'Catatan berhasil dihapus.'
    emit('deleted', original)
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : 'Catatan belum terhapus. Coba lagi.'
  } finally { busy.value = false }
}
onBeforeUnmount(() => closeDetail(false))
defineExpose({ afterUpdate, close: () => closeDetail(false) })
</script>

<template>
  <section class="history-page">
    <header class="history-heading"><div><p class="eyebrow">Setiap catatan punya cerita</p><h2>Riwayat</h2><p>Telusuri pemasukan dan pengeluaranmu, satu per satu.</p></div><span class="local-label">Tersimpan di browser ini</span></header>
    <slot name="notification" />
    <div class="history-toolbar">
      <div class="field period-field"><label for="history-period">Periode riwayat</label><select id="history-period" v-model="period"><option v-for="(label, value) in periodLabels" :key="value" :value="value">{{ label }}</option></select></div>
      <div class="field search-field"><label for="history-search">Cari transaksi</label><input id="history-search" v-model="query" type="search" placeholder="Keterangan atau kategori" maxlength="120"></div>
      <button class="secondary filter-toggle" :aria-expanded="filtersOpen" aria-controls="history-filters" @click="filtersOpen = !filtersOpen"><span class="material-symbols-outlined" aria-hidden="true">tune</span>Filter<span v-if="type || account || category" class="filter-dot" /></button>
    </div>
    <div v-if="period === 'custom'" class="date-range"><div class="field"><label for="history-from">Dari tanggal</label><input id="history-from" v-model="from" type="date" min="1900-01-01" :max="today"></div><div class="field"><label for="history-to">Sampai tanggal</label><input id="history-to" v-model="to" type="date" min="1900-01-01" :max="today"></div></div>
    <div id="history-filters" class="history-filters" :class="{ 'filters-open': filtersOpen }">
      <div class="field"><label for="history-type">Jenis transaksi</label><select id="history-type" v-model="type"><option value="">Semua jenis</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></div>
      <div class="field"><label for="history-account">Dompet</label><select id="history-account" v-model="account"><option value="">Semua dompet</option><option v-for="item in noteAccounts" :key="item.id" :value="item.id">{{ item.label }}</option></select></div>
      <div class="field"><label for="history-category">Kategori transaksi</label><select id="history-category" v-model="category"><option value="">Semua kategori</option><option v-for="item in categoryOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></div>
    </div>
    <div v-if="activeFilters.length" class="active-filters" aria-label="Filter aktif"><button v-for="filter in activeFilters" :key="filter.key" class="filter-chip" :aria-label="'Hapus filter ' + filter.label" @click="clearFilter(filter.key)">{{ filter.label }}<span aria-hidden="true">&times;</span></button><button class="text-button" @click="resetFilters">Reset Filter</button></div>
    <p v-if="pageNotice" class="success" role="status">{{ pageNotice }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!ready" role="status">Memuat riwayat...</p>
    <p v-else-if="!rangeValid" class="error" role="alert">Pilih rentang tanggal yang valid sampai hari ini. Tanggal awal harus sebelum atau sama dengan tanggal akhir.</p>
    <template v-else>
      <div class="history-summary" aria-label="Ringkasan riwayat">
        <article class="income"><span>Pemasukan</span><strong>{{ formatRupiah(totals.income) }}</strong></article>
        <article><span>Pengeluaran</span><strong>{{ formatRupiah(totals.expense) }}</strong></article>
        <article><span>Selisih</span><strong :class="{ negative: totals.net < 0 }">{{ totals.net < 0 ? '\u2212' : '' }}{{ formatRupiah(Math.abs(totals.net)) }}</strong><small>Pemasukan dikurangi pengeluaran</small></article>
      </div>
      <p class="summary-caption">Ringkasan mengikuti periode, pencarian, dan filter aktif. Selisih berbeda dari saldo dompet.</p>
      <div class="list-heading"><h3>Daftar transaksi</h3><span>{{ filtered.length }} catatan</span></div>
      <template v-if="filtered.length">
        <section v-for="group in groups" :key="group.date" class="history-group"><h4>{{ dateLabel(group.date) }}</h4><ul>
          <li v-for="note in group.notes" :key="note.id">
            <button class="history-row" :aria-label="'Lihat transaksi ' + (note.description || categoryFor(note).label) + ', ' + fullDate(note.date)" @click="openDetail(note)">
              <span class="transaction-icon material-symbols-outlined" aria-hidden="true">{{ categoryFor(note).icon }}</span>
              <span class="transaction-copy"><strong>{{ note.description || categoryFor(note).label }}</strong><span>{{ categoryFor(note).label }} &middot; {{ noteAccounts.find(item => item.id === note.account)?.label }}<span v-if="note.receipt" class="receipt-label"><span class="material-symbols-outlined" aria-hidden="true">attach_file</span>Struk</span></span></span>
              <span class="transaction-amount" :class="{ income: note.type === 'income' }"><span class="sr-only">{{ note.type === 'income' ? 'Pemasukan' : 'Pengeluaran' }}</span>{{ note.type === 'income' ? '+' : '\u2212' }}{{ formatRupiah(note.amount) }}</span>
              <span class="row-arrow material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
          </li>
        </ul></section>
        <button v-if="filtered.length > visibleCount" class="secondary load-more" @click="visibleCount += 50">Tampilkan lebih banyak ({{ visibleCount }} dari {{ filtered.length }})</button>
      </template>
      <div v-else class="history-empty"><span class="material-symbols-outlined" aria-hidden="true">{{ notes.length ? 'search_off' : 'history' }}</span><h3>{{ notes.length ? 'Tidak ada transaksi yang cocok' : 'Belum ada riwayat' }}</h3><p>{{ notes.length ? 'Coba periode lain atau reset filter untuk melihat catatanmu.' : 'Mulai dari satu catatan pemasukan atau pengeluaran.' }}</p><button v-if="notes.length" class="secondary" @click="resetFilters">Reset Filter</button><button v-else class="primary" @click="emit('add')">Tambah Catatan</button></div>
    </template>
    <dialog ref="detailDialog" class="history-detail" aria-label="Detail Transaksi" @cancel.prevent="closeDetail()">
      <template v-if="detail">
        <header class="detail-header"><h2>Detail Transaksi</h2><button class="icon-button" aria-label="Tutup detail transaksi" autofocus @click="closeDetail()"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></header>
        <p class="detail-kind">{{ detail.type === 'income' ? 'Pemasukan' : 'Pengeluaran' }}</p>
        <p class="detail-amount" :class="{ income: detail.type === 'income' }">{{ detail.type === 'income' ? '+' : '\u2212' }}{{ formatRupiah(detail.amount) }}</p>
        <dl><div><dt>Kategori</dt><dd>{{ categoryFor(detail).label }}</dd></div><div><dt>{{ detail.type === 'income' ? 'Masuk ke' : 'Bayar dari' }}</dt><dd>{{ noteAccounts.find(item => item.id === detail?.account)?.label }}</dd></div><div><dt>Tanggal</dt><dd>{{ fullDate(detail.date) }}</dd></div><div><dt>Keterangan</dt><dd>{{ detail.description || 'Tanpa keterangan' }}</dd></div></dl>
        <button v-if="detail.receipt" class="receipt-button" @click="receiptViewer?.open(detail.receipt)"><img :src="detail.receipt.dataUrl" alt="Foto struk transaksi"><span><span class="material-symbols-outlined" aria-hidden="true">zoom_in</span>Lihat struk</span></button>
        <p v-if="notice" class="success" role="status">{{ notice }}</p>
        <p v-if="stale" class="error" role="alert">Catatan sudah berubah atau dihapus. Tutup detail lalu buka kembali dari daftar terbaru.</p>
        <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
        <div v-if="confirmDelete" class="delete-confirmation" role="group" aria-label="Konfirmasi hapus catatan"><h3>Hapus catatan ini?</h3><p>{{ detail.description || categoryFor(detail).label }} &middot; {{ formatRupiah(detail.amount) }} &middot; {{ fullDate(detail.date) }}.</p><p>Saldo dompet dan anggaran akan dihitung ulang. Catatan dan struknya akan dihapus.</p><div class="detail-actions"><button class="secondary" :disabled="busy" @click="confirmDelete = false; deleteError = ''">Batal hapus</button><button class="danger-button" :disabled="busy || stale || !ready" @click="deleteNote">{{ busy ? 'Menghapus...' : 'Ya, Hapus Catatan' }}</button></div></div>
        <div v-else class="detail-actions"><button class="primary" :disabled="stale || !ready" @click="emit('edit', detail)">Ubah Catatan</button><button class="secondary danger-text" :disabled="stale || !ready" @click="confirmDelete = true; deleteError = ''; notice = ''">Hapus Catatan</button></div>
      </template>
    </dialog>
    <ReceiptViewer ref="receiptViewer" />
  </section>
</template>

<style scoped>
.history-page { color: var(--ink); }
h2, h3, h4, p { margin: 0; }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--teal); outline-offset: 3px; }
.history-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.7rem; }
.history-heading h2 { margin: .35rem 0 .6rem; font-size: clamp(1.8rem, 4vw, 2.4rem); letter-spacing: -.04em; }
.history-heading p { color: var(--muted); font-size: .85rem; line-height: 1.6; }
.history-heading .eyebrow { color: var(--teal); font-size: .7rem; font-weight: 800; letter-spacing: .04em; }
.local-label { flex: none; color: var(--muted); font-size: .7rem; border: 1px solid var(--line); padding: .4rem .65rem; border-radius: 999px; }
.history-toolbar { display: grid; grid-template-columns: minmax(10rem, 1fr) minmax(12rem, 2fr); gap: 1rem; align-items: end; }
.field { display: grid; gap: .5rem; min-width: 0; }
.field label { color: var(--muted); font-size: .75rem; font-weight: 700; }
input, select { width: 100%; min-width: 0; min-height: 2.8rem; padding: .65rem .8rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--surface); color: var(--ink); font-size: .8rem; }
.history-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 1rem; }
.date-range { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1rem; }
.primary, .secondary, .danger-button { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; min-height: 2.75rem; padding: .65rem 1rem; border-radius: .65rem; font-size: .8rem; font-weight: 800; }
.primary { color: white; background: #006a61; border: 1px solid #006a61; }
.secondary { color: var(--ink); background: var(--surface); border: 1px solid var(--line); }
.filter-toggle { display: none; }
.filter-dot { width: .4rem; height: .4rem; background: var(--teal); border-radius: 50%; }
.active-filters { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin: 1rem 0; }
.filter-chip { display: inline-flex; align-items: center; gap: .6rem; max-width: 100%; padding: .4rem .65rem; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); font-size: .72rem; overflow-wrap: anywhere; }
.filter-chip span { font-size: 1rem; }
.text-button { border: 0; padding: .5rem; color: var(--teal); background: transparent; font-size: .75rem; font-weight: 800; }
.history-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 1.5rem; }
.history-summary article { padding: 1.3rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--surface); min-width: 0; }
.history-summary article:first-child { background: color-mix(in srgb, var(--teal) 7%, var(--surface)); }
.history-summary span { display: block; color: var(--muted); font-size: .75rem; }
.history-summary strong { display: block; margin-top: .6rem; font-size: clamp(1.1rem, 2vw, 1.7rem); letter-spacing: -.04em; overflow-wrap: anywhere; }
.history-summary small { display: block; color: var(--muted); margin-top: .3rem; font-size: .65rem; }
.summary-caption { margin-top: .7rem; color: var(--muted); font-size: .7rem; line-height: 1.6; }
.income { color: var(--teal); }
.negative, .error, .danger-text { color: var(--danger); }
.error { margin: 1rem 0; font-size: .8rem; line-height: 1.6; }
.success { margin-top: 1rem; color: var(--teal); font-size: .8rem; }
.list-heading { display: flex; justify-content: space-between; align-items: center; margin: 1.8rem 0 1rem; gap: .5rem; }
.list-heading h3 { font-size: 1rem; }
.list-heading span { font-size: .75rem; color: var(--muted); }
.history-group { margin-top: 1.2rem; }
.history-group h4 { margin-bottom: .6rem; font-size: .76rem; color: var(--muted); }
.history-group ul { padding: 0; margin: 0; list-style: none; border: 1px solid var(--line); border-radius: 1rem; background: var(--surface); overflow: hidden; }
.history-group li + li { border-top: 1px solid var(--line); }
.history-row { scroll-margin-block: 6rem 12rem; display: flex; align-items: center; gap: .85rem; width: 100%; padding: 1rem; color: var(--ink); background: transparent; border: 0; text-align: left; }
.history-row:hover { background: color-mix(in srgb, var(--teal) 5%, var(--surface)); }
.history-row:focus-visible { outline-offset: -3px; }
.transaction-icon { display: grid; flex: none; place-items: center; width: 2.6rem; height: 2.6rem; background: color-mix(in srgb, var(--teal) 10%, var(--surface)); color: var(--teal); border-radius: .75rem; font-size: 1.2rem; }
.transaction-copy { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.transaction-copy > strong { display: block; font-size: .84rem; }
.transaction-copy > span { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; margin-top: .4rem; color: var(--muted); font-size: .71rem; line-height: 1.5; }
.receipt-label { display: inline-flex; align-items: center; gap: .1rem; }
.receipt-label .material-symbols-outlined { font-size: .9rem; }
.transaction-amount { flex: none; font-size: .9rem; font-weight: 800; }
.row-arrow { color: var(--muted); font-size: 1.2rem; }
.load-more { display: flex; margin: 1rem auto 0; }
.history-empty { padding: 3rem 1rem; margin-top: 1rem; background: var(--surface); border: 1px dashed var(--line); border-radius: 1rem; text-align: center; }
.history-empty > span { font-size: 2.8rem; color: var(--teal); }
.history-empty h3 { margin: 1rem 0 .65rem; font-size: 1.1rem; }
.history-empty p { color: var(--muted); font-size: .82rem; line-height: 1.6; margin-bottom: 1rem; }
.history-detail { width: min(34rem, calc(100vw - 2rem)); max-width: 100vw; max-height: 92dvh; margin: auto; box-sizing: border-box; padding: 1.5rem; border: 1px solid var(--line); border-radius: 1.1rem; color: var(--ink); background: var(--surface); box-shadow: 0 1.5rem 5rem rgb(0 0 0 / 20%); }
.history-detail::backdrop { background: rgb(12 24 22 / 55%); backdrop-filter: blur(4px); }
.detail-header { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
.detail-header h2 { font-size: 1.15rem; }
.icon-button { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border: 0; background: transparent; color: var(--muted); border-radius: 50%; }
.detail-kind { margin-top: 1rem; color: var(--muted); font-size: .8rem; }
.detail-amount { margin: .6rem 0 1.3rem; font-size: 2rem; font-weight: 800; letter-spacing: -.04em; overflow-wrap: anywhere; }
dl { margin: 0; }
dl > div { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: 1rem; padding: .8rem 0; border-top: 1px solid var(--line); font-size: .82rem; }
dt { color: var(--muted); }
dd { margin: 0; text-align: right; font-weight: 600; overflow-wrap: anywhere; }
.receipt-button { display: grid; width: 100%; margin-top: 1rem; padding: .5rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--canvas); color: var(--teal); }
.receipt-button img { max-width: 100%; max-height: 9rem; margin: auto; object-fit: contain; border-radius: .4rem; }
.receipt-button > span { display: flex; align-items: center; justify-content: center; gap: .3rem; padding: .5rem; font-size: .8rem; font-weight: 800; }
.detail-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .6rem; margin-top: 1.5rem; }
.danger-button { color: white; background: #ba1a1a; border: 1px solid #ba1a1a; }
.delete-confirmation { margin-top: 1.3rem; padding: 1rem; border: 1px solid var(--line); border-radius: .8rem; background: var(--canvas); }
.delete-confirmation h3 { font-size: .9rem; }
.delete-confirmation p { margin-top: .6rem; color: var(--muted); font-size: .78rem; line-height: 1.6; overflow-wrap: anywhere; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
html.theme-dark :is(input, select) { color-scheme: dark; }
html.theme-dark :is(.income, .transaction-icon, .text-button, .success, .receipt-button), html.theme-dark .history-heading .eyebrow { color: #74d9cb; }
@media (max-width: 640px) {
  .history-heading { align-items: flex-start; flex-direction: column; }
  .history-toolbar { grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; }
  .period-field { grid-column: 1 / -1; }
  .filter-toggle { display: inline-flex; }
  .history-filters { display: none; grid-template-columns: 1fr; padding: 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: .8rem; }
  .history-filters.filters-open { display: grid; }
  .history-summary { grid-template-columns: 1fr 1fr; gap: .65rem; }
  .history-summary article { padding: 1rem; }
  .history-summary article:last-child { grid-column: 1 / -1; }
  .history-summary strong { font-size: 1.25rem; }
  .history-row { flex-wrap: wrap; gap: .65rem; padding: .9rem; }
  .transaction-copy { flex-basis: calc(100% - 3.5rem); }
  .transaction-amount { margin-left: 3.25rem; }
  .row-arrow { margin-left: auto; }
  .history-detail { width: 100%; margin: auto 0 0; border-radius: 1.2rem 1.2rem 0 0; padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }
}
</style>

