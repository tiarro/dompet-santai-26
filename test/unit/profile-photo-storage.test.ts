import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { profilePhotoStorage, ensureProfilePhotoBucket } from '../../server/utils/profilePhotoStorage'

const { getUser, getBucket, createBucket, createClient } = vi.hoisted(() => {
  const getUser = vi.fn(), getBucket = vi.fn(), createBucket = vi.fn()
  return { getUser, getBucket, createBucket, createClient: vi.fn(() => ({ auth: { getUser }, storage: { getBucket, createBucket } })) }
})
vi.mock('@supabase/supabase-js', () => ({ createClient }))
const config = { url: 'https://example.supabase.co', secretKey: 'server-only-test-key' }
function event(token?: string) {
  const req = new IncomingMessage(new Socket())
  req.headers = token ? { authorization: 'Bearer ' + token, 'x-user-id': 'other-user' } : {}
  req.url = '/api/profile/photo?owner=other-user'
  return createEvent(req, new ServerResponse(req))
}
beforeEach(() => vi.clearAllMocks())
describe('private profile photos', () => {
  it('rejects missing and invalid tokens before storage access', async () => {
    await expect(profilePhotoStorage(event(), config)).rejects.toMatchObject({ statusCode: 401 })
    expect(createClient).not.toHaveBeenCalled()
    getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('Invalid JWT') })
    await expect(profilePhotoStorage(event('forged'), config)).rejects.toMatchObject({ statusCode: 401 })
    expect(getBucket).not.toHaveBeenCalled()
  })
  it('uses only the verified account ID for the storage path', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'verified-owner' } }, error: null })
    const result = await profilePhotoStorage(event('valid-token'), config)
    expect(result.path).toBe('verified-owner/avatar.jpg')
    expect(getUser).toHaveBeenCalledWith('valid-token')
    expect(createClient).toHaveBeenCalledWith(config.url, config.secretKey, expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }))
  })
  it('refuses an accidentally public bucket', async () => {
    getBucket.mockResolvedValueOnce({ data: { public: true }, error: null })
    await expect(ensureProfilePhotoBucket(createClient() as any)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('creates a missing private bucket with JPEG and size restrictions', async () => {
    getBucket.mockResolvedValueOnce({ data: null, error: { statusCode: 404, message: 'Bucket not found' } }).mockResolvedValueOnce({ data: { public: false }, error: null })
    createBucket.mockResolvedValueOnce({ error: null })
    await ensureProfilePhotoBucket(createClient() as any)
    expect(createBucket).toHaveBeenCalledWith('profile-photos', { public: false, fileSizeLimit: 262144, allowedMimeTypes: ['image/jpeg'] })
  })
})
