import { googleProfilePhoto, photoDataUrl } from '~/utils/profilePhoto'

export function useProfilePhoto(fallback: string) {
  const session = useSupabaseSession()
  const user = useSupabaseUser()
  // Nuxt Supabase omits session.user during SSR; account identity lives in the claims.
  const owner = computed(() => user.value?.sub ?? '')
  const stored = useState<{ owner: string; image: string | null }>('profile-photo', () => ({ owner: '', image: null }))
  const image = computed(() => {
    if (!owner.value) return fallback
    if (stored.value.owner === owner.value && stored.value.image) return stored.value.image
    return googleProfilePhoto(user.value?.user_metadata) ?? fallback
  })
  let generation = 0
  function headers() {
    const token = session.value?.access_token
    if (!token) throw new Error('Silakan masuk kembali untuk menyimpan foto.')
    return { Authorization: 'Bearer ' + token }
  }
  async function load() {
    const id = owner.value
    const request = ++generation
    if (!id) { stored.value = { owner: '', image: null }; return }
    if (!session.value?.access_token || stored.value.owner === id) return
    try {
      const response = await $fetch.raw<Blob>('/api/profile/photo', { headers: headers(), responseType: 'blob' })
      const src = response.status === 204 ? null : response._data?.size ? await photoDataUrl(response._data) : null
      if (request === generation && owner.value === id) stored.value = { owner: id, image: src }
    } catch (reason) {
      if (request === generation && owner.value === id && (reason as { statusCode?: number }).statusCode === 404) stored.value = { owner: id, image: null }
    }
  }
  async function savePhoto(blob: Blob) {
    const id = owner.value
    if (!id) throw new Error('Silakan masuk kembali untuk menyimpan foto.')
    ++generation
    await $fetch('/api/profile/photo', { method: 'POST', headers: { ...headers(), 'Content-Type': 'image/jpeg' }, body: blob })
    const src = await photoDataUrl(blob)
    if (owner.value !== id) throw new Error('Akun berubah. Buka profil kembali.')
    stored.value = { owner: id, image: src }
  }
  let stop: (() => void) | undefined
  onMounted(() => { stop = watch([owner, () => session.value?.access_token], load, { immediate: true }) })
  onBeforeUnmount(() => { ++generation; stop?.() })
  return { image, savePhoto }
}
