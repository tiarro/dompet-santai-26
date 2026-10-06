<script setup lang="ts">
import CategoryCreator from './CategoryCreator.vue'
import type { CategoryCatalog, SaveCategory } from '~/utils/categories'
import { categoryExpenses, expenseBudgetError, type MonthlyBudget } from '~/utils/budgets'
import ReceiptCamera from '~/components/ReceiptCamera.vue'
import ReceiptViewer from '~/components/ReceiptViewer.vue'
import { prepareReceipt, receiptAccept, type ReceiptAttachment } from '~/utils/receipts'
import { formatRupiah } from '~/utils/currency'
import { getAccountBalances, isNoteDraft, localDate, maxNoteAmount, reviseNote, noteAccounts, validNoteDate, type MoneyNote, type NoteDraft, type NoteType } from '~/utils/notes'

const props = defineProps<{
  catalog: CategoryCatalog
  saveCategory: SaveCategory
  categoriesReady: boolean
  save: (draft: NoteDraft) => MoneyNote
  update?: (original: MoneyNote, draft: NoteDraft) => MoneyNote
  ready: boolean
  accounts: Array<{ id: string; label: string; icon: string; balance: number }>
  defaultAccount?: string
  budgets?: MonthlyBudget[]
  budgetsReady: boolean
  budgetError?: string
  notes?: MoneyNote[]
}>()
const emit = defineEmits<{ saved: [note: MoneyNote]; updated: [note: MoneyNote] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const amountInput = ref<HTMLInputElement | null>(null)
const categoryInputs = ref<HTMLInputElement[]>([])
const dateInput = ref<HTMLInputElement | null>(null)
const editing = ref<MoneyNote | null>(null)
let initialEditDraft = ''
const type = ref<NoteType>('expense')
const amountText = ref('')
const category = ref('')
const categoryCreator = ref<InstanceType<typeof CategoryCreator> | null>(null)
const categoryDraftDirty = ref(false)
const categoryCreating = ref(false)
const account = ref('')
const accountManuallySelected = ref(false)
const date = ref(localDate())
const description = ref('')
const receipt = ref<ReceiptAttachment>()
const receiptBusy = ref(false)
const receiptError = ref('')
const receiptFile = ref<HTMLInputElement | null>(null)
const receiptCamera = ref<InstanceType<typeof ReceiptCamera> | null>(null)
const receiptPreview = ref<HTMLElement | null>(null)
const receiptViewer = ref<InstanceType<typeof ReceiptViewer> | null>(null)
let receiptLoad = 0

function removeReceipt() {
  receiptLoad++
  receiptViewer.value?.close()
  receipt.value = undefined
  receiptBusy.value = false
  receiptError.value = ''
  if (receiptFile.value) receiptFile.value.value = ''
  receiptCamera.value?.close()
}

async function selectReceipt(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await attachReceipt(file)
}

async function attachReceipt(file: File) {
  const load = ++receiptLoad
  receiptBusy.value = true
  receiptError.value = ''
  try {
    const photo = await prepareReceipt(file)
    if (load !== receiptLoad) return
    receipt.value = photo
    await nextTick()
    if (load === receiptLoad) receiptPreview.value?.scrollIntoView({ block: 'nearest' })
  } catch (error) {
    if (load === receiptLoad) receiptError.value = error instanceof Error ? error.message : 'Foto belum bisa dibaca. Silakan coba lagi.'
  } finally {
    if (load === receiptLoad) receiptBusy.value = false
  }
}
const attempted = ref(false)
const saving = ref(false)
const saveError = ref('')
const confirmDiscard = ref(false)
const today = ref(localDate())
const categories = computed(() => props.catalog[type.value])
const amount = computed(() => /^\d[\d.]*$/.test(amountText.value) ? Number(amountText.value.replaceAll('.', '')) : NaN)
const formAccounts = computed(() => {
  if (!editing.value || props.accounts.some(item => item.id === editing.value?.account)) return props.accounts
  const originalAccount = noteAccounts.find(item => item.id === editing.value?.account)
  return originalAccount ? [...props.accounts, { ...originalAccount, balance: getAccountBalances(props.notes ?? [], today.value)[originalAccount.id] ?? 0 }] : props.accounts
})
const fallbackAccount = computed(() => props.accounts.some(item => item.id === props.defaultAccount)
  ? props.defaultAccount! : (props.accounts[0]?.id ?? ''))
const budgetAccount = computed(() => !editing.value && type.value === 'expense' && validNoteDate(date.value)
  ? props.budgets?.find(item => item.category === category.value && item.month === date.value.slice(0, 7))?.defaultAccount
  : undefined)
const availableBudgetAccount = computed(() => props.accounts.find(item => item.id === budgetAccount.value))
const suggestedAccount = computed(() => availableBudgetAccount.value?.id ?? fallbackAccount.value)
watch(suggestedAccount, value => {
  if (dialog.value?.open && !editing.value && !accountManuallySelected.value) account.value = value
})
const selectedAccount = computed(() => formAccounts.value.find(item => item.id === account.value))
const validAmount = computed(() => Number.isSafeInteger(amount.value) && amount.value > 0 && amount.value <= maxNoteAmount)
const insufficientFunds = computed(() => props.ready && !editing.value && type.value === 'expense' && validAmount.value
  && !!selectedAccount.value && amount.value > selectedAccount.value.balance)
const requiredBudgetError = computed(() => {
  if (type.value !== 'expense') return ''
  if (!props.budgetsReady) return props.budgetError || 'Menyiapkan anggaran sebelum pengeluaran dapat disimpan.'
  return expenseBudgetError({ type: type.value, category: category.value, date: date.value }, props.budgets ?? [])
})
const budgetOverage = computed(() => {
  if (type.value !== 'expense' || !validAmount.value || !validNoteDate(date.value)) return 0
  const budget = props.budgets?.find(item => item.category === category.value && item.month === date.value.slice(0, 7))
  if (!budget) return 0
  const spent = categoryExpenses((props.notes ?? []).filter(note => note.id !== editing.value?.id), budget.month, budget.category, today.value).reduce((sum, note) => sum + note.amount, 0)
  return Math.max(0, spent + amount.value - budget.limit)
})
const balanceBeforeDraft = computed(() => (selectedAccount.value?.balance ?? 0) + (
  editing.value && editing.value.account === account.value && editing.value.date <= today.value
    ? (editing.value.type === 'expense' ? editing.value.amount : -editing.value.amount) : 0
))
const remainingBalance = computed(() => balanceBeforeDraft.value + (type.value === 'income' ? amount.value : -amount.value))
const amountError = computed(() => attempted.value && (!Number.isSafeInteger(amount.value) || amount.value <= 0 || amount.value > maxNoteAmount))
const categoryError = computed(() => attempted.value && !categories.value.some(item => item.id === category.value))
const dateError = computed(() => attempted.value && (!validNoteDate(date.value) || date.value > today.value))
function currentDraft(): NoteDraft {
  return { type: type.value, amount: amount.value, category: category.value, account: account.value,
    date: date.value, description: description.value.trim(), ...(receipt.value ? { receipt: receipt.value } : {}) }
}
const draftSnapshot = () => JSON.stringify([type.value, amountText.value, category.value, account.value, date.value, description.value, receipt.value?.name, receipt.value?.dataUrl])
const revisionError = computed(() => {
  if (!editing.value || !props.ready || !isNoteDraft(currentDraft(), props.catalog) || date.value > today.value) return ''
  try { reviseNote(props.notes ?? [], editing.value, currentDraft(), today.value, props.catalog); return '' }
  catch (error) { return error instanceof Error ? error.message : 'Perubahan belum dapat disimpan.' }
})
const dirty = computed(() => editing.value
  ? categoryDraftDirty.value || receiptBusy.value || draftSnapshot() !== initialEditDraft
  : categoryDraftDirty.value || accountManuallySelected.value || !!receipt.value || receiptBusy.value || !!amountText.value || !!category.value || !!description.value.trim() || date.value !== today.value || type.value !== 'expense')

let previousOverflow = ''

function formatAmount(event: Event) {
  const input = event.target as HTMLInputElement
  const raw = input.value
  const caret = input.selectionStart ?? raw.length
  const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length
  if (!/^[\d.]*$/.test(raw)) {
    amountText.value = raw
    return
  }
  const digits = raw.replaceAll('.', '')
  const formatted = digits ? digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''
  amountText.value = formatted
  input.value = formatted
  // Preserve the caret when a digit is edited in the middle of a grouped amount.
  let position = 0
  let count = 0
  while (position < formatted.length && count < digitsBefore) {
    if (/\d/.test(formatted[position] ?? '')) count++
    position++
  }
  input.setSelectionRange(position, position)
}

function changeType(nextType: NoteType) {
  type.value = nextType
  category.value = ''
  attempted.value = false
  saveError.value = ''
}

function open(options?: { category?: string; date?: string }) {
  if (!dialog.value || dialog.value.open) return
  removeReceipt()
  editing.value = null
  categoryCreator.value?.reset()
  type.value = 'expense'
  amountText.value = ''
  category.value = props.catalog.expense.some(item => item.id === options?.category) ? options!.category! : ''
  accountManuallySelected.value = false
  today.value = localDate()
  date.value = options?.date && validNoteDate(options.date) && options.date <= today.value ? options.date : today.value
  account.value = suggestedAccount.value
  description.value = ''
  attempted.value = false
  saveError.value = ''
  confirmDiscard.value = false
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
  amountInput.value?.focus()
}

function edit(note: MoneyNote) {
  if (dialog.value?.open) return
  open()
  editing.value = { ...note, ...(note.receipt ? { receipt: { ...note.receipt } } : {}) }
  type.value = note.type
  amountText.value = String(note.amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  category.value = note.category
  accountManuallySelected.value = true
  account.value = note.account
  date.value = note.date
  description.value = note.description
  receipt.value = note.receipt ? { ...note.receipt } : undefined
  initialEditDraft = draftSnapshot()
  nextTick(() => amountInput.value?.focus())
}

function close() {
  if (!dialog.value?.open) return
  removeReceipt()
  categoryCreator.value?.reset()
  dialog.value.close()
  document.body.style.overflow = previousOverflow
}

function requestClose() {
  if (saving.value) return
  if (dirty.value) confirmDiscard.value = true
  else close()
}

function submit() {
  if (saving.value || receiptBusy.value || categoryCreating.value || !props.ready || revisionError.value || requiredBudgetError.value) return
  attempted.value = true
  saveError.value = ''
  today.value = localDate()
  if (insufficientFunds.value) { amountInput.value?.focus(); return }
  if (amountError.value) { amountInput.value?.focus(); return }
  if (categoryError.value) { categoryInputs.value[0]?.focus(); return }
  if (dateError.value) { dateInput.value?.focus(); return }
  if (!formAccounts.value.some(item => item.id === account.value)) {
    saveError.value = 'Pilih rekening untuk catatan ini.'
    return
  }
  saving.value = true
  try {
    const wasEditing = !!editing.value
    if (editing.value && !props.update) throw new Error('Perubahan catatan belum tersedia.')
    const note = editing.value ? props.update!(editing.value, currentDraft()) : props.save(currentDraft())
    close()
    if (wasEditing) emit('updated', note)
    else emit('saved', note)
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : 'Catatan belum tersimpan. Silakan coba lagi.'
  } finally {
    saving.value = false
  }
}

function backdropClick(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose()
}

function trapFocus(event: KeyboardEvent) {
  const elements = Array.from(dialog.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
  ) ?? []).filter(element => element.getClientRects().length > 0)
  const first = elements[0]
  const last = elements.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

onBeforeUnmount(close)
defineExpose({ open, edit, close })
</script>

<template>
  <dialog ref="dialog" class="note-dialog" aria-labelledby="note-dialog-title" aria-describedby="note-dialog-description" @keydown.tab="trapFocus" @cancel.prevent="requestClose" @click="backdropClick">
    <div class="sheet-handle" aria-hidden="true" />
    <header class="note-header">
      <div class="note-heading">
        <span class="heading-icon material-symbols-outlined" aria-hidden="true">edit_note</span>
        <div>
          <h2 id="note-dialog-title">{{ editing ? 'Ubah Catatan' : 'Tambah Catatan' }}</h2>
          <p id="note-dialog-description">Catat sebentar, tenang seharian.</p>
        </div>
      </div>
      <div class="note-actions">
        <ThemeToggle />
        <button type="button" class="close-note" :aria-label="editing ? 'Tutup ubah catatan' : 'Tutup tambah catatan'" @click="requestClose">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </header>

    <form class="note-form" novalidate :aria-busy="saving" @submit.prevent="submit">
      <div class="note-fields">
        <fieldset class="type-picker">
          <legend class="visually-hidden">Jenis catatan</legend>
          <label v-for="option in [{ id: 'expense', label: 'Pengeluaran', icon: 'north_east' }, { id: 'income', label: 'Pemasukan', icon: 'south_west' }]" :key="option.id" :class="{ selected: type === option.id }">
            <input type="radio" name="note-type" :value="option.id" :checked="type === option.id" @change="changeType(option.id as NoteType)">
            <span class="material-symbols-outlined" aria-hidden="true">{{ option.icon }}</span>
            {{ option.label }}
          </label>
        </fieldset>

        <div class="amount-field">
          <label for="note-amount">{{ type === 'expense' ? 'Berapa yang kamu keluarkan?' : 'Berapa uang yang masuk?' }}</label>
          <div class="amount-entry" :class="{ invalid: amountError || insufficientFunds }">
            <span aria-hidden="true">Rp</span>
            <input id="note-amount" ref="amountInput" :value="amountText" :style="{ width: Math.max(1, amountText.length) + 'ch' }" :class="{ 'amount-input--long': amountText.length > 12 }" type="text" inputmode="numeric" autocomplete="off" placeholder="0" maxlength="24" aria-label="Nominal dalam rupiah" :aria-invalid="!!amountError || insufficientFunds" :aria-describedby="insufficientFunds ? 'note-funds-error' : amountError ? 'note-amount-error' : 'note-amount-help'" @input="formatAmount">
          </div>
          <p v-if="amountError" id="note-amount-error" class="field-error" role="alert">Isi nominal Rp1 sampai Rp999.999.999.999, tanpa desimal.</p>
          <p v-else id="note-amount-help" class="field-help">Masukkan nominal dalam rupiah, tanpa desimal.</p>
        </div>

        <fieldset class="category-picker" :aria-describedby="categoryError ? 'note-category-error' : undefined">
          <legend>Kategori <span class="required-dot" aria-hidden="true">*</span></legend>
          <div class="category-grid">
            <label v-for="item in categories" :key="item.id" :class="{ selected: category === item.id }">
              <input ref="categoryInputs" v-model="category" type="radio" name="note-category" :value="item.id" :aria-invalid="!!categoryError">
              <span class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>
              <span class="category-name">{{ item.label }}</span>
              <span v-if="category === item.id" class="category-check material-symbols-outlined" aria-hidden="true">check_circle</span>
            </label>
          </div>
          <p v-if="categoryError" id="note-category-error" class="field-error" role="alert">Pilih kategori catatanmu dulu.</p>
        </fieldset>

        <CategoryCreator ref="categoryCreator" :type="type" :save="saveCategory" :ready="categoriesReady" @created="category = $event.id" @dirty="categoryDraftDirty = $event" @editing="categoryCreating = $event" />
        <p v-if="budgetOverage > 0" class="budget-warning" role="status">Catatan ini membuat pengeluaran kategori melewati anggaran sebesar {{ formatRupiah(budgetOverage) }}. Kamu tetap dapat menyimpan jika saldo dompet mencukupi.</p>
        <div class="details-grid">
          <div class="detail-field account-field">
            <label for="note-account">{{ type === 'expense' ? 'Bayar dari' : 'Masuk ke' }}</label>
            <div class="detail-control">
              <span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
              <select id="note-account" v-model="account" @change="accountManuallySelected = true" :aria-describedby="(insufficientFunds ? 'note-funds-error' : 'note-balance-help') + (budgetAccount ? ' note-budget-account-help' : '')">
                <option v-for="item in formAccounts" :key="item.id" :value="item.id">{{ item.label }} &middot; {{ ready ? formatRupiah(item.balance) : 'Saldo belum tersedia' }}</option>
              </select>
            </div>
            <p v-if="budgetAccount" id="note-budget-account-help" class="balance-help">
              <template v-if="availableBudgetAccount">Pilihan anggaran: {{ availableBudgetAccount.label }}. Kamu bisa memakai dompet lain untuk catatan ini.</template>
              <template v-else>Dompet {{ noteAccounts.find(item => item.id === budgetAccount)?.label }} dari anggaran belum tersedia. Pilih dompet yang akan digunakan.</template>
            </p>
            <p id="note-balance-help" class="balance-help">Saldo contoh, diperbarui dari catatanmu di browser ini.</p>
            <p v-if="ready && validAmount && selectedAccount && !insufficientFunds && !revisionError" class="balance-preview" aria-live="polite">
              {{ editing ? 'Saldo setelah perubahan' : type === 'expense' ? 'Sisa setelah pengeluaran' : 'Saldo setelah pemasukan' }}
              <strong>{{ formatRupiah(remainingBalance) }}</strong>
            </p>
          </div>
          <div class="detail-field date-field">
            <label for="note-date">Tanggal <span v-if="date === today" class="today-label">Hari ini</span></label>
            <div class="detail-control" :class="{ invalid: dateError }">
              <input id="note-date" ref="dateInput" v-model="date" type="date" min="1900-01-01" :max="today" :aria-invalid="!!dateError" :aria-describedby="dateError ? 'note-date-error' : undefined">
            </div>
            <p v-if="dateError" id="note-date-error" class="field-error" role="alert">Pilih tanggal yang valid sampai hari ini.</p>
          </div>
        </div>

        <div class="detail-field description-field">
          <label for="note-description">Keterangan <span>Opsional</span></label>
          <input id="note-description" v-model="description" type="text" maxlength="120" :placeholder="type === 'expense' ? 'Contoh: Makan siang di warung favorit' : 'Contoh: Gaji bulan ini'">
          <span class="character-count">{{ description.length }}/120</span>
        </div>
        <section class="receipt-field" aria-labelledby="receipt-heading" :aria-busy="receiptBusy">
          <div class="receipt-field__heading"><h3 id="receipt-heading">Foto struk</h3><span>Opsional</span></div>
          <input ref="receiptFile" type="file" :accept="receiptAccept" aria-label="Pilih foto struk" hidden @change="selectReceipt">
          <div class="receipt-upload-actions">
            <button type="button" :disabled="receiptBusy" @click="receiptFile?.click()"><span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span>{{ receipt ? 'Ganti foto' : 'Pilih foto' }}</button>
            <button type="button" :disabled="receiptBusy" @click="receiptCamera?.open()"><span class="material-symbols-outlined" aria-hidden="true">photo_camera</span>Ambil foto</button>
          </div>
          <p class="field-help">JPG, PNG, atau WebP, maksimal 10 MB. Foto langsung tampil setelah dipilih.</p>
          <p v-if="receiptBusy" class="field-help" role="status">Menyiapkan foto struk...</p>
          <div v-if="receipt" ref="receiptPreview" class="receipt-preview">
            <button class="receipt-preview__image" type="button" aria-label="Lihat foto struk lebih besar" @click="receiptViewer?.open(receipt)">
              <img :src="receipt.dataUrl" alt="Pratinjau foto struk">
              <span><span class="material-symbols-outlined" aria-hidden="true">zoom_in</span>Lihat foto</span>
            </button>
            <div class="receipt-preview__caption"><span>{{ receipt.name }}</span><button type="button" @click="removeReceipt">Hapus foto</button></div>
          </div>
          <p v-if="receiptError" class="field-error" role="alert">{{ receiptError }}</p>
        </section>
        <p class="storage-note"><span class="material-symbols-outlined" aria-hidden="true">info</span>Catatan tersimpan di browser ini untuk akunmu. Belum tersinkron ke perangkat lain.</p>
        <p v-if="saveError" class="field-error save-error" role="alert">{{ saveError }}</p>
      </div>

      <footer class="note-footer">
        <div v-if="confirmDiscard" class="discard-confirmation" role="alert">
          <p>Isian belum disimpan. Tutup dan buang isian?</p>
          <div>
            <button type="button" class="keep-editing" @click="confirmDiscard = false">Lanjut mengisi</button>
            <button type="button" class="discard-note" @click="close">Buang isian</button>
          </div>
        </div>
        <template v-else>
          <p v-if="insufficientFunds" id="note-funds-error" class="insufficient-funds" role="alert">
            <span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
            <span>Saldo {{ selectedAccount?.label }} tidak cukup. Kurang <strong>{{ formatRupiah(amount - (selectedAccount?.balance ?? 0)) }}</strong>. Kurangi nominal atau pilih sumber uang lain.</span>
          </p>
          <p v-if="revisionError" id="note-revision-error" class="field-error" role="alert">{{ revisionError }}</p>
          <p v-if="requiredBudgetError" id="note-budget-error" class="field-error" role="alert">{{ requiredBudgetError }}</p>
          <button type="submit" class="save-note" :disabled="saving || receiptBusy || categoryCreating || !ready || insufficientFunds || !!revisionError || !!requiredBudgetError" :aria-describedby="requiredBudgetError ? 'note-budget-error' : revisionError ? 'note-revision-error' : insufficientFunds ? 'note-funds-error' : undefined">
            <span class="material-symbols-outlined" aria-hidden="true">check</span>
            {{ saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Simpan Catatan' }}
          </button>
          <p>Satu catatan kecil, selangkah lebih teratur.</p>
        </template>
      </footer>
    </form>
    <ReceiptViewer ref="receiptViewer" />
    <ReceiptCamera ref="receiptCamera" @captured="attachReceipt" @choose-file="receiptFile?.click()" />
  </dialog>
</template>

<style scoped>
.budget-warning { padding: .8rem; border: 1px solid color-mix(in srgb, var(--warning) 35%, var(--line)); border-radius: .65rem; background: color-mix(in srgb, var(--warning) 8%, var(--surface)); color: var(--warning); font-size: .8rem; line-height: 1.6; }
.note-dialog {
  --note-accent: var(--teal);
  --note-selected: color-mix(in srgb, var(--teal) 10%, var(--surface));
  --note-on-accent: #fff;
  width: min(100% - 2rem, 35rem);
  max-width: 35rem;
  max-height: calc(100dvh - 3rem);
  margin: auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 1.4rem;
  color: var(--ink);
  background: var(--surface);
  font: inherit;
  box-shadow: 0 24px 90px rgb(0 0 0 / 24%);
}
.note-dialog[open] { display: flex; flex-direction: column; animation: note-enter .2s ease-out; }
.note-dialog::backdrop { background: rgb(9 22 19 / 55%); backdrop-filter: blur(5px); }
.note-dialog :is(button, input, select):focus-visible { outline: 2px solid var(--note-accent); outline-offset: 3px; }
.sheet-handle { display: none; }
.note-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: .5rem; padding: 1.4rem 1.5rem 1.15rem; border-bottom: 1px solid var(--line); }
.note-heading { display: flex; align-items: center; gap: .75rem; }
.heading-icon { display: grid; place-items: center; width: 2.7rem; height: 2.7rem; flex: none; border-radius: .9rem; color: var(--note-accent); background: var(--note-selected); font-size: 1.6rem; }
.note-heading h2 { margin: 0; font-size: 1.2rem; letter-spacing: -.04em; }
.note-heading p { margin: .25rem 0 0; color: var(--muted); font-size: .72rem; }
.note-actions { display: flex; align-items: center; }
.close-note { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
.close-note:hover { background: var(--canvas); }
.note-form { display: flex; flex-direction: column; min-height: 0; }
.note-fields { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 1.25rem 1.5rem; }
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.type-picker input, .category-picker input { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.type-picker { display: grid; grid-template-columns: 1fr 1fr; gap: .3rem; padding: .3rem; border-radius: .8rem; background: var(--canvas); border: 1px solid var(--line); }
.type-picker label { position: relative; display: flex; align-items: center; justify-content: center; gap: .4rem; min-height: 2.5rem; padding: .5rem; border: 1px solid transparent; border-radius: .6rem; color: var(--muted); font-size: .82rem; font-weight: 700; cursor: pointer; }
.type-picker label.selected { color: var(--note-accent); background: var(--surface); border-color: var(--line); box-shadow: 0 2px 4px rgb(0 0 0 / 4%); }
.type-picker .material-symbols-outlined { font-size: 1.1rem; }
:is(.type-picker, .category-picker) label:has(input:focus-visible) { outline: 2px solid var(--note-accent); outline-offset: 2px; }
.amount-field { padding: 1.4rem 0; text-align: center; }
.amount-field > label { display: block; color: var(--muted); font-size: .78rem; }
.amount-entry { display: flex; align-items: baseline; justify-content: center; gap: .5rem; max-width: 100%; margin: .6rem 0 .45rem; border-radius: .4rem; color: var(--note-accent); }
.amount-entry > span { font-size: 1.45rem; font-weight: 700; }
.amount-entry input { width: 100%; min-width: 0; max-width: calc(100% - 3rem); padding: .15rem 0; border: 0; color: var(--ink); background: transparent; font-size: clamp(1.6rem, 5vw, 2.55rem); font-weight: 800; letter-spacing: -.055em; text-align: center; }
.amount-entry input.amount-input--long { font-size: 1.55rem; }
.amount-entry input::placeholder { color: var(--muted); opacity: .55; }
.field-help, .field-error { margin: .45rem 0 0; font-size: .72rem; line-height: 1.55; }
.field-help { color: var(--muted); }
.field-error { color: var(--danger); }
.category-picker legend, .detail-field > label { margin-bottom: .65rem; font-size: .8rem; font-weight: 800; }
.required-dot { color: var(--note-accent); }
.category-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .55rem; }
.category-grid label { position: relative; display: flex; min-height: 4.9rem; align-items: center; justify-content: center; flex-direction: column; gap: .45rem; padding: .65rem .25rem; border: 1px solid var(--line); border-radius: .8rem; color: var(--muted); font-size: .71rem; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s; }
.category-name { max-width: 100%; overflow-wrap: anywhere; text-align: center; }
.category-grid label:hover { border-color: var(--note-accent); background: var(--canvas); }
.category-grid label.selected { border-color: var(--note-accent); color: var(--note-accent); background: var(--note-selected); }
.category-grid .material-symbols-outlined { font-size: 1.35rem; }
.category-grid .category-check { position: absolute; top: .3rem; right: .3rem; font-size: .9rem; font-variation-settings: 'FILL' 1; }
.details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; margin-top: 1.25rem; }
.detail-field { min-width: 0; }
.receipt-field { margin-top: 1.1rem; }
.receipt-field__heading { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .65rem; }
.receipt-field__heading h3 { margin: 0; font-size: .8rem; font-weight: 800; }
.receipt-field__heading > span { font-size: .65rem; color: var(--muted); }
.receipt-upload-actions { display: flex; flex-wrap: wrap; gap: .6rem; }
.receipt-upload-actions button { display: flex; flex: 1; justify-content: center; align-items: center; gap: .4rem; min-height: 2.8rem; padding: .6rem; border: 1px dashed var(--line); border-radius: .7rem; color: var(--note-accent); background: var(--canvas); font-size: .78rem; font-weight: 700; cursor: pointer; }
.receipt-upload-actions button:disabled { opacity: .5; cursor: wait; }
.receipt-upload-actions .material-symbols-outlined { font-size: 1.2rem; }
.receipt-preview { margin-top: .75rem; border: 1px solid var(--line); border-radius: .8rem; overflow: hidden; }
.receipt-preview__image { position: relative; display: block; width: 100%; padding: .7rem; border: 0; background: var(--canvas); cursor: zoom-in; }
.receipt-preview__image img { display: block; width: 100%; height: 11rem; object-fit: contain; }
.receipt-preview__image > span { position: absolute; right: .7rem; bottom: .7rem; display: flex; align-items: center; gap: .25rem; padding: .3rem .5rem; border: 1px solid var(--line); border-radius: .4rem; color: var(--ink); background: var(--surface); font-size: .68rem; }
.receipt-preview__image .material-symbols-outlined { font-size: 1rem; }
.receipt-preview__caption { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .6rem .75rem; border-top: 1px solid var(--line); font-size: .7rem; color: var(--muted); }
.receipt-preview__caption > span { min-width: 0; overflow-wrap: anywhere; }
.receipt-preview__caption button { flex: none; min-height: 2rem; padding: .3rem; border: 0; color: var(--danger); background: transparent; font: inherit; cursor: pointer; }
.account-field, .date-field { grid-column: 1 / -1; }
.balance-help { margin: .4rem 0 0; color: var(--muted); font-size: .67rem; line-height: 1.5; }
.balance-preview { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .3rem; margin: .5rem 0 0; color: var(--muted); font-size: .72rem; }
.balance-preview strong { color: var(--note-accent); overflow-wrap: anywhere; }
.note-footer .insufficient-funds { display: flex; align-items: flex-start; gap: .5rem; margin: 0 0 .75rem; padding: .7rem; border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--surface)); border-radius: .65rem; background: color-mix(in srgb, var(--danger) 7%, var(--surface)); color: var(--danger); font-size: .74rem; line-height: 1.5; }
.insufficient-funds > .material-symbols-outlined { flex: none; margin-top: .1rem; font-size: 1.15rem; }
.detail-field > label { display: flex; align-items: center; justify-content: space-between; gap: .25rem; }
.detail-field > label > span { color: var(--muted); font-size: .65rem; font-weight: 500; }
.detail-control { display: flex; align-items: center; gap: .5rem; min-height: 2.85rem; padding: 0 .7rem; border: 1px solid var(--line); border-radius: .7rem; background: var(--canvas); }
.detail-control > span { color: var(--muted); font-size: 1.1rem; }
.detail-control :is(select, input) { width: 100%; min-width: 0; min-height: 2.75rem; padding: 0; border: 0; color: var(--ink); background: transparent; font-size: .82rem; }
.detail-control select { cursor: pointer; }
.detail-control option { color: var(--ink); background: var(--surface); }
.description-field { position: relative; margin-top: 1.15rem; padding-bottom: 1.15rem; }
.description-field > input { width: 100%; min-height: 2.85rem; padding: .7rem .8rem; border: 1px solid var(--line); border-radius: .7rem; color: var(--ink); background: var(--canvas); font-size: .82rem; }
.description-field > input::placeholder { color: var(--muted); opacity: .8; }
.character-count { position: absolute; right: 0; bottom: 0; color: var(--muted); font-size: .62rem; }
.storage-note { display: flex; align-items: flex-start; gap: .45rem; margin: .7rem 0 0; color: var(--muted); font-size: .68rem; line-height: 1.6; }
.storage-note .material-symbols-outlined { flex: none; margin-top: .1rem; font-size: 1rem; }
.invalid { outline: 1px solid var(--danger); outline-offset: 2px; }
.note-footer { flex: none; padding: 1rem 1.5rem; border-top: 1px solid var(--line); background: var(--surface); }
.save-note { display: flex; align-items: center; justify-content: center; gap: .5rem; width: 100%; min-height: 3rem; border: 0; border-radius: .75rem; background: var(--note-accent); color: var(--note-on-accent); font-weight: 800; font-size: .85rem; cursor: pointer; }
.save-note:hover { filter: brightness(1.08); }
.save-note:disabled { opacity: .5; cursor: not-allowed; }
.save-note .material-symbols-outlined { font-size: 1.2rem; }
.note-footer > p { margin: .6rem 0 0; color: var(--muted); font-size: .65rem; text-align: center; }
.discard-confirmation p { margin: 0 0 .7rem; font-size: .82rem; }
.discard-confirmation > div { display: flex; gap: .65rem; }
.discard-confirmation button { flex: 1; min-height: 2.75rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--canvas); color: var(--ink); font-size: .8rem; font-weight: 700; cursor: pointer; }
.discard-confirmation .discard-note { color: var(--danger); }
.discard-confirmation .keep-editing { color: var(--note-accent); border-color: var(--note-accent); }
html.theme-dark .note-dialog { --note-accent: #74d9cb; --note-on-accent: #003731; }
@keyframes note-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (min-width: 64rem) { html.theme-dark .save-note { background: var(--teal); color: #fff; } }
@media (max-width: 639px) {
  .note-dialog { width: 100%; max-width: 100%; max-height: 94dvh; margin: auto 0 0; border-bottom: 0; border-radius: 1.4rem 1.4rem 0 0; }
  .sheet-handle { display: block; flex: none; width: 2.3rem; height: .25rem; margin: .6rem auto 0; border-radius: 1rem; background: var(--line); }
  .note-header { padding: .8rem 1.1rem 1rem; }
  .heading-icon { display: none; }
  .note-heading h2 { font-size: 1.1rem; }
  .note-fields { padding: 1rem 1.1rem; }
  .note-footer { padding: .9rem 1.1rem max(.9rem, env(safe-area-inset-bottom)); }
  .amount-field { padding: 1.15rem 0; }
  .details-grid { gap: .6rem; }
  .detail-control :is(input, select), .description-field > input { font-size: 1rem; }
}
@media (prefers-reduced-motion: reduce) { .note-dialog[open] { animation: none; } .category-grid label { transition: none; } }
</style>
