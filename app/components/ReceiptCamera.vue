<script setup lang="ts">
const emit = defineEmits<{ captured: [file: File]; chooseFile: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const starting = ref(false)
const capturing = ref(false)
const ready = ref(false)
const errorMessage = ref('')
const cameras = ref<MediaDeviceInfo[]>([])
let stream: MediaStream | null = null
let generation = 0
let previousOverflow = ''

function stopStream() {
  const current = stream
  stream = null
  current?.getTracks().forEach(track => track.stop())
  if (video.value) video.value.srcObject = null
  ready.value = false
}
function cameraError(error: unknown) {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Akses kamera ditolak. Izinkan kamera melalui pengaturan situs di browser, lalu coba lagi.'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Kamera tidak ditemukan. Hubungkan kamera atau pilih foto dari galeri.'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'Kamera sedang digunakan atau tidak bisa dibuka. Tutup aplikasi lain yang memakai kamera, lalu coba lagi.'
  if (name === 'OverconstrainedError') return 'Kamera yang dipilih tidak tersedia. Coba buka kamera lagi.'
  return 'Kamera belum bisa dibuka. Periksa izin kamera atau pilih foto dari galeri.'
}
async function startCamera(deviceId?: string) {
  const request = ++generation
  stopStream()
  starting.value = true
  capturing.value = false
  errorMessage.value = ''
  if (!window.isSecureContext) {
    errorMessage.value = 'Kamera membutuhkan koneksi HTTPS. Buka aplikasi melalui HTTPS, atau localhost saat memakai komputer ini.'
    starting.value = false
    return
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    errorMessage.value = 'Browser ini belum mendukung kamera langsung. Gunakan browser terbaru atau pilih foto dari galeri.'
    starting.value = false
    return
  }
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
        width: { ideal: 1920 }, height: { ideal: 1080 },
      },
    })
    // A permission prompt may resolve after the user has closed this dialog.
    if (request !== generation || !dialog.value?.open || !video.value) {
      acquired.getTracks().forEach(track => track.stop())
      return
    }
    stream = acquired
    video.value.srcObject = acquired
    acquired.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (stream !== acquired) return
      stopStream()
      errorMessage.value = 'Kamera terputus. Hubungkan kembali kamera, lalu coba lagi.'
    }))
    await video.value.play()
    if (request !== generation || stream !== acquired) return
    ready.value = video.value.readyState >= 2 && video.value.videoWidth > 0
    starting.value = false
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      if (request === generation) cameras.value = devices.filter(device => device.kind === 'videoinput')
    } catch {
      // The camera can still take a photo when device enumeration is unavailable.
    }
  } catch (error) {
    if (request !== generation) return
    stopStream()
    errorMessage.value = cameraError(error)
  } finally {
    if (request === generation) starting.value = false
  }
}
function open() {
  if (!dialog.value || dialog.value.open) return
  cameras.value = []
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
  void startCamera()
}
function close() {
  generation++
  stopStream()
  starting.value = false
  capturing.value = false
  errorMessage.value = ''
  if (dialog.value?.open) {
    dialog.value.close()
    document.body.style.overflow = previousOverflow
  }
}
function switchCamera() {
  if (starting.value || capturing.value || cameras.value.length < 2) return
  const currentId = stream?.getVideoTracks()[0]?.getSettings().deviceId
  const index = cameras.value.findIndex(camera => camera.deviceId === currentId)
  const next = cameras.value[(index + 1) % cameras.value.length]
  if (next) void startCamera(next.deviceId)
}
async function capture() {
  const frame = video.value
  if (!ready.value || starting.value || capturing.value || !frame || !frame.videoWidth || !frame.videoHeight) return
  const request = generation
  capturing.value = true
  errorMessage.value = ''
  try {
    const scale = Math.min(1, 2400 / Math.max(frame.videoWidth, frame.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(frame.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(frame.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.drawImage(frame, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .9))
    if (request !== generation || !dialog.value?.open) return
    if (!blob) throw new Error('Capture failed')
    const photo = new File([blob], 'struk-' + Date.now() + '.jpg', { type: 'image/jpeg' })
    close()
    emit('captured', photo)
  } catch {
    if (request === generation) errorMessage.value = 'Foto belum berhasil diambil. Coba jepret sekali lagi.'
  } finally {
    if (request === generation) capturing.value = false
  }
}
function chooseFile() {
  close()
  emit('chooseFile')
}
function handleKeys(event: KeyboardEvent) {
  event.stopPropagation()
  if (event.key !== 'Tab') return
  const buttons = Array.from(dialog.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])
    .filter(button => button.getClientRects().length > 0)
  const first = buttons[0]
  const last = buttons.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
function onVisibilityChange() {
  if (document.hidden) close()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', close)
})
onBeforeUnmount(() => {
  close()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pagehide', close)
})
defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialog" class="receipt-camera" aria-label="Kamera struk" @keydown="handleKeys" @cancel.stop.prevent="close">
    <header>
      <div><h2>Ambil foto struk</h2><p>Posisikan seluruh struk agar terlihat jelas.</p></div>
      <button type="button" class="camera-close" aria-label="Tutup kamera" autofocus @click="close"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
    </header>
    <div class="camera-content">
      <div class="camera-viewport" :aria-busy="starting">
        <video ref="video" autoplay muted playsinline aria-label="Pratinjau kamera langsung" />
        <div v-if="starting" class="camera-placeholder" role="status"><span class="material-symbols-outlined" aria-hidden="true">photo_camera</span><p>Membuka kamera...</p><span>Izinkan akses kamera jika diminta oleh browser.</span></div>
        <div v-else-if="!ready" class="camera-placeholder" aria-hidden="true"><span class="material-symbols-outlined">no_photography</span></div>
        <span v-if="ready" class="camera-live"><span aria-hidden="true" />Kamera aktif</span>
      </div>
      <p v-if="errorMessage" class="camera-error" role="alert">{{ errorMessage }}</p>
      <div v-if="errorMessage && !ready" class="camera-recovery">
        <button type="button" @click="startCamera()">Coba lagi</button>
        <button type="button" @click="chooseFile">Pilih dari galeri</button>
      </div>
    </div>
    <footer>
      <button v-if="cameras.length > 1" type="button" class="switch-camera" :disabled="starting || capturing" @click="switchCamera"><span class="material-symbols-outlined" aria-hidden="true">flip_camera_ios</span>Ganti kamera</button>
      <button type="button" class="capture-photo" :disabled="!ready || starting || capturing" @click="capture"><span class="material-symbols-outlined" aria-hidden="true">photo_camera</span>{{ capturing ? 'Mengambil foto...' : 'Jepret foto' }}</button>
      <p>Hasil foto langsung ditampilkan di catatanmu.</p>
    </footer>
  </dialog>
</template>

<style scoped>
.receipt-camera { width: min(44rem, calc(100% - 2rem)); max-width: calc(100% - 2rem); max-height: 94dvh; margin: auto; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 1.2rem; color: var(--ink); background: var(--surface); font: inherit; box-shadow: 0 24px 80px rgb(0 0 0 / 30%); }
.receipt-camera[open] { display: flex; flex-direction: column; }
.receipt-camera::backdrop { background: rgb(9 22 19 / 75%); backdrop-filter: blur(5px); }
header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: .75rem; padding: 1.1rem; border-bottom: 1px solid var(--line); }
h2 { margin: 0; font-size: 1.1rem; }
header p { margin: .35rem 0 0; color: var(--muted); font-size: .72rem; line-height: 1.5; }
button { display: flex; align-items: center; justify-content: center; gap: .4rem; min-height: 2.6rem; padding: .5rem .8rem; border: 1px solid var(--line); border-radius: .65rem; color: var(--ink); background: var(--canvas); font: inherit; font-size: .78rem; cursor: pointer; }
button:disabled { opacity: .45; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
.camera-close { flex: none; padding: .5rem; }
.material-symbols-outlined { font-size: 1.3rem; }
.camera-content { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 1rem; }
.camera-viewport { position: relative; overflow: hidden; min-height: 12rem; aspect-ratio: 4 / 3; max-height: 55dvh; border-radius: .8rem; background: #101513; color: #fff; }
video { display: block; width: 100%; height: 100%; object-fit: contain; }
.camera-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .5rem; padding: 1rem; text-align: center; background: #101513; }
.camera-placeholder > .material-symbols-outlined { font-size: 2rem; color: #74d9cb; }
.camera-placeholder p { margin: .25rem 0; font-size: .9rem; font-weight: 700; }
.camera-placeholder > span:last-child { font-size: .73rem; line-height: 1.5; }
.camera-live { position: absolute; top: .7rem; left: .7rem; display: flex; align-items: center; gap: .35rem; padding: .35rem .55rem; border-radius: 999px; background: rgb(0 0 0 / 65%); font-size: .7rem; }
.camera-live > span { width: .4rem; height: .4rem; border-radius: 50%; background: #74d9cb; }
.camera-error { margin: .8rem 0 0; color: var(--danger); font-size: .78rem; line-height: 1.6; }
.camera-recovery { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .8rem; }
footer { display: flex; flex: none; flex-wrap: wrap; gap: .6rem; padding: 1rem; border-top: 1px solid var(--line); }
.capture-photo { flex: 1; min-height: 3rem; border-color: transparent; color: var(--note-on-accent); background: var(--note-accent); font-weight: 800; }
footer p { width: 100%; margin: 0; color: var(--muted); font-size: .68rem; text-align: center; }
@media (min-width: 64rem) {
  .camera-viewport {
    width: min(100%, calc(55dvh * 4 / 3));
    min-height: 0;
    max-height: none;
    margin-inline: auto;
  }
  .camera-viewport video { position: absolute; inset: 0; object-position: center; }
  .camera-live { left: 50%; transform: translateX(-50%); white-space: nowrap; }
  html.theme-dark .capture-photo { color: #fff; background: var(--teal); }
}
@media (max-width: 639px) { .receipt-camera { width: calc(100% - 1rem); max-width: calc(100% - 1rem); } header, footer { padding: .85rem; } .camera-content { padding: .75rem; } }
</style>

