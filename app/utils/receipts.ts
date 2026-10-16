export interface ReceiptAttachment {
  name: string
  dataUrl: string
  path?: string
}

export const maxReceiptInputBytes = 10 * 1024 * 1024
export const maxReceiptDataUrlLength = 520_000
export const receiptAccept = 'image/jpeg,image/png,image/webp'

export function isReceiptAttachment(value: unknown): value is ReceiptAttachment {
  if (!value || typeof value !== 'object') return false
  const receipt = value as ReceiptAttachment
  return typeof receipt.name === 'string' && receipt.name.trim().length > 0 && receipt.name.length <= 120
    && typeof receipt.dataUrl === 'string' && receipt.dataUrl.length <= maxReceiptDataUrlLength
    && (/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(receipt.dataUrl) || (receipt.dataUrl === '' && typeof receipt.path === 'string' && receipt.path.length > 0))
    && (receipt.path === undefined || (typeof receipt.path === 'string' && receipt.path.length <= 300))
}

// Browser-only: decode the image, normalize orientation, flatten transparency and omit metadata.
export async function prepareReceipt(file: File): Promise<ReceiptAttachment> {
  if (!receiptAccept.split(',').includes(file.type)) {
    throw new Error('Gunakan foto JPG, PNG, atau WebP.')
  }
  if (!file.size || file.size > maxReceiptInputBytes) {
    throw new Error('Foto struk maksimal 10 MB.')
  }
  const url = URL.createObjectURL(file)
  try {
    const photo = new Image()
    photo.src = url
    await photo.decode()
    if (!photo.naturalWidth || !photo.naturalHeight || photo.naturalWidth * photo.naturalHeight > 60_000_000) {
      throw new Error('Resolusi foto terlalu besar. Pilih foto lain.')
    }
    let scale = Math.min(1, 2400 / Math.max(photo.naturalWidth, photo.naturalHeight))
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Foto belum bisa diproses.')
      context.drawImage(photo, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', .85 - attempt * .06)
      if (dataUrl.length <= maxReceiptDataUrlLength) {
        const receipt = { name: file.name.trim().slice(0, 120) || 'Foto struk.jpg', dataUrl }
        if (!isReceiptAttachment(receipt)) throw new Error('Foto belum bisa diproses. Silakan coba foto lain.')
        return receipt
      }
      scale *= .8
    }
  } finally {
    URL.revokeObjectURL(url)
  }
  throw new Error('Foto struk terlalu besar setelah diproses.')
}

