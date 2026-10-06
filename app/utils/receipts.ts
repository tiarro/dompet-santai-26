export interface ReceiptAttachment {
  name: string
  dataUrl: string
}

export const maxReceiptInputBytes = 10 * 1024 * 1024
export const maxReceiptDataUrlLength = 520_000
export const receiptAccept = 'image/jpeg,image/png,image/webp'

export function isReceiptAttachment(value: unknown): value is ReceiptAttachment {
  if (!value || typeof value !== 'object') return false
  const receipt = value as ReceiptAttachment
  return typeof receipt.name === 'string' && receipt.name.trim().length > 0 && receipt.name.length <= 120
    && typeof receipt.dataUrl === 'string' && receipt.dataUrl.length <= maxReceiptDataUrlLength
    && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(receipt.dataUrl)
}

// Browser-only: decode the image, normalize orientation, flatten transparency and omit metadata.
export async function prepareReceipt(file: File): Promise<ReceiptAttachment> {
  if (!receiptAccept.split(',').includes(file.type)) {
    throw new Error('Gunakan foto JPG, PNG, atau WebP.')
  }
  if (!file.size || file.size > maxReceiptInputBytes) {
    throw new Error('Ukuran foto maksimal 10 MB. Pilih foto yang lebih kecil.')
  }
  const url = URL.createObjectURL(file)
  try {
    const photo = new Image()
    photo.src = url
    try {
      await photo.decode()
    } catch {
      throw new Error('Foto tidak bisa dibaca. Pilih foto lain atau ambil ulang struknya.')
    }
    if (!photo.naturalWidth || !photo.naturalHeight || photo.naturalWidth * photo.naturalHeight > 60_000_000) {
      throw new Error('Resolusi foto terlalu besar. Pilih foto dengan resolusi lebih kecil.')
    }
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Foto belum bisa diproses di browser ini. Coba pilih foto lain.')
    let scale = Math.min(1, 2400 / Math.max(photo.naturalWidth, photo.naturalHeight))
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(photo, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', .85 - attempt * .06)
      if (dataUrl.length <= maxReceiptDataUrlLength) {
        const receipt = { name: file.name.trim().slice(0, 120) || 'Foto struk.jpg', dataUrl }
        if (!isReceiptAttachment(receipt)) throw new Error('Foto belum bisa diproses. Silakan coba foto lain.')
        return receipt
      }
      scale *= .8
    }
    throw new Error('Foto masih terlalu besar. Potong bagian di luar struk lalu coba lagi.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

