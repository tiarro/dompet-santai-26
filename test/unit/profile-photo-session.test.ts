import { beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useProfilePhoto } from '../../app/composables/useProfilePhoto'

const session = ref<Record<string, unknown> | null>(null)
const user = ref<{ sub: string; user_metadata?: Record<string, unknown> } | null>(null)
const stored = ref<{ owner: string; image: string | null }>({ owner: '', image: null })
vi.mock('../../node_modules/@nuxtjs/supabase/dist/runtime/composables/useSupabaseSession.js', () => ({ useSupabaseSession: () => session }))
vi.mock('../../node_modules/@nuxtjs/supabase/dist/runtime/composables/useSupabaseUser.js', () => ({ useSupabaseUser: () => user }))
vi.mock('../../node_modules/nuxt/dist/app/composables/state.js', () => ({ useState: () => stored }))
beforeEach(() => {
  session.value = null; user.value = null
  stored.value = { owner: '', image: null }
})

it('renders an SSR session without session.user using the account claims', () => {
  session.value = { access_token: 'server-session-token' }
  user.value = { sub: 'account-123' }
  stored.value = { owner: 'account-123', image: 'saved-photo.jpg' }
  const photo = useProfilePhoto('placeholder.jpg')
  expect(photo.image.value).toBe('saved-photo.jpg')
})

it('renders an empty session without exposing another accounts cached photo', () => {
  session.value = {}
  user.value = { sub: 'account-456' }
  stored.value = { owner: 'account-123', image: 'private-photo.jpg' }
  expect(useProfilePhoto('placeholder.jpg').image.value).toBe('placeholder.jpg')
})

it('handles an absent session and refuses uploads without an account or token', async () => {
  const photo = useProfilePhoto('placeholder.jpg')
  expect(photo.image.value).toBe('placeholder.jpg')
  await expect(photo.savePhoto(new Blob(['photo']))).rejects.toThrow('Silakan masuk kembali')
  user.value = { sub: 'account-123' }
  await expect(photo.savePhoto(new Blob(['photo']))).rejects.toThrow('Silakan masuk kembali')
})

it('uses the Google photo from claims even when SSR omits session.user', () => {
  session.value = { access_token: 'server-session-token' }
  user.value = { sub: 'google-account', user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/a/avatar' } }
  const photo = useProfilePhoto('placeholder.jpg')
  expect(photo.image.value).toBe('https://lh3.googleusercontent.com/a/avatar')
  stored.value = { owner: 'google-account', image: 'uploaded.jpg' }
  expect(photo.image.value).toBe('uploaded.jpg')
})

it('changes the Google photo with the account and clears it on logout', () => {
  user.value = { sub: 'first', user_metadata: { picture: 'https://lh3.googleusercontent.com/a/first' } }
  const photo = useProfilePhoto('placeholder.jpg')
  expect(photo.image.value).toBe('https://lh3.googleusercontent.com/a/first')
  stored.value = { owner: 'first', image: 'private-first.jpg' }
  user.value = { sub: 'second', user_metadata: { picture: 'https://lh3.googleusercontent.com/a/second' } }
  expect(photo.image.value).toBe('https://lh3.googleusercontent.com/a/second')
  user.value = null
  expect(photo.image.value).toBe('placeholder.jpg')
})

it('ignores unsafe image metadata and uses picture when avatar_url is invalid', () => {
  user.value = { sub: 'account', user_metadata: { avatar_url: 'javascript:alert(1)', picture: 'https://lh3.googleusercontent.com/a/photo' } }
  const photo = useProfilePhoto('placeholder.jpg')
  expect(photo.image.value).toBe('https://lh3.googleusercontent.com/a/photo')
  user.value.user_metadata = { avatar_url: 'https://googleusercontent.com.attacker.test/photo' }
  expect(photo.image.value).toBe('placeholder.jpg')
})
