<script setup lang="ts">
import AddNoteDialog from './AddNoteDialog.vue'
import CardPagination from './CardPagination.vue'
import { categoryCatalog } from '~/utils/categories'
import { noteAccounts, getSpendableBalances, localDate, type NoteDraft, type MoneyNote } from '~/utils/notes'
import { canChangePending, type PendingNote } from '~/utils/pendingNotes'
import { formatRupiah } from '~/utils/currency'

const pending = usePendingNotes()
const { items, error, running, owner, online } = pending
const cloud = useCloudFinance()
const { save: saveCategory } = useCategories()
const catalog = computed(() => categoryCatalog(cloud.data.value.customCategories))
const accounts = computed(() => {
  const data = cloud.data.value
  const balances = getSpendableBalances(data.notes, localDate(), data.savings.movements, data.settings.openingBalances)
  return noteAccounts.filter(account => data.settings.activeAccounts.includes(account.id)).map(account => ({ ...account, balance: balances[account.id] ?? 0 }))
})
const editor = ref<InstanceType<typeof AddNoteDialog> | null>(null)
const selected = ref<PendingNote>()
const deleting = ref('')
const actionError = ref('')
function edit(item: PendingNote) { selected.value = item; actionError.value = ''; editor.value?.edit(item.note) }
async function saveEdit(_original: MoneyNote, draft: NoteDraft) {
  if (!selected.value) throw new Error('Buka kembali catatan tertunda.')
  return pending.edit(selected.value, draft)
}
async function remove(item: PendingNote) {
  try { await pending.discard(item); deleting.value = ''; actionError.value = '' }
  catch (reason) { actionError.value = (reason as Error).message }
}
function updated() { if (online.value) void pending.sync() }
watch(owner, () => { editor.value?.close(); selected.value = undefined; deleting.value = ''; actionError.value = '' })
</script>

<template>
  <section v-if="items.length || error" class="pending-notes" aria-labelledby="pending-notes-title">
    <header><div class="pending-heading"><span class="material-symbols-outlined" aria-hidden="true">cloud_upload</span><div><h2 id="pending-notes-title">Catatan belum tersinkron <span>{{ items.length }}</span></h2><p>Tersimpan di perangkat ini. Saldo resmi berubah setelah sinkronisasi berhasil.</p></div></div><button type="button" :disabled="!online || running" @click="pending.sync(true)">{{ running ? 'Menyinkronkan…' : 'Sinkronkan sekarang' }}</button></header>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="pending.reload">Muat ulang antrean</button></p>
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <CardPagination :items="items" label="Catatan Tertunda" :reset-key="owner" v-slot="{ items: entries }">
      <ul class="pending-list"><li v-for="item in entries" :key="item.key">
        <div class="pending-copy"><span class="pending-status" :class="{ blocked: item.status === 'blocked' }">{{ item.lease && running ? 'Menyinkronkan' : item.status === 'blocked' ? 'Perlu diperbaiki' : 'Menunggu sinkronisasi' }}</span><h3>{{ item.note.description || catalog[item.note.type].find(category => category.id === item.note.category)?.label || 'Catatan tertunda' }}</h3><p>{{ item.note.type === 'income' ? 'Pemasukan' : 'Pengeluaran' }} · {{ formatRupiah(item.note.amount) }} · {{ item.note.date }} · {{ noteAccounts.find(account => account.id === item.note.account)?.label }}</p><p v-if="item.error" class="pending-error">{{ item.error }}</p><p v-if="item.attemptedFingerprint" class="pending-hint">Pengiriman sebelumnya sedang diperiksa. Sinkronkan untuk memastikan transaksi tidak tercatat dua kali sebelum mengubah atau menghapusnya.</p></div>
        <div class="pending-actions"><button type="button" :disabled="!canChangePending(item) || running || !cloud.ready.value" @click="edit(item)">Perbaiki</button><button type="button" :disabled="!canChangePending(item) || running" @click="deleting = item.key">Hapus</button></div>
        <div v-if="deleting === item.key" class="pending-discard" role="alert"><p>Hapus catatan yang belum tersinkron ini dari perangkat?</p><button type="button" :disabled="running" @click="remove(item)">Ya, hapus catatan tertunda</button><button type="button" @click="deleting = ''">Batal</button></div>
      </li></ul>
    </CardPagination>
    <AddNoteDialog ref="editor" pending-mode :catalog="catalog" :save-category="saveCategory" :categories-ready="cloud.ready.value" :ready="cloud.ready.value" :save="pending.enqueue" :update="saveEdit" :accounts="accounts" :budgets="cloud.data.value.budgets" :budgets-ready="cloud.ready.value" :notes="cloud.data.value.notes" :transfers="cloud.data.value.savings.movements" :openings="cloud.data.value.settings.openingBalances" :active-accounts="cloud.data.value.settings.activeAccounts" @updated="updated" />
  </section>
</template>

<style scoped>
.pending-notes { margin: 1rem var(--home-space, 1.5rem); padding: 1rem; color: var(--ink); background: var(--surface); border: 1px solid color-mix(in srgb, var(--teal) 40%, var(--line)); border-radius: 1rem; }
header, .pending-heading, .pending-actions { display: flex; align-items: center; gap: .75rem; }
header { justify-content: space-between; flex-wrap: wrap; }
.pending-heading > span { padding: .7rem; color: var(--teal); background: color-mix(in srgb, var(--teal) 12%, var(--surface)); border-radius: .8rem; }
h2 { margin: 0; font-size: 1rem; } h2 span { color: var(--teal); margin-left: .4rem; }
p { margin: .45rem 0; color: var(--muted); font-size: .78rem; line-height: 1.6; }
button { min-height: 2.75rem; padding: .55rem .75rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--surface); color: var(--ink); font: inherit; font-size: .78rem; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; } button:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
.pending-list { list-style: none; margin: .75rem 0 0; padding: 0; }
li { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; padding: 1rem 0; border-top: 1px solid var(--line); }
.pending-copy { flex: 1; min-width: min(100%, 14rem); overflow-wrap: anywhere; }
h3 { margin: .6rem 0 0; font-size: .9rem; }
.pending-status { display: inline-block; border-radius: 1rem; padding: .3rem .6rem; background: color-mix(in srgb, var(--teal) 12%, var(--surface)); color: var(--teal); font-size: .68rem; font-weight: 700; }
.pending-status.blocked { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, var(--surface)); }
.pending-error { color: var(--danger); }.pending-discard { flex-basis: 100%; }
.pending-discard button + button { margin-left: .5rem; }
@media (min-width: 64rem) { .pending-notes { margin-left: 17rem; margin-right: 2rem; } }
</style>
