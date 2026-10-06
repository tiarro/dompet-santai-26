<script setup lang="ts">
import ReceiptViewer from '~/components/ReceiptViewer.vue';
import HistoryOverview from '~/components/HistoryOverview.vue';
import AddNoteDialog from '~/components/AddNoteDialog.vue';
import { openingWalletTotal, noteAccounts, summarizeNotes, type MoneyNote } from '~/utils/notes';
import { formatRupiah } from '~/utils/currency';
import { summarizeBudgets } from '~/utils/budgets';
const props = defineProps<{ section?: 'home' | 'budgets' | 'history' }>();
const historyPage = computed(() => props.section === 'history');
const historyOverview = ref<InstanceType<typeof HistoryOverview> | null>(null);
const budgetPage = computed(() => props.section === 'budgets');
const { catalog, ready: categoriesReady, storageError: categoriesError, save: saveCategory, readLatest: readLatestCategories } = useCategories();
const { budgets: monthlyBudgets, ready: budgetsReady, storageError: budgetError, save: saveBudget } = useBudgets(readLatestCategories);
function openBudgetExpense(category: string, month: string) {
  if (month > today.value.slice(0, 7)) return;
  noteDialog.value?.open({ category, date: month === today.value.slice(0, 7) ? today.value : month + '-01' });
}
function navigateMenu(label: string) {
  if (label === 'Beranda') navigateTo('/');
  if (label === 'Anggaran') navigateTo('/anggaran');
  if (label === 'Riwayat') navigateTo('/riwayat');
}
function menuActive(label: string) { return label === (historyPage.value ? 'Riwayat' : budgetPage.value ? 'Anggaran' : 'Beranda'); }

const profileImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDCq0YkRqEi3ufBkn8VdCMU3Sf8h4i-R0MEft4hWcx5uUDDY1TK3W6b_QdwobdFUhNpOpZTlfYsXQu5qQRmqR-Qxfc1V2Yr75bcTyLCPtya2A8HG9fH6RwKVzKV4MjWidmxW7X-dslt34_BIjasrgi9UPslw0CQngqG2LyWiJ1vXyQ1FUoGrT9nxstE80yVWBol-g8uozi5iqwKHIoDaq8dh3wFZuluCaEhP5KKQOp3jk_Xpj093AyR";

const { notes, balances, ready, storageError, today, save, update, remove } = useMoneyNotes(readLatestCategories);
const receiptViewer = ref<InstanceType<typeof ReceiptViewer> | null>(null);
const noteDialog = ref<InstanceType<typeof AddNoteDialog> | null>(null);
const user = useSupabaseUser();
const finances = useState('onboarding-step-two', () => ({ payday: '25', balance: '', accounts: ['cash', 'bank', 'ewallet'] }));
const accounts = computed(() => {
  const selected = noteAccounts.filter(account => finances.value.accounts.includes(account.id));
  const available = selected.length ? selected : noteAccounts.filter(account => account.id !== 'savings');
  return available.map(account => ({ ...account, balance: balances.value[account.id] ?? 0 }));
});
const latestAccount = computed(() => notes.value.at(-1)?.account);
const totals = computed(() => summarizeNotes(notes.value, today.value));
const summaryCards = computed(() => [
  { label: "Saldo Nyata", value: formatRupiah(openingWalletTotal + totals.value.net), icon: "account_balance_wallet", tone: "neutral" },
  { label: "Uang Aman Dipakai", value: formatRupiah(openingWalletTotal - 6_300_000 + totals.value.net), helper: "Simulasi setelah dana yang disisihkan", icon: "verified_user", tone: "primary" },
  { label: "Pengeluaran Hari Ini", value: formatRupiah(125_000 + totals.value.todayExpenses), helper: "Batas harian: Rp200.000", icon: "receipt_long", tone: "neutral", danger: true },
]);

// Existing example balances remain visible while this first version uses a local ledger.
// Safe-to-spend = example balance + net notes - fixed example reserve (Rp6.300.000).
const budgets = computed(() => summarizeBudgets(monthlyBudgets.value, notes.value, today.value.slice(0, 7), today.value, catalog.value).allocated.map(item => ({
  ...item,
  status: item.status === 'reached' || item.status === 'exceeded' ? 'low' : item.status,
  detail: item.remaining < 0 ? 'Lebih ' + formatRupiah(-item.remaining) : 'Sisa ' + formatRupiah(item.remaining),
})));

const recentNotes = computed(() => [...notes.value]
  .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5));
