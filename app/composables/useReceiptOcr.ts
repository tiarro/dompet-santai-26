import { startReceiptOcr, type ReceiptOcrJob, type ReceiptOcrProgress } from '~/utils/receiptOcrWorker'
import type { ReceiptTotal } from '~/utils/receiptTotal'

export function useReceiptOcr() {
  const baseURL = useRuntimeConfig().app.baseURL
  const busy = ref(false)
  const progress = ref<ReceiptOcrProgress>({ stage: 'loading', percent: 0 })
  const result = ref<ReceiptTotal | null>(null)
  const error = ref('')
  const cancelled = ref(false)
  let job: ReceiptOcrJob | undefined
  let version = 0

  function reset() {
    version++
    job?.cancel()
    job = undefined
    busy.value = false
    result.value = null
    error.value = ''
    cancelled.value = false
    progress.value = { stage: 'loading', percent: 0 }
  }

  async function read(image: string) {
    reset()
    const request = version
    busy.value = true
    try {
      job = startReceiptOcr(image, baseURL, value => { if (request === version) progress.value = value })
      const value = await job.result
      if (request === version) result.value = value
    } catch (reason) {
      if (request === version) error.value = reason instanceof Error ? reason.message : 'Struk belum dapat dibaca. Isi nominal secara manual atau coba lagi.'
    } finally {
      if (request === version) { busy.value = false; job = undefined }
    }
  }

  function cancel() { reset(); cancelled.value = true }
  onBeforeUnmount(reset)
  return { busy, progress, result, error, cancelled, read, reset, cancel }
}
