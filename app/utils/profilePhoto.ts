export const profilePhotoAccept = 'image/jpeg,image/png,image/webp'
export const maxProfilePhotoBytes = 256 * 1024

export function googleProfilePhoto(metadata?: Record<string, unknown>): string | null {
  for (const value of [metadata?.avatar_url, metadata?.picture]) {
    if (typeof value !== 'string') continue
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' && url.hostname.endsWith('.googleusercontent.com') && !url.username && !url.password) return url.href
    } catch { /* Ignore absent or invalid provider metadata. */ }
  }
  return null
}

export function photoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Foto tidak bisa dibaca. Pilih foto lain.'))
    reader.readAsDataURL(blob)
  })
}

export async function prepareProfilePhoto(file: File) {
  if (!profilePhotoAccept.split(',').includes(file.type)) throw new Error('Gunakan foto JPG, PNG, atau WebP.')
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Ukuran foto maksimal 10 MB.')
  const url = URL.createObjectURL(file)
  try {
    const photo = new Image()
    photo.src = url
    try { await photo.decode() } catch { throw new Error('Foto tidak bisa dibaca. Pilih foto lain.') }
    if (!photo.naturalWidth || !photo.naturalHeight || photo.naturalWidth * photo.naturalHeight > 60_000_000) throw new Error('Resolusi foto terlalu besar. Pilih foto yang lebih kecil.')
    const side = Math.min(photo.naturalWidth, photo.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.min(side, 512)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Browser belum bisa memproses foto ini.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(photo, (photo.naturalWidth - side) / 2, (photo.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
    for (const quality of [.85, .7, .55]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= maxProfilePhotoBytes) return { blob, preview: await photoDataUrl(blob) }
    }
    throw new Error('Foto masih terlalu besar. Pilih foto lain.')
  } finally { URL.revokeObjectURL(url) }
}
