import { profilePhotoBucket, profilePhotoStorage } from '../../utils/profilePhotoStorage'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const { client, path } = await profilePhotoStorage(event, useRuntimeConfig(event).profileStorage)
  const { data, error } = await client.storage.from(profilePhotoBucket).download(path)
  if (error) {
    if (String(error.statusCode) === '404' || /not found|does not exist/i.test(error.message)) {
      setResponseStatus(event, 204)
      return null
    }
    throw createError({ statusCode: 503, statusMessage: 'Foto profil belum bisa dimuat.' })
  }
  setHeader(event, 'Content-Type', 'image/jpeg')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return new Uint8Array(await data.arrayBuffer())
})
