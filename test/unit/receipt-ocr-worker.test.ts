import { afterEach, describe, expect, it, vi } from 'vitest'
import { startReceiptOcr } from '../../app/utils/receiptOcrWorker'

describe('browser OCR job lifecycle', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  function prepare() {
    vi.useFakeTimers()
    const terminate = vi.fn()
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } })
    vi.stubGlobal('Worker', class {
      onmessage = null
      onerror = null
      onmessageerror = null
      terminate = terminate
      postMessage() {}
    })
    return { job: startReceiptOcr('test-photo', '/', () => {}), terminate }
  }

  it('bounds a stalled worker to 60 seconds and clears its timer', async () => {
    const { job, terminate } = prepare()
    const rejection = expect(job.result).rejects.toThrow('Pembacaan terlalu lama')
    await vi.advanceTimersByTimeAsync(60_000)
    await rejection
    expect(terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels immediately without leaving a worker or timeout behind', async () => {
    const { job, terminate } = prepare()
    const rejection = expect(job.result).rejects.toMatchObject({ name: 'AbortError' })
    job.cancel()
    job.cancel()
    await rejection
    expect(terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