const toast = ref('');
const undoId = ref<string | null>(null);
const undoError = ref('');
function saved(note: MoneyNote) {
  toast.value = 'Catatan tersimpan';
  undoId.value = note.id;
  undoError.value = '';
}
function updated(note: MoneyNote) {
  historyOverview.value?.afterUpdate(note);
  toast.value = historyPage.value ? '' : 'Catatan diperbarui';
  undoId.value = null;
  undoError.value = '';
}
function deleted() {
  toast.value = historyPage.value ? '' : 'Catatan dihapus';
  undoId.value = null;
  undoError.value = '';
}
function removeHistory(note: MoneyNote) { remove(note.id, note); }
function undo() {
  if (!undoId.value) return;
  try {
    remove(undoId.value);
    undoId.value = null;
    toast.value = 'Catatan diurungkan';
    undoError.value = '';
  } catch (error) {
    undoError.value = error instanceof Error ? error.message : 'Catatan belum bisa diurungkan. Coba lagi.';
  }
}
function dismissToast() {
  toast.value = '';
  undoId.value = null;
  undoError.value = '';
}
function categoryFor(note: MoneyNote) {
  return catalog.value[note.type].find(category => category.id === note.category) ?? { label: 'Kategori tidak tersedia', icon: 'category' };
}
function dateLabel(date: string) {
  return date === today.value ? 'Hari ini' : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date + 'T12:00:00'));
}
watch(() => user.value?.sub, () => { noteDialog.value?.close(); receiptViewer.value?.close(); dismissToast(); });
// Close the topmost editors/viewers before their underlying detail panel restores page scrolling.
onBeforeUnmount(() => {
  noteDialog.value?.close();
  receiptViewer.value?.close();
  historyOverview.value?.close();
});


const bills = [
  {
    label: "Internet Rumah",
    due: "Besok, 15 Okt",
    value: "Rp350.000",
    icon: "wifi",
  },
  { label: "Listrik PLN", due: "20 Okt", value: "Rp200.000", icon: "bolt" },
];

const navigation = [
  { label: "Beranda", icon: "home", active: true },
  { label: "Riwayat", icon: "history" },
  { label: "Anggaran", icon: "account_balance_wallet" },
  { label: "Tabungan", icon: "savings" },
  { label: "Setting", icon: "settings" },
];

const desktopNavigation = [
  { label: "Beranda", icon: "home", active: true },
  { label: "Riwayat", icon: "history" },
  { label: "Anggaran", icon: "account_balance_wallet" },
  { label: "Tabungan", icon: "savings" },
  { label: "Pengaturan", icon: "settings" },
];
</script>

