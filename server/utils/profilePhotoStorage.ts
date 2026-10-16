import { createClient } from '@supabase/supabase-js'
import { createError, getHeader, type H3Event } from 'h3'

export const profilePhotoBucket = 'profile-photos'
export const profilePhotoLimit = 256 * 1024

// The bucket stays private with no client policies. Every access is authorized here.
export async function profilePhotoStorage(event: H3Event, config: { url: string; secretKey: string }) {
  const authorization = getHeader(event, 'authorization')
  if (!authorization?.startsWith('Bearer ') || authorization.length <= 7) throw createError({ statusCode: 401, statusMessage: 'Silakan masuk kembali.' })
  if (!config.url || !config.secretKey) throw createError({ statusCode: 503, statusMessage: 'Penyimpanan foto belum tersedia.' })
  const client = createClient(config.url, config.secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data, error } = await client.auth.getUser(authorization.slice(7))
  if (error || !data.user) throw createError({ statusCode: 401, statusMessage: 'Silakan masuk kembali.' })
  return { client, path: data.user.id + '/avatar.jpg' }
}

export async function ensureProfilePhotoBucket(client: Awaited<ReturnType<typeof profilePhotoStorage>>['client']) {
  let result = await client.storage.getBucket(profilePhotoBucket)
  if (result.error && (String(result.error.statusCode) === '404' || /bucket not found/i.test(result.error.message))) {
    const created = await client.storage.createBucket(profilePhotoBucket, { public: false, fileSizeLimit: profilePhotoLimit, allowedMimeTypes: ['image/jpeg'] })
    if (created.error && !['409', 'Duplicate'].includes(String(created.error.statusCode)) && !/already exists/i.test(created.error.message)) throw createError({ statusCode: 503, statusMessage: 'Penyimpanan foto belum tersedia.' })
    result = await client.storage.getBucket(profilePhotoBucket)
  }
  if (result.error || !result.data || result.data.public) throw createError({ statusCode: 503, statusMessage: 'Penyimpanan foto privat belum tersedia.' })
}
