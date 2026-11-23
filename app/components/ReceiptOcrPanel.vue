<script setup lang="ts">
import { formatRupiah } from '~/utils/currency'

const props = defineProps<{ image: string; autoRead: boolean; currentAmount: number | null; disabled: boolean }>()
const emit = defineEmits<{ useAmount: [amount: number] }>()
const { busy, progress, result, error, cancelled, read, reset, cancel } = useReceiptOcr()
watch([() => props.image, () => props.autoRead], ([image, autoRead]) => {
  if (image && autoRead) void read(image)
  else reset()
}, { immediate: true })
</script>

<template>
  <section class="receipt-ocr" aria-label="Pembacaan nominal struk" :aria-busy="busy">
    <h4>Baca nominal dari struk</h4>
    <p class="ocr-hint">Foto dibaca di perangkat ini. Periksa hasilnya sebelum digunakan.</p>
    <template v-if="busy">
      <p role="status">{{ progress.stage === 'recognizing' ? `Membaca struk… ${progress.percent}%` : 'Menyiapkan pembaca struk…' }}</p>
      <progress :value="progress.percent" max="100" aria-label="Progres pembacaan struk" />
      <button type="button" :disabled="disabled" @click="cancel">Batalkan pembacaan</button>
    </template>
    <template v-else>
      <div v-if="result?.status === 'found'" class="ocr-result" role="status">
        <p>Nominal terbaca: <strong>{{ formatRupiah(result.amount) }}</strong></p>
        <p v-if="currentAmount && currentAmount !== result.amount" class="ocr-hint">Nominal yang sudah diisi akan diganti jika hasil ini digunakan.</p>
        <button type="button" :disabled="disabled || currentAmount === result.amount" @click="emit('useAmount', result.amount)">{{ currentAmount === result.amount ? 'Nominal sudah sesuai' : 'Gunakan nominal' }}</button>
      </div>
      <p v-else-if="result" role="status">{{ result.status === 'ambiguous' ? 'Ada beberapa total yang berbeda. Periksa struk dan isi nominal secara manual.' : 'Total belum terbaca dengan jelas. Isi nominal secara manual atau coba foto yang lebih jelas.' }}</p>
      <p v-if="error" class="ocr-error" role="alert">{{ error }}</p>
      <p v-if="cancelled" role="status">Pembacaan dibatalkan. Kamu tetap bisa mengisi nominal secara manual.</p>
      <button type="button" :disabled="disabled" @click="read(image)">{{ result || error || cancelled ? 'Baca ulang struk' : 'Baca nominal' }}</button>
    </template>
  </section>
</template>

<style scoped>
.receipt-ocr { min-width: 0; padding: .9rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--canvas); color: var(--ink); }
h4 { margin: 0 0 .5rem; font-size: .85rem; }
p { margin: .5rem 0; font-size: .8rem; line-height: 1.6; overflow-wrap: anywhere; }
.ocr-hint { color: var(--muted); }
.ocr-result strong { color: var(--ink); white-space: nowrap; }
.ocr-error { color: var(--danger); }
button { min-height: 44px; padding: .65rem .85rem; margin: .3rem .4rem .1rem 0; border: 1px solid var(--line); border-radius: .55rem; background: var(--surface); color: var(--teal); font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; }
button:disabled { opacity: .65; cursor: default; }
progress { display: block; width: 100%; height: .6rem; margin: .7rem 0; accent-color: var(--teal); }
</style>
