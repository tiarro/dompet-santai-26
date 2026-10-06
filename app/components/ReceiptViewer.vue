<script setup lang="ts">
import type { ReceiptAttachment } from '~/utils/receipts'

const dialog = ref<HTMLDialogElement | null>(null)
const receipt = ref<ReceiptAttachment>()
const zoomed = ref(false)
let previousOverflow = ''

async function open(photo: ReceiptAttachment) {
  if (dialog.value?.open) return
  receipt.value = photo
  zoomed.value = false
  await nextTick()
  // The account or parent form may have changed while waiting for the render.
  if (!receipt.value || !dialog.value) return
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
}
function close() {
  if (dialog.value?.open) {
    dialog.value.close()
    document.body.style.overflow = previousOverflow
  }
  receipt.value = undefined
}
function backdropClick(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}
function trapFocus(event: KeyboardEvent) {
  event.stopPropagation()
  if (event.key !== 'Tab') return
  const buttons = dialog.value?.querySelectorAll<HTMLButtonElement>('button')
  const first = buttons?.[0]
  const last = buttons?.[buttons.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
onBeforeUnmount(close)
defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialog" class="receipt-viewer" aria-label="Foto struk" @keydown="trapFocus" @cancel.stop.prevent="close" @click="backdropClick">
    <template v-if="receipt">
      <header>
        <div><h2>Foto struk</h2><p>{{ receipt.name }}</p></div>
        <button type="button" aria-label="Tutup foto struk" autofocus @click="close"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
      </header>
      <div class="receipt-image-area" :class="{ zoomed }" tabindex="0" role="region" aria-label="Gambar struk, dapat digulir">
        <img :src="receipt.dataUrl" alt="Foto struk tersimpan">
      </div>
      <footer>
        <span>Geser untuk melihat seluruh struk.</span>
        <button type="button" :aria-pressed="zoomed" @click="zoomed = !zoomed">
          <span class="material-symbols-outlined" aria-hidden="true">{{ zoomed ? 'zoom_out' : 'zoom_in' }}</span>
          {{ zoomed ? 'Sesuaikan layar' : 'Perbesar' }}
        </button>
      </footer>
    </template>
  </dialog>
</template>

<style scoped>
.receipt-viewer { width: min(52rem, calc(100% - 2rem)); max-width: calc(100% - 2rem); max-height: 92dvh; margin: auto; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 1rem; color: var(--ink); background: var(--surface); font: inherit; box-shadow: 0 20px 80px rgb(0 0 0 / 30%); }
.receipt-viewer[open] { display: flex; flex-direction: column; }
.receipt-viewer::backdrop { background: rgb(9 22 19 / 75%); backdrop-filter: blur(5px); }
header, footer { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.2rem; }
header { border-bottom: 1px solid var(--line); }
header > div { min-width: 0; }
h2 { margin: 0; font-size: 1rem; }
header p { margin: .3rem 0 0; overflow-wrap: anywhere; color: var(--muted); font-size: .75rem; }
button { display: flex; flex: none; align-items: center; justify-content: center; gap: .3rem; min-height: 2.5rem; padding: .4rem .6rem; border: 1px solid var(--line); border-radius: .6rem; color: var(--ink); background: var(--canvas); font: inherit; font-size: .75rem; cursor: pointer; }
button .material-symbols-outlined { font-size: 1.2rem; }
button:focus-visible, .receipt-image-area:focus-visible { outline: 2px solid var(--teal); outline-offset: -3px; }
.receipt-image-area { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 1rem; background: var(--canvas); }
img { display: block; max-width: 100%; height: auto; margin: 0 auto; background: #fff; }
.zoomed img { max-width: none; min-width: 100%; }
footer { border-top: 1px solid var(--line); color: var(--muted); font-size: .7rem; }
@media (max-width: 639px) { .receipt-viewer { width: calc(100% - 1rem); max-width: calc(100% - 1rem); max-height: 95dvh; } header, footer { padding: .8rem; gap: .5rem; } .receipt-image-area { padding: .5rem; } }
</style>

