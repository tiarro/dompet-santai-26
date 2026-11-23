import { extractReceiptTotal, type ReceiptTotal } from './receiptTotal'

export interface ReceiptOcrProgress { stage: 'loading' | 'recognizing'; percent: number }
export interface ReceiptOcrJob { result: Promise<ReceiptTotal>; cancel: () => void }

export function startReceiptOcr(image: string, baseURL: string, onProgress: (progress: ReceiptOcrProgress) => void): ReceiptOcrJob {
  if (typeof Worker !== 'function' || typeof WebAssembly !== 'object') {
    throw new Error('Pembaca struk belum didukung browser ini. Gunakan browser terbaru atau isi nominal secara manual.')
  }
  const url = new URL('receipt-ocr-worker.js', new URL(baseURL, window.location.origin))
  const worker = new Worker(url)
  let cancel = () => {}
  const result = new Promise<ReceiptTotal>((resolve, reject) => {
    let settled = false
    const finish = (value: ReceiptTotal | null, error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      if (error) reject(error)
      else resolve(value!)
    }
    const timer = setTimeout(() => finish(null, new Error('Pembacaan terlalu lama. Coba foto yang lebih jelas atau isi nominal secara manual.')), 60_000)
    const fail = () => finish(null, new Error('Pembaca struk belum dapat dijalankan. Coba lagi saat terhubung internet atau isi nominal secara manual.'))
    cancel = () => finish(null, new DOMException('Pembacaan dibatalkan.', 'AbortError'))
    worker.onmessage = ({ data }) => {
      if (data?.type === 'progress' && Number.isFinite(data.percent)) {
        onProgress({ stage: data.stage === 'recognizing' ? 'recognizing' : 'loading', percent: Math.max(0, Math.min(100, data.percent)) })
      } else if (data?.type === 'result' && typeof data.text === 'string' && data.text.length <= 100_000) {
        finish(extractReceiptTotal(data.text))
      } else if (data?.type === 'error' || data?.type === 'result') fail()
    }
    worker.onerror = event => { event.preventDefault(); fail() }
    worker.onmessageerror = fail
    try { worker.postMessage({ image }) } catch { fail() }
  })
  return { result, cancel: () => cancel() }
}
