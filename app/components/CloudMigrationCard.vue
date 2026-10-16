<script setup lang="ts">
const { ready, cloudEmpty, migrationOnline, migrateLocal, localMigrationPreview } = useSettings()
const busy = ref(false)
const notice = ref('')
const error = ref('')
const preview = ref<ReturnType<typeof localMigrationPreview> | null>(null)

onMounted(() => {
  try { preview.value = localMigrationPreview() } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Data browser belum bisa dibaca.'
  }
})

async function migrate() {
  if (busy.value || !ready.value || !migrationOnline.value) return
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    const counts = await migrateLocal()
    preview.value = counts
    notice.value = 'Migrasi berhasil: ' + counts.notes + ' catatan, ' + counts.budgets + ' anggaran, ' + counts.categories + ' kategori, dan ' + counts.goals + ' target tabungan.'
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Data lokal belum berhasil dipindahkan.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="settings-card cloud-migration">
    <div class="section-heading">
      <span class="material-symbols-outlined" aria-hidden="true">cloud_upload</span>
      <div>
        <h3>Simpan ke Supabase</h3>
        <p>Pindahkan data yang masih tersimpan di browser ke akun cloud ini.</p>
      </div>
    </div>
    <p class="hint">Tinjau jumlah data sebelum memindahkannya. Migrasi hanya tersedia jika cloud masih kosong. Data browser tetap dipertahankan sebagai cadangan.</p>
    <p v-if="preview" class="migration-counts" role="status">
      {{ preview.notes }} catatan - {{ preview.receipts }} struk - {{ preview.budgets }} anggaran - {{ preview.categories }} kategori - {{ preview.goals }} target - {{ preview.movements }} perpindahan
    </p>
    <p v-if="ready && !cloudEmpty" class="hint">Cloud sudah berisi data. Migrasi dinonaktifkan agar data akun tidak tertimpa.</p>
    <p v-if="!migrationOnline" class="error" role="alert">Hubungkan internet sebelum memulai migrasi.</p>
    <p v-if="notice" class="success" role="status">{{ notice }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button class="primary" type="button" :disabled="busy || !ready || !migrationOnline || !preview || !cloudEmpty" @click="migrate">
      {{ busy ? 'Memindahkan data...' : 'Migrasikan Data Browser' }}
    </button>
  </section>
</template>

<style scoped>
.cloud-migration { border-color: color-mix(in srgb, var(--teal) 35%, var(--line)); }
.cloud-migration .primary { margin-top: .4rem; }
.migration-counts { color: var(--ink); font-size: .82rem; font-weight: 800; line-height: 1.7; }
</style>


