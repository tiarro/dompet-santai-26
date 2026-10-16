<script setup lang="ts">
import { noteAccounts } from '~/utils/notes'
import { validateDocuments, type FinanceBackup } from '~/utils/backup'
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const emit = defineEmits<{ 'edit-profile': [] }>()
const { data, ready, error, refresh, save, backup, prepareRestore, resetFingerprint, replace } = useSettings()
const draft = ref(JSON.parse(JSON.stringify(data.value)))
const initial = ref(JSON.stringify(draft.value))
const dirty = computed(() => JSON.stringify(draft.value) !== initial.value)
const notice = ref('')
const formError = ref('')
const busy = ref(false)
const hasDraft = dirty
const confirmDialog = ref<HTMLDialogElement | null>(null)
const confirmation = ref<'restore' | 'reset' | 'logout'>('reset')
const pendingBackup = shallowRef<FinanceBackup | null>(null)
const fingerprint = ref('')
const confirmText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const backupSummary = computed(() => pendingBackup.value ? validateDocuments(pendingBackup.value.documents) : null)
const title = computed(() => confirmation.value === 'restore' ? 'Pulihkan backup' : confirmation.value === 'reset' ? 'Reset data keuangan' : 'Keluar akun')
let allowLeave = false
function loadDraft() {
  draft.value = JSON.parse(JSON.stringify(data.value))
  initial.value = JSON.stringify(draft.value)
}
watch(data, () => { if (!dirty.value) loadDraft() }, { deep: true })
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; formError.value = ''; notice.value = ''
  try { await action() }
  catch (reason) { formError.value = reason instanceof Error ? reason.message : 'Perubahan belum tersimpan. Coba lagi.' }
  finally { busy.value = false }
}
function saveSettings() {
  return run(async () => {
    await save({ openingBalances: draft.value.openingBalances, activeAccounts: draft.value.activeAccounts, theme: draft.value.theme, reminders: draft.value.reminders }, draft.value.revision)
    loadDraft()
    notice.value = 'Pengaturan berhasil disimpan.'
  })
}
function downloadBackup() {
  return run(async () => {
    const exported = await backup()
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'dompet-santai-backup-' + exported.exportedAt.slice(0, 10) + '.json'
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice.value = 'Backup dibuat. Simpan file ini di tempat pribadi; isinya mencakup catatan dan foto struk.'
  })
}
async function chooseBackup(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await run(async () => {
    if (hasDraft.value) throw new Error('Simpan atau batalkan isian sebelum memulihkan backup.')
    if (file.size > 15_000_000) throw new Error('Ukuran backup maksimal 15 MB.')
    const prepared = await prepareRestore(await file.text())
    pendingBackup.value = prepared.backup; fingerprint.value = prepared.fingerprint; fileName.value = file.name
    confirmation.value = 'restore'; confirmText.value = ''
    confirmDialog.value?.showModal()
  })
  if (fileInput.value) fileInput.value.value = ''
}
function openConfirmation(kind: 'reset' | 'logout') {
  formError.value = ''
  if (hasDraft.value) { formError.value = 'Simpan atau batalkan isian sebelum melanjutkan.'; return }
  try {
    if (kind === 'reset') fingerprint.value = resetFingerprint()
    confirmation.value = kind; confirmText.value = ''
    confirmDialog.value?.showModal()
  } catch (reason) { formError.value = reason instanceof Error ? reason.message : 'Konfirmasi belum bisa dibuka.' }
}
function confirmAction() {
  if (confirmation.value === 'reset' && confirmText.value !== 'RESET') return
  return run(async () => {
    if (confirmation.value === 'logout') {
      const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' })
      if (logoutError) throw new Error('Belum berhasil keluar. Periksa koneksi lalu coba lagi.')
      allowLeave = true
      confirmDialog.value?.close()
      await navigateTo('/login')
      return
    }
    await replace(confirmation.value === 'restore' ? pendingBackup.value : null, fingerprint.value)
    loadDraft()
    notice.value = confirmation.value === 'restore' ? 'Backup berhasil dipulihkan.' : 'Data keuangan akun ini sudah direset. Saldo awal menjadi nol.'
    confirmDialog.value?.close()
    pendingBackup.value = null
  })
}
function beforeUnload(event: BeforeUnloadEvent) { if (hasDraft.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(() => allowLeave || !hasDraft.value || window.confirm('Ada isian pengaturan yang belum disimpan. Tinggalkan halaman?'))
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload); confirmDialog.value?.close() })
</script>

