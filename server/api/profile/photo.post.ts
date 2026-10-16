import { ensureProfilePhotoBucket, profilePhotoBucket, profilePhotoLimit, profilePhotoStorage } from '../../utils/profilePhotoStorage'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const { client, path } = await profilePhotoStorage(event, useRuntimeConfig(event).profileStorage)
  if (getHeader(event, 'content-type')?.split(';')[0] !== 'image/jpeg') throw createError({ statusCode: 415, statusMessage: 'Gunakan foto JPEG yang sudah diproses.' })
  if (Number(getHeader(event, 'content-length')) > profilePhotoLimit) throw createError({ statusCode: 413, statusMessage: 'Foto terlalu besar.' })
  const body = await readRawBody(event, false)
  if (!body || body.length < 4 || body.length > profilePhotoLimit || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff || body[body.length - 2] !== 0xff || body[body.length - 1] !== 0xd9) throw createError({ statusCode: 400, statusMessage: 'File foto tidak valid.' })
  await ensureProfilePhotoBucket(client)
  const { error } = await client.storage.from(profilePhotoBucket).upload(path, body, { contentType: 'image/jpeg', upsert: true, cacheControl: '0' })
  if (error) throw createError({ statusCode: 503, statusMessage: 'Foto belum tersimpan. Coba lagi.' })
  return { saved: true }
})