<template>
  <div class="dashboard-page">
    <h1 data-testid="page-title" class="sr-only">Dompet Santai</h1>
    <header class="topbar">
      <div class="user-greeting">
        <img class="avatar" :src="profileImage" alt="Profil pengguna" />
        <span>Halo, User</span>
      </div>
      <div class="topbar__actions">
        <ThemeToggle /><button
          class="icon-button"
          aria-label="Lihat notifikasi"
          type="button"
        >
          <span class="material-symbols-outlined">notifications</span>
        </button>
      </div>
    </header>

    <aside class="desktop-sidebar" aria-label="Navigasi desktop">
      <div class="desktop-sidebar__brand">
        <img :src="profileImage" alt="Profil Dompet Santai" />
        <div>
          <strong>Dompet Santai</strong><span>Halo, Sahabat Keuangan</span>
        </div>
      </div>
      <nav class="desktop-sidebar__nav">
        <button
          v-for="item in desktopNavigation"
          :key="item.label"
          type="button"
          :class="{ 'desktop-sidebar__item--active': menuActive(item.label) }"
          class="desktop-sidebar__item"
          :aria-current="menuActive(item.label) ? 'page' : undefined" @click="navigateMenu(item.label)"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <header class="desktop-header">
      <div>
        <h2>Halo, User</h2>
        <p>Selamat pagi, kamu masih aman hari ini.</p>
      </div>
      <div class="desktop-header__actions">
        <ThemeToggle />
        <button class="icon-button" aria-label="Lihat notifikasi" type="button">
          <span class="material-symbols-outlined">notifications</span>
        </button>
        <button class="desktop-add-note" type="button" aria-label="Tambah Catatan" @click="noteDialog?.open()">
          <span class="material-symbols-outlined">add</span
          ><span>Tambah Catatan</span>
        </button>
      </div>
    </header>

    <main v-if="!budgetPage && !historyPage" class="dashboard-content">
      <section class="intro" aria-labelledby="intro-title">
        <h2 id="intro-title">Selamat pagi, kamu masih aman hari ini.</h2>
        <p>Catat pengeluaran dan pemasukanmu, satu per satu.</p>
      </section>

      <p class="preview-notice"><span class="material-symbols-outlined" aria-hidden="true">info</span>Pratinjau: saldo dan ringkasan harian masih memakai data contoh. Anggaran mengikuti batas dan catatanmu di browser ini.</p>
      <p v-if="categoriesError || storageError" class="notes-error" role="alert">{{ categoriesError || storageError }}</p>
      <section class="summary-grid" aria-label="Ringkasan keuangan">
        <article
          v-for="card in summaryCards"
          :key="card.label"
          class="summary-card"
          :class="[
            `summary-card--${card.tone}`,
            { 'summary-card--danger': card.danger },
          ]"
        >
          <div class="summary-card__label">
            <span class="material-symbols-outlined">{{ card.icon }}</span>
            <span>{{ card.label }}</span>
          </div>
          <div>
            <p class="summary-card__value">{{ card.value }}</p>
            <p v-if="card.helper" class="summary-card__helper">
              <span
                v-if="card.tone === 'primary'"
                class="material-symbols-outlined"
                >info</span
              >
              {{ card.helper }}
            </p>
          </div>
        </article>
      </section>

      <div class="content-grid">
        <section class="budget-section" aria-labelledby="budget-title">
          <div class="section-heading">
            <h2 id="budget-title">Kondisi Anggaran</h2>
            <button type="button" @click="navigateTo('/anggaran')">Lihat Semua</button>
          </div>
          <p v-if="budgetError" class="notes-error" role="alert">{{ budgetError }}</p>
          <p v-else-if="!budgetsReady || !ready" class="notes-count">Memuat anggaran...</p>
          <div v-else-if="!budgets.length" class="notes-empty"><p>Belum ada anggaran bulan ini.</p><NuxtLink to="/anggaran" class="view-receipt">Atur Anggaran</NuxtLink></div>
          <div v-else class="budget-list">
            <article
              v-for="budget in budgets"
              :key="budget.label"
              class="budget-card"
              :class="`budget-card--${budget.status}`"
            >
              <div class="budget-card__topline">
                <div class="budget-card__name">
                  <span class="budget-icon material-symbols-outlined">{{
                    budget.icon
                  }}</span>
                  <span>{{ budget.label }}</span>
                </div>
                <span class="budget-card__detail">{{ budget.detail }}</span>
              </div>
              <div class="progress-track" aria-hidden="true">
                <span
                  class="progress-value"
                  :style="{ width: `${budget.progress}%` }"
                />
              </div>
            </article>
          </div>

        </section>

        <aside class="side-widgets">
          <section class="widget-card" aria-labelledby="bills-title">
            <h2 id="bills-title">Tagihan Mendatang</h2>
            <ul class="bill-list">
              <li v-for="bill in bills" :key="bill.label" class="bill-row">
                <div class="bill-row__label">
                  <span class="bill-icon material-symbols-outlined">{{
                    bill.icon
                  }}</span>
                  <div>
                    <h3>{{ bill.label }}</h3>
                    <p>{{ bill.due }}</p>
                  </div>
                </div>
                <strong>{{ bill.value }}</strong>
              </li>
            </ul>
          </section>

          <section
            class="widget-card savings-card"
            aria-labelledby="savings-title"
          >
            <div class="savings-card__heading">
              <h2 id="savings-title">Target Tabungan</h2>
              <span class="material-symbols-outlined">flag</span>
            </div>
            <div
              class="savings-progress"
              aria-label="Dana darurat sudah terkumpul 62 persen"
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle
                  class="savings-progress__track"
                  cx="50"
                  cy="50"
                  r="45"
                />
                <circle
                  class="savings-progress__value"
                  cx="50"
                  cy="50"
                  r="45"
                />
              </svg>
              <strong>62%</strong>
            </div>
            <div class="savings-card__copy">
              <h3>Dana Darurat</h3>
              <p>Terkumpul Rp6.200.000 dari Rp10.000.000</p>
            </div>
          </section>
        </aside>
      </div>
      <section class="recent-notes widget-card" aria-labelledby="recent-notes-title">
        <div class="section-heading">
          <h2 id="recent-notes-title">Catatan Terbaru</h2>
          <span class="local-badge">Di browser ini</span>
        </div>
        <ul v-if="recentNotes.length" class="note-list">
          <li v-for="note in recentNotes" :key="note.id" class="saved-note">
            <span class="saved-note__icon material-symbols-outlined" aria-hidden="true">{{ categoryFor(note).icon }}</span>
            <div class="saved-note__copy">
              <strong>{{ note.description || categoryFor(note).label }}</strong>
              <p>{{ categoryFor(note).label }} &middot; {{ noteAccounts.find(account => account.id === note.account)?.label }} &middot; {{ dateLabel(note.date) }}</p>
              <button v-if="note.receipt" type="button" class="view-receipt" @click="receiptViewer?.open(note.receipt)"><span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>Lihat struk</button>
            </div>
            <span class="saved-note__amount" :class="{ 'saved-note__amount--income': note.type === 'income' }">
              <span class="sr-only">{{ note.type === 'income' ? 'Pemasukan' : 'Pengeluaran' }}</span>
              {{ note.type === 'income' ? '+' : '\u2212' }}{{ formatRupiah(note.amount) }}
            </span>
          </li>
        </ul>
        <div v-else class="notes-empty">
          <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
          <p>Mulai dari satu catatan kecil.</p>
          <span>Pengeluaran dan pemasukan yang kamu simpan akan muncul di sini.</span>
        </div>
        <p v-if="notes.length > 5" class="notes-count">Menampilkan 5 catatan terbaru dari {{ notes.length }} catatan.</p>
        <NuxtLink to="/riwayat" class="view-receipt">Lihat semua riwayat</NuxtLink>
      </section>
    </main>
    <main v-else-if="budgetPage" class="dashboard-content">
      <BudgetOverview :key="user?.sub" :accounts="accounts" :budgets="monthlyBudgets" :notes="notes" :today="today" :ready="ready && budgetsReady && categoriesReady" :error="categoriesError || storageError || budgetError" :catalog="catalog" :save-category="saveCategory" :categories-ready="categoriesReady" :save="saveBudget" @expense="openBudgetExpense" />
    </main>
    <main v-else class="dashboard-content">
      <HistoryOverview ref="historyOverview" :key="user?.sub" :notes="notes" :catalog="catalog" :today="today" :ready="ready && categoriesReady" :error="categoriesError || storageError" :remove="removeHistory" @add="noteDialog?.open()" @edit="noteDialog?.edit($event)" @deleted="deleted">
        <template #notification>
          <div v-if="toast" class="note-toast note-toast--inline">
            <div class="note-toast__row">
              <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
              <span role="status">{{ toast }}</span>
              <button v-if="undoId" type="button" class="undo-note" @click="undo">Urungkan</button>
              <button type="button" class="dismiss-toast" aria-label="Tutup pemberitahuan" @click="dismissToast"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
            </div>
            <p v-if="undoError" class="notes-error" role="alert">{{ undoError }}</p>
          </div>
        </template>
      </HistoryOverview>
    </main>
    <ReceiptViewer ref="receiptViewer" />
    <AddNoteDialog ref="noteDialog" :save="save" :update="update" :ready="ready && categoriesReady" :catalog="catalog" :save-category="saveCategory" :categories-ready="categoriesReady" :accounts="accounts" :default-account="latestAccount" :budgets="monthlyBudgets" :notes="notes" @saved="saved" @updated="updated" />
    <div v-if="toast && !historyPage" class="note-toast">
      <div class="note-toast__row">
        <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
        <span role="status">{{ toast }}</span>
        <button v-if="undoId" type="button" class="undo-note" @click="undo">Urungkan</button>
        <button type="button" class="dismiss-toast" aria-label="Tutup pemberitahuan" @click="dismissToast"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
      </div>
      <p v-if="undoError" class="notes-error" role="alert">{{ undoError }}</p>
    </div>

    <button class="add-note" type="button" aria-label="Tambah Catatan" @click="noteDialog?.open()">
      <span class="material-symbols-outlined">add</span
      ><span>Tambah Catatan</span>
    </button>
    <nav class="bottom-nav" aria-label="Navigasi utama">
      <button
        v-for="item in navigation"
        :key="item.label"
        type="button"
        :class="{ 'bottom-nav__item--active': menuActive(item.label) }"
        class="bottom-nav__item"
        :aria-current="menuActive(item.label) ? 'page' : undefined" @click="navigateMenu(item.label)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span
        ><span>{{ item.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.note-toast.note-toast--inline { position: static; width: auto; max-width: none; transform: none; margin: 1rem 0; box-shadow: none; }
.budget-card__name { min-width: 0; }
.budget-card__name > span:last-child, .saved-note__copy p { min-width: 0; overflow-wrap: anywhere; }
.preview-notice { display: flex; align-items: flex-start; gap: .5rem; margin: 1rem 0 0; padding: .75rem .85rem; border: 1px solid var(--line); border-radius: .65rem; color: var(--muted); background: var(--surface); font-size: .73rem; line-height: 1.6; }
.preview-notice .material-symbols-outlined { flex: none; margin-top: .1rem; color: var(--teal); font-size: 1.1rem; }
.notes-error { color: var(--danger); font-size: .78rem; line-height: 1.5; }
.recent-notes { margin-top: 1.5rem; }
.local-badge { padding: .25rem .5rem; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: .62rem; }
.note-list { padding: 0; margin: .75rem 0 0; list-style: none; }
.saved-note { display: flex; align-items: center; gap: .75rem; padding: .85rem 0; border-top: 1px solid var(--line); }
.saved-note__icon { display: grid; flex: none; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: .75rem; color: var(--teal); background: color-mix(in srgb, var(--teal) 10%, var(--surface)); font-size: 1.2rem; }
.saved-note__copy { flex: 1; min-width: 0; }
.saved-note__copy strong { display: block; overflow-wrap: anywhere; font-size: .8rem; }
.saved-note__copy p { margin: .25rem 0 0; color: var(--muted); font-size: .68rem; line-height: 1.5; }
.view-receipt { display: inline-flex; align-items: center; gap: .25rem; min-height: 2rem; margin-top: .2rem; padding: .25rem .4rem; border: 1px solid var(--line); border-radius: .4rem; color: var(--teal); background: var(--canvas); font: inherit; font-size: .7rem; cursor: pointer; }
.view-receipt .material-symbols-outlined { font-size: 1rem; }
.view-receipt:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
html.theme-dark .view-receipt { color: #74d9cb; }
.saved-note__amount { flex: none; font-size: .85rem; font-weight: 800; }
.saved-note__amount--income { color: var(--teal); }
.notes-empty { padding: 1.5rem .5rem; color: var(--muted); text-align: center; }
.notes-empty > .material-symbols-outlined { color: var(--teal); font-size: 2rem; }
.notes-empty p { margin: .5rem 0 .25rem; color: var(--ink); font-size: .82rem; font-weight: 700; }
.notes-empty > span:last-child, .notes-count { color: var(--muted); font-size: .72rem; line-height: 1.5; }
.note-toast { position: fixed; bottom: 2rem; left: calc(50% + 8.75rem); z-index: 40; width: max-content; max-width: min(32rem, calc(100% - 2rem)); transform: translateX(-50%); padding: .75rem 1rem; border: 1px solid var(--line); border-radius: .85rem; color: var(--ink); background: var(--surface); box-shadow: 0 .5rem 2rem rgb(0 0 0 / 18%); }
.note-toast__row { display: flex; align-items: center; gap: .65rem; font-size: .78rem; }
.note-toast__row > .material-symbols-outlined { color: var(--teal); font-size: 1.25rem; }
.note-toast button { min-height: 2rem; padding: .3rem; border: 0; background: transparent; color: var(--teal); font: inherit; font-weight: 800; cursor: pointer; }
.note-toast .dismiss-toast { display: grid; place-items: center; color: var(--muted); }
.dismiss-toast .material-symbols-outlined { font-size: 1.1rem; }
.note-toast button:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
html.theme-dark .saved-note__amount--income { color: #74d9cb; }
@media (max-width: 1023px) { .note-toast { bottom: 10.5rem; left: 50%; } }
@media (max-width: 480px) {
  .saved-note { flex-wrap: wrap; gap: .5rem; }
  .saved-note__copy { flex-basis: calc(100% - 3.5rem); }
  .saved-note__amount { margin-left: 3rem; }
  .note-toast { padding: .5rem .65rem; }
  .note-toast__row { gap: .4rem; font-size: .72rem; }
}
.dashboard-page {
  --teal: #006a61;
  --teal-dark: #005149;
  --teal-pale: #d2f1e9;
  --ink: #1a1c1b;
  --muted: #5d6561;
  --line: #dfe4e0;
  --canvas: #fafbf8;
  --surface: #fff;
  --warm: #816000;
  --warning: #8c5100;
  --danger: #ba1a1a;
  min-height: 100vh;
  padding-bottom: 7.5rem;
  color: var(--ink);
  background: var(--canvas);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4.25rem;
  padding: 0 1.25rem;
  background: rgb(250 251 248 / 92%);
  backdrop-filter: blur(12px);
}
.topbar__actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}
.user-greeting {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  color: var(--teal);
  font-size: 0.8125rem;
  font-weight: 800;
}
.avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  object-fit: cover;
}
.icon-button {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
}
.icon-button:hover {
  background: #edf1ed;
}
.desktop-sidebar {
  display: none;
}
.desktop-header {
  display: none;
}
.dashboard-content {
  width: min(100%, 74rem);
  margin: 0 auto;
  padding: 1.15rem 1.25rem 2rem;
}
.intro {
  padding: 0.3rem 0 0.25rem;
}
.intro h2 {
  max-width: 34rem;
  margin: 0;
  font-size: clamp(1.55rem, 5vw, 2.35rem);
  line-height: 1.18;
  letter-spacing: -0.045em;
  font-weight: 700;
}
.intro p {
  margin: 0.55rem 0 0;
  color: var(--muted);
  font-size: 0.79rem;
  line-height: 1.5;
}
.summary-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  margin-top: 1.4rem;
}
.summary-card {
  position: relative;
  display: flex;
  min-height: 7.5rem;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--surface);
}
.summary-card--primary {
  border-color: var(--teal);
  color: #fff;
  background: var(--teal);
}
.summary-card--primary::after {
  position: absolute;
  right: -1.25rem;
  bottom: -1.25rem;
  width: 5.75rem;
  height: 5.75rem;
  border: 0.75rem solid rgb(255 255 255 / 12%);
  border-radius: 999px;
  content: "";
}
.summary-card__label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
}
.summary-card__label .material-symbols-outlined {
  color: var(--teal);
  font-size: 1.2rem;
}
.summary-card--primary .summary-card__label,
.summary-card--primary .summary-card__label .material-symbols-outlined {
  color: rgb(255 255 255 / 78%);
}
.summary-card--danger .summary-card__label .material-symbols-outlined {
  color: var(--danger);
}
.summary-card__value {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 1.5rem;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.05em;
}
.summary-card__helper {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin: 0.45rem 0 0;
  color: var(--muted);
  font-size: 0.69rem;
}
.summary-card--primary .summary-card__helper {
  color: rgb(255 255 255 / 75%);
}
.summary-card__helper .material-symbols-outlined {
  font-size: 0.9rem;
}
.content-grid {
  display: grid;
  gap: 1.5rem;
  margin-top: 1.65rem;
}
.section-heading,
.savings-card__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-heading h2,
.widget-card h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}
.section-heading button {
  padding: 0.2rem 0;
  border: 0;
  color: var(--teal);
  background: transparent;
  font: inherit;
  font-size: 0.71rem;
  font-weight: 800;
  cursor: pointer;
}
.budget-list {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.8rem;
}
.budget-card {
  padding: 0.8rem;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--surface);
}
.budget-card--low {
  border-color: #f2c6c4;
  background: #fff9f9;
}
.budget-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.budget-card__name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.76rem;
  font-weight: 800;
}
.budget-icon {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 999px;
  color: var(--warm);
  background: #fff1c4;
  font-size: 1.1rem;
}
.budget-card--near-limit .budget-icon {
  color: var(--warning);
  background: #ffdcc1;
}
.budget-card--low .budget-icon {
  color: var(--danger);
  background: #ffdad6;
}
.budget-card__detail {
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--warm);
}
.budget-card--near-limit .budget-card__detail {
  color: var(--warning);
}
.budget-card--low .budget-card__detail {
  color: var(--danger);
}
.progress-track {
  height: 0.36rem;
  margin-top: 0.65rem;
  overflow: hidden;
  border-radius: 999px;
  background: #e8ece8;
}
.progress-value {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--warm);
}
.budget-card--near-limit .progress-value {
  background: var(--warning);
}
.budget-card--low .progress-value {
  background: var(--danger);
}
.weekly-summary {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 0.9rem;
  border: 1px solid #d8e8ce;
  border-radius: 0.75rem;
  background: #f0faeb;
}
.weekly-summary__icon {
  color: #48752c;
  font-size: 1.2rem;
  font-variation-settings: "FILL" 1;
}
.weekly-summary h3 {
  margin: 0;
  font-size: 0.73rem;
  font-weight: 800;
}
.weekly-summary p {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.68rem;
  line-height: 1.5;
}
.weekly-summary strong {
  color: #48752c;
}
.side-widgets {
  display: grid;
  gap: 1rem;
}
.widget-card {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--surface);
}
.bill-list {
  display: grid;
  gap: 0.5rem;
  margin: 0.65rem 0 0;
  padding: 0;
  list-style: none;
}
.bill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem;
}
.bill-row__label {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.bill-icon {
  display: grid;
  width: 2.15rem;
  height: 2.15rem;
  place-items: center;
  border-radius: 0.5rem;
  color: var(--muted);
  background: #edf0ec;
  font-size: 1.15rem;
}
.bill-row h3,
.savings-card__copy h3 {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
}
.bill-row p,
.savings-card__copy p {
  margin: 0.18rem 0 0;
  color: var(--muted);
  font-size: 0.63rem;
}
.bill-row strong {
  font-size: 0.7rem;
  white-space: nowrap;
}
.savings-card__heading > .material-symbols-outlined {
  color: var(--teal);
}
.savings-progress {
  position: relative;
  display: grid;
  width: 8rem;
  height: 8rem;
  margin: 1rem auto 0.7rem;
  place-items: center;
}
.savings-progress svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.savings-progress circle {
  fill: none;
  stroke-width: 8;
}
.savings-progress__track {
  stroke: #e8ece8;
}
.savings-progress__value {
  stroke: var(--teal);
  stroke-linecap: round;
  stroke-dasharray: 282.7;
  stroke-dashoffset: 107.4;
}
.savings-progress strong {
  font-size: 1.5rem;
  letter-spacing: -0.06em;
}
.savings-card__copy {
  text-align: center;
}
.add-note {
  position: fixed;
  right: 1.25rem;
  bottom: 6.65rem;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 1rem;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: var(--teal);
  box-shadow: 0 0.35rem 1.2rem rgb(0 0 0 / 16%);
  font: inherit;
  font-size: 0.73rem;
  font-weight: 800;
  cursor: pointer;
}
.add-note:hover {
  background: var(--teal-dark);
  transform: translateY(-2px);
}
.add-note .material-symbols-outlined {
  font-size: 1.15rem;
}
.bottom-nav {
  position: fixed;
  right: 1.25rem;
  bottom: 0.75rem;
  left: 1.25rem;
  z-index: 25;
  display: flex;
  justify-content: space-around;
  padding: 0.45rem 0.2rem max(0.45rem, env(safe-area-inset-bottom));
  border: 1px solid #edf0ec;
  border-radius: 0.85rem;
  background: rgb(255 255 255 / 96%);
  box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 7%);
  backdrop-filter: blur(12px);
}
.bottom-nav__item {
  display: flex;
  min-width: 3.4rem;
  flex-direction: column;
  align-items: center;
  gap: 0.18rem;
  border: 0;
  color: var(--muted);
  background: transparent;
  font: inherit;
  font-size: 0.56rem;
  cursor: pointer;
}
.bottom-nav__item .material-symbols-outlined {
  font-size: 1.18rem;
}
.bottom-nav__item--active {
  color: var(--teal);
  font-weight: 800;
}
.bottom-nav__item--active .material-symbols-outlined {
  font-variation-settings: "FILL" 1;
}
html.theme-dark .dashboard-page {
  --teal: #74d9cb;
  --teal-dark: #a2f1e4;
  --teal-pale: #1e4d47;
  --ink: #e1e4e1;
  --muted: #c0c8c4;
  --line: #424a47;
  --canvas: #121615;
  --surface: #1c2120;
  --warm: #f5d67c;
  --warning: #a9c7ff;
  --danger: #ffb4ab;
}
.theme-dark .topbar,
.theme-dark .desktop-header {
  background: rgb(18 22 21 / 92%);
  border-color: #424a47;
}
.theme-dark .summary-card--primary {
  border-color: #74d9cb;
  background: #0f6b62;
}
.theme-dark .budget-card--low {
  border-color: #7b3a38;
  background: #2a1b1b;
}
.theme-dark .budget-card--safe .budget-icon {
  color: #8becae;
  background: #174b29;
}
.theme-dark .budget-card--near-limit .budget-icon {
  color: #a9c7ff;
  background: #1c355d;
}
.theme-dark .weekly-summary {
  border-color: #376b47;
  background: #1b3623;
}
.theme-dark .bill-icon {
  color: #d3dad6;
  background: #2c3431;
}
.theme-dark .bottom-nav {
  border-color: #424a47;
  background: rgb(28 33 32 / 96%);
}
.theme-dark .progress-track,
.theme-dark .savings-progress__track {
  background: #36403d;
  stroke: #36403d;
}
.theme-dark .savings-progress__value {
  stroke: #74d9cb;
}
.theme-dark .desktop-sidebar {
  border-color: #424a47;
  background: #1c2120;
}
.theme-dark .desktop-sidebar__item:hover {
  background: #293431;
}
.theme-dark .desktop-sidebar__item--active {
  background: #1e4d47;
}
.theme-dark .desktop-add-note {
  color: #003731;
  background: #74d9cb;
}
.theme-dark .icon-button {
  color: #d8e0dc;
}
.theme-dark .add-note {
  color: #003731;
  background: #74d9cb;
}
@media (min-width: 48rem) {
  .dashboard-content {
    padding: 1.75rem 2rem 3rem;
  }
  .topbar {
    height: 4.75rem;
    padding: 0 2rem;
  }
  .summary-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .summary-card {
    min-height: 9rem;
  }
}
@media (min-width: 64rem) {
  .dashboard-page {
    min-height: 100vh;
    padding-bottom: 0;
  }
  .desktop-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 30;
    display: flex;
    width: 17.5rem;
    flex-direction: column;
    padding: 1.75rem 1rem;
    border-right: 1px solid var(--line);
    background: var(--surface);
  }
  .desktop-sidebar__brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0 0.75rem;
    color: var(--teal);
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: -0.04em;
  }
  .desktop-sidebar__brand .material-symbols-outlined {
    font-size: 1.4rem;
  }
  .desktop-sidebar__nav {
    display: grid;
    gap: 0.25rem;
    margin-top: 2.2rem;
  }
  .desktop-sidebar__item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.8rem 0.75rem;
    border: 0;
    border-radius: 0.6rem;
    color: var(--muted);
    background: transparent;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
  }
  .desktop-sidebar__item:hover {
    background: #eff4f1;
  }
  .desktop-sidebar__item--active {
    color: var(--teal);
    background: var(--teal-pale);
  }
  .desktop-sidebar__item .material-symbols-outlined {
    font-size: 1.2rem;
  }
  .desktop-sidebar__settings {
    margin-top: auto;
  }
  .dashboard-content {
    width: auto;
    margin-left: 17.5rem;
    padding: 2.5rem 3rem;
  }
  .content-grid {
    grid-template-columns: minmax(0, 1.5fr) minmax(16rem, 0.9fr);
    align-items: start;
  }
  .side-widgets {
    position: sticky;
    top: 2rem;
  }
  .topbar,
  .bottom-nav {
    display: none;
  }
  .add-note {
    right: 3rem;
    bottom: 2rem;
  }
}
@media (min-width: 64rem) {
  .desktop-sidebar {
    width: 17.5rem;
    padding: 2rem 0;
  }
  .desktop-sidebar__brand {
    gap: 1rem;
    padding: 0 1.5rem 2rem;
    font-size: 0.95rem;
  }
  .desktop-sidebar__brand img {
    width: 3rem;
    height: 3rem;
    border-radius: 999px;
    object-fit: cover;
  }
  .desktop-sidebar__brand strong,
  .desktop-sidebar__brand span {
    display: block;
  }
  .desktop-sidebar__brand span {
    margin-top: 0.15rem;
    color: var(--muted);
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0;
  }
  .desktop-sidebar__nav {
    gap: 0;
    margin-top: 0.25rem;
  }
  .desktop-sidebar__item {
    gap: 1rem;
    padding: 0.85rem 1.5rem;
    border-radius: 0;
    font-size: 0.78rem;
    font-weight: 500;
  }
  .desktop-sidebar__item--active {
    border-left: 0.25rem solid var(--teal);
    padding-left: 1.25rem;
    background: rgb(0 131 120 / 10%);
    font-weight: 700;
  }
  .desktop-header {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-left: 17.5rem;
    padding: 1.35rem 3rem 1rem;
    border-bottom: 1px solid #e1e3e4;
    background: var(--canvas);
  }
  .desktop-header h2 {
    margin: 0;
    font-size: 1.35rem;
    line-height: 1.2;
    letter-spacing: -0.04em;
  }
  .desktop-header p {
    margin: 0.22rem 0 0;
    color: var(--muted);
    font-size: 0.73rem;
  }
  .desktop-header__actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .desktop-add-note {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 1rem;
    border: 0;
    border-radius: 0.35rem;
    color: #fff;
    background: var(--teal);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
  }
  .desktop-add-note .material-symbols-outlined {
    font-size: 1rem;
    font-variation-settings: "FILL" 1;
  }
  .dashboard-content {
    padding-top: 1.25rem;
  }
  .intro {
    display: none;
  }
  .summary-card {
    min-height: 8.1rem;
    border-radius: 0.45rem;
  }
  .summary-card__value {
    font-size: 1.4rem;
  }
  .content-grid {
    gap: 1.5rem;
    margin-top: 1.2rem;
  }
  .section-heading h2,
  .widget-card h2 {
    font-size: 0.93rem;
  }
  .budget-card,
  .widget-card,
  .weekly-summary {
    border-radius: 0.45rem;
  }
  .budget-card--safe .budget-icon {
    color: #006b2d;
    background: #d6f7d5;
  }
  .budget-card--safe .budget-card__detail {
    color: #006b2d;
  }
  .budget-card--safe .progress-value {
    background-color: #006b2d;
  }
  .budget-card--near-limit .budget-icon {
    color: #0058be;
    background: #d8e2ff;
  }
  .budget-card--near-limit .budget-card__detail {
    color: #0058be;
  }
  .budget-card--near-limit .progress-value {
    background-color: #0058be;
  }
  .weekly-summary {
    border-color: #bfe5cb;
    background: #e5f5e9;
  }
  .weekly-summary__icon,
  .weekly-summary strong {
    color: #006b2d;
  }
  .side-widgets {
    gap: 1.5rem;
  }
  .add-note {
    display: none;
  }
}
@media (min-width: 64rem) {
  html.theme-dark .dashboard-page {
    --teal: #0d9488;
    --teal-dark: #14b8a6;
    --teal-pale: #0d9488;
    --ink: #e1e3e4;
    --muted: #cac4d0;
    --line: #333333;
    --canvas: #121212;
    --surface: #1e1e1e;
    --warm: #6bff8f;
    --warning: #a8c7fa;
    --danger: #ffb4ab;
    background: #121212;
  }
  .theme-dark .desktop-sidebar,
  .theme-dark .desktop-header {
    background: #121212;
    border-color: #333333;
  }
  .theme-dark .desktop-sidebar__item--active {
    border-left-color: #0d9488;
    background: rgb(13 148 136 / 10%);
  }
  .theme-dark .summary-card:not(.summary-card--primary),
  .theme-dark .budget-card,
  .theme-dark .widget-card {
    border-color: #333333;
    background: #1e1e1e;
  }
  .theme-dark .summary-card--primary {
    border-color: rgb(13 148 136 / 50%);
    background: #0d9488;
  }
  .theme-dark .summary-card--primary::after {
    border-color: rgb(255 255 255 / 12%);
  }
  .theme-dark .budget-card--safe .budget-icon {
    color: #6bff8f;
    background: rgb(0 107 45 / 20%);
  }
  .theme-dark .budget-card--safe .budget-card__detail {
    color: #6bff8f;
  }
  .theme-dark .budget-card--safe .progress-value {
    background-color: #6bff8f;
  }
  .theme-dark .budget-card--near-limit .budget-icon {
    color: #a8c7fa;
    background: rgb(168 199 250 / 20%);
  }
  .theme-dark .budget-card--near-limit .budget-card__detail {
    color: #a8c7fa;
  }
  .theme-dark .budget-card--near-limit .progress-value {
    background-color: #a8c7fa;
  }
  .theme-dark .budget-card--low {
    border-color: rgb(147 0 10 / 50%);
    background: #1e1e1e;
  }
  .theme-dark .budget-card--low .budget-icon {
    color: #ffb4ab;
    background: rgb(147 0 10 / 20%);
  }
  .theme-dark .progress-track {
    background: #333333;
  }
  .theme-dark .weekly-summary {
    border-color: rgb(0 107 45 / 20%);
    background: rgb(0 107 45 / 10%);
  }
  .theme-dark .weekly-summary__icon,
  .theme-dark .weekly-summary strong {
    color: #6bff8f;
  }
  .theme-dark .bill-icon {
    color: #cac4d0;
    background: #1a1a1a;
  }
  .theme-dark .savings-progress {
    background: #333333;
    border-radius: 999px;
  }
  .theme-dark .savings-progress__track {
    stroke: #49454f;
  }
  .theme-dark .savings-progress__value {
    stroke: #0d9488;
  }
  .theme-dark .desktop-add-note {
    color: #fff;
    background: #0d9488;
  }
  .theme-dark .desktop-add-note:hover {
    background: #14b8a6;
  }
}
</style>