<template>
  <section class="settings-page">
    <header class="settings-heading"><p class="eyebrow">Sesuai kebiasaanmu</p><h2>Pengaturan</h2><p>Kelola akun, dompet, dan kenyamanan mencatat.</p></header>
    <p v-if="notice" class="success" role="status">{{ notice }}</p>
    <p v-if="formError" class="error" role="alert">{{ formError }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <nav class="settings-links" aria-label="Bagian pengaturan"><a href="#profil">Profil</a><a href="#dompet">Dompet</a><a href="#tampilan">Tampilan</a><a href="#pengingat">Pengingat</a><a href="#data">Data</a></nav>

    <section id="profil" class="settings-card">
      <div class="section-heading"><span class="material-symbols-outlined" aria-hidden="true">person</span><div><h3>Profil dan akun</h3><p>Atur nama, bio, dan gender melalui panel profil.</p></div></div>
      <label>Email<input :value="user?.email ?? ''" readonly type="email"></label>
      <div class="actions"><button type="button" class="primary" :disabled="busy" @click="emit('edit-profile')">Edit Profil</button><button type="button" class="danger" :disabled="busy" @click="openConfirmation('logout')">Keluar Akun</button></div>
    </section>

    <form class="settings-form" @submit.prevent="saveSettings">
      <fieldset :disabled="busy || !ready">
        <section id="dompet" class="settings-card">
          <div class="section-heading"><span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span><div><h3>Dompet dan saldo awal</h3><p>Saldo awal adalah uang sebelum catatan pertama. Perubahannya menghitung ulang saldo tersedia.</p></div></div>
          <div class="wallet-grid"><article v-for="wallet in noteAccounts.filter(item => item.id !== 'savings')" :key="wallet.id" class="wallet-setting"><label class="check"><input v-model="draft.activeAccounts" type="checkbox" :value="wallet.id">{{ wallet.label }} aktif</label><label>Saldo awal {{ wallet.label }} (Rp)<input v-model.number="draft.openingBalances[wallet.id]" type="number" min="0" max="999999999999" step="1" inputmode="numeric" required></label></article></div>
          <p class="hint">Dompet bersaldo atau terkait anggaran harus diselesaikan sebelum dinonaktifkan. Saldo awal tidak dicatat sebagai pemasukan.</p>
          <label class="check"><input v-model="draft.activeAccounts" type="checkbox" value="savings">Tampilkan dompet Tabungan lama pada catatan</label>
          <p class="hint">Target tabungan tetap dikelola melalui menu Tabungan. Dana target tidak bisa dibelanjakan langsung.</p>
        </section>
        <div class="preferences-grid">
          <section id="tampilan" class="settings-card"><div class="section-heading"><span class="material-symbols-outlined" aria-hidden="true">palette</span><div><h3>Tampilan</h3><p>Tema tersimpan untuk akun ini.</p></div></div><label>Tema aplikasi<select v-model="draft.theme"><option value="system">Ikuti perangkat</option><option value="light">Terang</option><option value="dark">Gelap</option></select></label><p class="hint">Bahasa Indonesia · Mata uang Rupiah</p></section>
          <section id="pengingat" class="settings-card"><div class="section-heading"><span class="material-symbols-outlined" aria-hidden="true">notifications</span><div><h3>Pengingat</h3><p>Muncul saat aplikasi dibuka.</p></div></div><label class="check"><input v-model="draft.reminders.notes" type="checkbox">Ingatkan mencatat setiap hari</label><label>Waktu pengingat<input v-model="draft.reminders.time" type="time" required :disabled="!draft.reminders.notes"></label><label class="check"><input v-model="draft.reminders.savings" type="checkbox">Tampilkan pengingat menabung</label><p class="hint">Pengingat catatan berhenti setelah ada catatan hari ini. Jadwal menabung mengikuti setiap target. Tidak mengirim notifikasi saat aplikasi ditutup.</p></section>
        </div>
        <div class="settings-save"><p v-if="dirty">Ada perubahan yang belum disimpan.</p><div class="actions"><button class="secondary" type="button" @click="async () => { await refresh(); loadDraft() }">Muat ulang isian</button><button class="primary" :disabled="!dirty">Simpan Pengaturan</button></div></div>
      </fieldset>
    </form>

    <CloudMigrationCard />

    <section id="data" class="settings-card">
      <div class="section-heading"><span class="material-symbols-outlined" aria-hidden="true">backup</span><div><h3>Data dan penyimpanan</h3><p>Backup lokal tetap tersedia; data utama tersimpan di Supabase.</p></div></div>
      <p class="hint">Backup memuat catatan dan struk, anggaran, kategori, tabungan, serta pengaturan. Pemulihan hanya untuk akun yang sama dan mengganti data keuangan yang tersimpan. Profil dan sesi masuk tidak disertakan.</p>
      <div class="actions"><button class="primary" :disabled="busy || !ready" @click="downloadBackup">Unduh Backup</button><label class="secondary file-button">Pilih Backup<input ref="fileInput" type="file" accept=".json,application/json" aria-label="Pilih file backup" :disabled="busy" @change="chooseBackup"></label><button class="danger" :disabled="busy" @click="openConfirmation('reset')">Reset Data Keuangan</button></div>
      <p class="hint">Supabase menjadi sumber data utama setelah migrasi. Unduh backup secara berkala sebagai cadangan. Reset mengosongkan data keuangan akun ini dan mengatur saldo awal menjadi nol. Pengingat tagihan disimpan terpisah dan tidak termasuk backup, pemulihan, atau reset ini. Catatan yang menunggu sinkronisasi juga tersimpan terpisah di perangkat; selesaikan atau hapus antreannya sebelum memulihkan atau mereset data.</p>
    </section>
    <dialog ref="confirmDialog" :aria-label="title" class="settings-dialog" @cancel="busy && $event.preventDefault()">
      <h3>{{ title }}</h3>
      <template v-if="confirmation === 'restore'"><p>Ganti data keuangan akun ini dengan <strong>{{ fileName }}</strong>?</p><p v-if="backupSummary">{{ backupSummary.notes.length }} catatan · {{ backupSummary.budgets.length }} anggaran · {{ backupSummary.savings.goals.filter(goal => !goal.deleted).length }} target tabungan</p><p>Data yang ada akan diganti. Unduh backup saat ini sebelum melanjutkan.</p></template>
      <template v-else-if="confirmation === 'reset'"><p>Seluruh catatan, struk, anggaran, kategori tambahan, target tabungan, dan pengaturan keuangan akun ini akan dikosongkan. Akun tetap ada.</p><label>Ketik RESET untuk melanjutkan<input v-model="confirmText" autocomplete="off"></label></template>
      <p v-else>Keluar dari akun? Data keuangan tetap tersimpan untuk akunmu.</p>
      <p v-if="formError" class="error" role="alert">{{ formError }}</p>
      <div class="actions"><button class="secondary" :disabled="busy" @click="confirmDialog?.close()">Batal</button><button class="primary" :disabled="busy || (confirmation === 'reset' && confirmText !== 'RESET')" @click="confirmAction">{{ busy ? 'Memproses...' : confirmation === 'restore' ? 'Ya, Pulihkan Backup' : confirmation === 'reset' ? 'Ya, Reset Data' : 'Ya, Keluar Akun' }}</button></div>
    </dialog>
  </section>
</template>

<style scoped>
.settings-page { color: var(--ink); min-width: 0; }
.settings-heading { margin-bottom: 1.5rem; }.settings-heading h2 { font-size: clamp(1.8rem,4vw,2.4rem); letter-spacing: -.04em; margin: .4rem 0; }.eyebrow { color: var(--teal); font-weight: 800; font-size: .75rem; }
p { line-height: 1.7; }.settings-heading > p:last-child,.hint,.section-heading p { color: var(--muted); font-size: .82rem; }.settings-links { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1.5rem; }.settings-links a { color: var(--teal); border: 1px solid var(--line); border-radius: 99px; padding: .5rem .9rem; font-size: .8rem; text-decoration: none; }
.settings-card { background: var(--surface); border: 1px solid var(--line); border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.2rem; scroll-margin-top: 6rem; min-width: 0; }.section-heading { display: flex; align-items: flex-start; gap: .8rem; margin-bottom: 1.3rem; }.section-heading > span { color: var(--teal); padding: .6rem; border-radius: .7rem; background: color-mix(in srgb,var(--teal) 10%,var(--surface)); }.section-heading h3 { font-size: 1.05rem; margin: .1rem 0; }.section-heading p { margin: .3rem 0 0; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }label { display: grid; gap: .5rem; font-weight: 700; font-size: .82rem; margin-bottom: 1rem; }input,select,button { font: inherit; }input,select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 2.8rem; border: 1px solid var(--line); background: var(--canvas); color: var(--ink); border-radius: .6rem; padding: .65rem .8rem; }input[readonly] { color: var(--muted); }.check { display: flex; align-items: center; gap: .6rem; line-height: 1.6; }.check input { width: 1.1rem; min-height: 1.1rem; height: 1.1rem; accent-color: var(--teal); flex: none; }
.wallet-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 1rem; }.wallet-setting { padding: 1rem; border: 1px solid var(--line); border-radius: .8rem; }.wallet-setting label:last-child { margin: 0; }.preferences-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }.actions { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin-top: 1rem; }button,.file-button { cursor: pointer; }.primary,.secondary,.danger { display: inline-flex; justify-content: center; align-items: center; min-height: 2.75rem; border-radius: .6rem; padding: .65rem 1rem; font-weight: 800; font-size: .8rem; box-sizing: border-box; }.primary { border: 1px solid var(--teal); background: var(--teal); color: white; }.secondary { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }.danger { border: 1px solid var(--line); color: var(--danger); background: transparent; }button:disabled,fieldset:disabled { opacity: .6; }button:disabled { cursor: not-allowed; }
.settings-save { display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 1rem; margin: 0 0 1.5rem; }.settings-save p { font-size: .8rem; color: var(--muted); }.settings-save .actions { margin: 0; }
.file-button { margin: 0; position: relative; overflow: hidden; }.file-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }.file-button:focus-within { outline: 3px solid var(--teal); outline-offset: 2px; }.success,.error { border-radius: .6rem; padding: .8rem 1rem; font-size: .85rem; overflow-wrap: anywhere; }.success { color: var(--teal); background: color-mix(in srgb,var(--teal) 10%,var(--surface)); }.error { color: var(--danger); background: color-mix(in srgb,var(--danger) 8%,var(--surface)); }
.settings-dialog { box-sizing: border-box; width: min(32rem,calc(100vw - 2rem)); max-height: 85dvh; overflow: auto; border: 1px solid var(--line); border-radius: 1rem; padding: 1.5rem; color: var(--ink); background: var(--surface); }.settings-dialog::backdrop { background: rgb(0 0 0 / 55%); }.settings-dialog p { font-size: .85rem; overflow-wrap: anywhere; }button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible { outline: 3px solid var(--teal); outline-offset: 3px; }
@media(max-width:700px) { .wallet-grid,.preferences-grid { grid-template-columns: 1fr; }.settings-card { padding: 1.1rem; }.settings-save { justify-content: flex-start; } }
#profil input[type="email"] { color: var(--teal); font-size: .9375rem; font-weight: 600; background: color-mix(in srgb, var(--teal) 5%, var(--surface)); }
</style>

