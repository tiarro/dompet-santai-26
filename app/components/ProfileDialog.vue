<script setup lang="ts">
import { prepareProfilePhoto, profilePhotoAccept } from '~/utils/profilePhoto'
const props = defineProps<{ image: string; savePhoto: (photo: Blob) => Promise<void> }>()
const user = useSupabaseUser()
const session = useSupabaseSession()
const supabase = useSupabaseClient()
const cloud = useCloudFinance()
const profile = computed(() => user.value)
const dialog = ref<HTMLDialogElement | null>(null)
const content = ref<HTMLElement | null>(null)
const draft = reactive({ name: '', bio: '', gender: '' })
const pendingPhoto = shallowRef<Awaited<ReturnType<typeof prepareProfilePhoto>> | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)
const processingPhoto = ref(false)
const photoError = ref('')
let photoRequest = 0
const initial = ref('')
const dirty = computed(() => JSON.stringify(draft) !== initial.value || !!pendingPhoto.value)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const discarding = ref(false)
const opened = ref(false)
const genders = [
  { value: '', label: 'Tidak ingin menyebutkan' },
  { value: 'female', label: 'Perempuan' },
  { value: 'male', label: 'Laki-laki' },
  { value: 'nonbinary', label: 'Nonbiner' },
]
let previousOverflow = ''
function open() {
  if (!dialog.value || opened.value) return
  const metadata = profile.value?.user_metadata
  draft.name = typeof metadata?.username === 'string' ? metadata.username.trim() : ''
  draft.bio = typeof metadata?.bio === 'string' ? metadata.bio : ''
  draft.gender = genders.some(item => item.value === metadata?.gender) ? metadata!.gender : ''
  initial.value = JSON.stringify(draft)
  error.value = ''; notice.value = ''; discarding.value = false
  pendingPhoto.value = null; photoError.value = ''; processingPhoto.value = false
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  opened.value = true
  dialog.value.showModal()
  content.value?.scrollTo(0, 0)
}
function close() {
  if (!opened.value) return
  ++photoRequest
  pendingPhoto.value = null; processingPhoto.value = false
  dialog.value?.close()
  document.body.style.overflow = previousOverflow
  opened.value = false
}
function requestClose() {
  if (busy.value || processingPhoto.value) return
  if (dirty.value) { discarding.value = true; return }
  close()
}
async function choosePhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value || discarding.value) return
  const request = ++photoRequest
  processingPhoto.value = true; photoError.value = ''; notice.value = ''
  try {
    const prepared = await prepareProfilePhoto(file)
    if (opened.value && request === photoRequest) pendingPhoto.value = prepared
  } catch (reason) {
    if (request === photoRequest) photoError.value = reason instanceof Error ? reason.message : 'Foto tidak bisa diproses.'
  } finally { if (request === photoRequest) processingPhoto.value = false }
}
async function save() {
  if (busy.value || processingPhoto.value || !dirty.value) return
  const owner = user.value?.sub
  const name = draft.name.trim()
  const bio = draft.bio.trim()
  error.value = ''; notice.value = ''
  if (!owner) { error.value = 'Silakan masuk kembali untuk menyimpan profil.'; return }
  if (name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) { error.value = 'Nama maksimal 40 karakter tanpa karakter kontrol.'; return }
  if (bio.length > 150 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(bio)) { error.value = 'Bio maksimal 150 karakter tanpa karakter kontrol.'; return }
  if (!genders.some(item => item.value === draft.gender)) { error.value = 'Pilih gender yang tersedia.'; return }
  busy.value = true
  try {
    if (JSON.stringify(draft) !== initial.value) {
      if (!cloud.ready.value) throw new Error(cloud.error.value || 'Profil belum siap disimpan.')
      await cloud.save({ ...cloud.data.value, profile: { ...cloud.data.value.profile, username: name, bio, gender: draft.gender } })
      const { error: updateError } = await supabase.auth.updateUser({ data: { username: name, bio, gender: draft.gender } })
      if (updateError) throw updateError
    }
    if (user.value?.sub !== owner) return
    draft.name = name; draft.bio = bio
    initial.value = JSON.stringify(draft)
    if (pendingPhoto.value) {
      await props.savePhoto(pendingPhoto.value.blob)
      pendingPhoto.value = null
    }
    notice.value = 'Profil berhasil disimpan.'
  } catch {
    error.value = pendingPhoto.value ? 'Foto belum tersimpan. Isian profil yang berhasil disimpan tetap tersedia. Coba simpan foto lagi.' : 'Profil belum tersimpan. Periksa koneksi lalu coba lagi.'
  } finally { busy.value = false }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (opened.value && dirty.value) { event.preventDefault(); event.returnValue = '' }
}
watch(() => user.value?.sub, () => close())
onBeforeRouteLeave(() => !opened.value || (!busy.value && (!dirty.value || window.confirm('Buang perubahan profil yang belum disimpan?'))))
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { close(); window.removeEventListener('beforeunload', beforeUnload) })
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="profile-dialog" aria-labelledby="profile-dialog-title" @cancel.prevent="requestClose" @click="$event.target === dialog && requestClose()">
    <header class="profile-header">
      <h2 id="profile-dialog-title">Edit profil</h2>
      <button type="button" class="close-button" aria-label="Tutup edit profil" :disabled="busy || processingPhoto" @click="requestClose"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
    </header>
    <div ref="content" class="profile-content">
      <div class="profile-photo">
        <img :src="pendingPhoto?.preview || image" :alt="pendingPhoto ? 'Pratinjau foto profil' : 'Foto profil'" width="80" height="80">
        <input ref="photoInput" class="photo-input" type="file" :accept="profilePhotoAccept" aria-label="Pilih foto profil" :disabled="busy || processingPhoto || discarding" @change="choosePhoto">
        <div class="photo-actions"><button type="button" class="photo-button" :disabled="busy || processingPhoto || discarding" @click="photoInput?.click()">{{ processingPhoto ? 'Memproses foto...' : 'Ubah foto' }}</button><button v-if="pendingPhoto" type="button" class="photo-button" :disabled="busy || processingPhoto || discarding" @click="pendingPhoto = null; photoError = ''">Batalkan foto</button></div>
        <small>JPG, PNG, atau WebP, maksimal 10 MB.<br>Foto dipotong persegi otomatis.</small>
        <p v-if="photoError" class="message error" role="alert">{{ photoError }}</p>
        <div v-if="profile?.email" class="profile-email">
          <span class="material-symbols-outlined profile-email__icon" aria-hidden="true">mail</span>
          <div><span class="profile-email__label">Email akun</span><p class="profile-email__value">{{ profile.email }}</p></div>
        </div>
      </div>
      <form @submit.prevent="save">
        <fieldset :disabled="busy || processingPhoto || discarding">
          <label for="profile-name">Nama</label>
          <input id="profile-name" v-model="draft.name" type="text" autocomplete="nickname" maxlength="40" placeholder="Nama panggilanmu">
          <div class="label-row"><label for="profile-bio">Bio</label><span id="profile-bio-count">{{ draft.bio.length }}/150</span></div>
          <textarea id="profile-bio" v-model="draft.bio" maxlength="150" rows="3" placeholder="Ceritakan sedikit tentang dirimu" aria-describedby="profile-bio-count"></textarea>
          <label for="profile-gender">Gender</label>
          <select id="profile-gender" v-model="draft.gender"><option v-for="gender in genders" :key="gender.value" :value="gender.value">{{ gender.label }}</option></select>
          <p class="hint">Bio dan gender boleh dikosongkan.</p>
          <p v-if="error" class="message error" role="alert">{{ error }}</p>
          <p v-if="notice" class="message success" role="status">{{ notice }}</p>
          <button class="save-button" type="submit" :disabled="busy || processingPhoto || !dirty">{{ busy ? 'Menyimpan...' : 'Simpan Profil' }}</button>
        </fieldset>
      </form>
      <div v-if="discarding" class="discard-prompt" role="alert">
        <p>Buang perubahan profil yang belum disimpan?</p>
        <div><button type="button" class="keep-button" @click="discarding = false">Lanjut edit</button><button type="button" class="discard-button" @click="close">Buang perubahan</button></div>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.profile-dialog { box-sizing: border-box; width: min(440px, calc(100vw - 2rem)); max-height: min(90dvh, 760px); padding: 0; border: 1px solid var(--line); border-radius: 1.5rem; background: var(--surface); color: var(--ink); box-shadow: 0 24px 80px rgb(0 0 0 / 20%); overflow: hidden; }
