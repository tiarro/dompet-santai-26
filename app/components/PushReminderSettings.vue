<script setup lang="ts">
import { useWebPush } from '~/composables/useWebPush'
defineProps<{ notesEnabled: boolean; unsaved: boolean }>()
const { supported, permission, enabled, busy, configured, error, notice, timezone, enable, disable, testNotification, refresh } = useWebPush()
</script>

<template>
  <div class="device-push" aria-label="Notifikasi perangkat">
    <h4>Notifikasi perangkat</h4>
    <p>Terima pengingat mencatat saat aplikasi ditutup. Aktifkan pada setiap perangkat yang ingin menerima notifikasi.</p>
    <p v-if="!supported">Gunakan HTTPS atau localhost dengan browser yang mendukung Web Push. Di iPhone/iPad, tambahkan aplikasi ke Layar Utama lalu buka dari sana (iOS 16.4 atau lebih baru).</p>
    <template v-else>
      <p v-if="!configured && !busy">Layanan notifikasi server belum siap.</p>
      <p v-if="permission === 'denied'">Izin notifikasi diblokir. Ubah izin melalui pengaturan situs pada browser.</p>
      <p v-if="timezone">Zona waktu perangkat: <strong>{{ timezone }}</strong>.</p>
      <p v-if="unsaved">Simpan perubahan pengaturan sebelum mengaktifkan notifikasi perangkat.</p>
      <p v-else-if="!notesEnabled">Aktifkan <strong>Ingatkan mencatat setiap hari</strong> dan simpan agar pengingat terjadwal dikirim.</p>
      <p v-if="enabled" class="push-active">Notifikasi perangkat aktif.</p>
      <div class="push-actions">
        <button v-if="!enabled" type="button" :disabled="busy || !configured || unsaved || !notesEnabled || permission === 'denied'" @click="enable">Aktifkan notifikasi perangkat</button>
        <template v-else>
          <button type="button" :disabled="busy" @click="testNotification">Kirim notifikasi uji</button>
          <button type="button" :disabled="busy" @click="disable">Nonaktifkan perangkat ini</button>
        </template>
        <button v-if="error" type="button" :disabled="busy" @click="refresh">Coba lagi</button>
      </div>
    </template>
    <p v-if="busy" role="status">Memperbarui notifikasi perangkat…</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p>Pengingat dikirim maksimal sekali sehari per perangkat jika catatan hari itu belum tersimpan di server. Pengiriman memerlukan koneksi internet dan dapat tertunda oleh browser atau pengaturan hemat baterai. Pengingat menabung tetap tampil di dalam aplikasi.</p>
  </div>
</template>

<style scoped>
.device-push { border-top: 1px solid var(--line); margin-top: 1rem; padding-top: 1rem; }
h4 { margin: 0 0 .5rem; font-size: .9rem; }
p { font-size: .8rem; color: var(--muted); line-height: 1.7; overflow-wrap: anywhere; }
.push-active,[role=status] { color: var(--teal); }
[role=alert] { color: var(--danger); }
.push-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
button { min-height: 2.75rem; padding: .6rem .8rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--surface); color: var(--ink); font: inherit; font-size: .8rem; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible { outline: 2px solid var(--teal); outline-offset: 3px; }
</style>