.profile-dialog[open] { display: flex; flex-direction: column; animation: profile-enter .2s ease-out; }
.profile-dialog::backdrop { background: rgb(0 0 0 / 45%); backdrop-filter: blur(4px); }
.profile-header { flex: none; display: flex; align-items: center; justify-content: space-between; padding: .85rem 1.5rem; border-bottom: 1px solid color-mix(in srgb, var(--ink) 18%, var(--surface)); background: var(--surface); }
h2 { margin: 0; font-size: 1.1rem; letter-spacing: -.02em; }
button, input, textarea, select { font: inherit; }
button { cursor: pointer; }
.close-button { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; background: transparent; color: var(--ink); border: 0; border-radius: 50%; }
.close-button:hover { background: var(--canvas); }
.profile-content { flex: 1 1 auto; min-height: 0; padding: 1.5rem; overflow-y: auto; overflow-x: hidden; overscroll-behavior-y: contain; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: var(--line) transparent; scroll-padding-block: 1.5rem; }
.profile-photo { text-align: center; margin-bottom: 1.75rem; }
.profile-photo img { border-radius: 50%; object-fit: cover; border: 3px solid var(--line); }
.photo-input { display: none; }
.photo-actions { display: flex; justify-content: center; gap: .5rem; }
.photo-button { min-height: 44px; border: 0; background: transparent; color: var(--teal); font-size: .85rem; font-weight: 800; padding: .5rem; }
.profile-photo small { display: block; color: var(--muted); font-size: .72rem; line-height: 1.5; }
.profile-photo > .message { margin: .6rem 0 0; overflow-wrap: anywhere; }
.profile-email { display: flex; align-items: center; gap: .75rem; margin-top: 1.2rem; padding: .85rem 1rem; border: 1px solid color-mix(in srgb, var(--teal) 18%, var(--line)); border-radius: .85rem; background: color-mix(in srgb, var(--teal) 5%, var(--surface)); text-align: left; }
.profile-email > div { min-width: 0; }
.profile-email__icon { flex-shrink: 0; font-size: 1.25rem; color: var(--teal); }
.profile-email__label { display: block; color: var(--muted); font-size: .625rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.profile-email__value { margin: .2rem 0 0; color: var(--teal); font-size: .9375rem; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
label { display: block; font-weight: 700; font-size: .85rem; margin-bottom: .5rem; }
input, textarea, select { box-sizing: border-box; display: block; width: 100%; min-height: 48px; border: 1px solid var(--line); border-radius: .75rem; padding: .8rem; background: var(--canvas); color: var(--ink); font-size: 16px; margin-bottom: 1.2rem; }
textarea { resize: vertical; min-height: 100px; }
.label-row { display: flex; align-items: baseline; justify-content: space-between; }
.label-row span, .hint { font-size: .75rem; color: var(--muted); }
.hint { margin: -.5rem 0 1.5rem; }
.save-button { width: 100%; min-height: 48px; border: 0; border-radius: .8rem; background: var(--teal); color: white; font-weight: 800; }
button:disabled { opacity: .55; cursor: not-allowed; }
.message { padding: .8rem; border-radius: .6rem; font-size: .85rem; line-height: 1.5; }
.error { color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, var(--surface)); }
.success { color: var(--teal); background: color-mix(in srgb, var(--teal) 8%, var(--surface)); }
.discard-prompt { border-top: 1px solid var(--line); margin-top: 1.25rem; font-size: .85rem; line-height: 1.5; }
.discard-prompt > div { display: flex; flex-wrap: wrap; gap: .5rem; }
.discard-prompt button { flex: 1; min-height: 44px; padding: .5rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--surface); font-weight: 700; }
.keep-button { color: var(--ink); }.discard-button { color: var(--danger); }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid var(--teal); outline-offset: 3px; }
@keyframes profile-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 600px) { .profile-dialog { box-sizing: border-box; width: 100%; max-width: 100%; margin: auto 0 0; max-height: 92dvh; border-radius: 1.5rem 1.5rem 0 0; border-bottom: 0; }.profile-content { padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); } }
@media (prefers-reduced-motion: reduce) { .profile-dialog[open] { display: flex; flex-direction: column; animation: none; } }
</style>


