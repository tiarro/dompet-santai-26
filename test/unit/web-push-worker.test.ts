import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

async function worker(owner = 'current') {
  const handlers: Record<string, (event: any) => void> = {}
  const showNotification = vi.fn()
  const openWindow = vi.fn()
  const request: any = { result: { transaction: () => {
    const transaction: any = { objectStore: () => ({ get: () => ({ result: owner }), put: (value: string) => { owner = value; return {} } }) }
    queueMicrotask(() => transaction.oncomplete())
    return transaction
  }, close: () => {} } }
  const self = { addEventListener: (name: string, callback: (event: any) => void) => { handlers[name] = callback },
    registration: { showNotification }, location: { origin: 'https://app.example' }, clients: { matchAll: async () => [], openWindow } }
  runInNewContext(readFileSync('public/push-sw.js', 'utf8'), { self, indexedDB: { open: () => { queueMicrotask(() => request.onsuccess()); return request } }, Date, URL })
  async function push(data: unknown) {
    let pending: Promise<unknown> | undefined
    handlers.push!({ data: { json: () => data }, waitUntil: (promise: Promise<unknown>) => { pending = promise } })
    await pending
  }
  return { handlers, showNotification, openWindow, push }
}
describe('push worker account and expiry guards', () => {
  it('shows only current account reminders before expiry', async () => {
    const w = await worker()
    const payload = { kind: 'notes', owner: 'current', date: '2026-11-23', expiresAt: Date.now() + 60000 }
    await w.push({ ...payload, owner: 'someone-else' })
    await w.push({ ...payload, expiresAt: Date.now() - 1 })
    await w.push({ ...payload, kind: 'unknown' })
    expect(w.showNotification).not.toHaveBeenCalled()
    await w.push(payload)
    expect(w.showNotification).toHaveBeenCalledWith('Sudah mencatat hari ini?', expect.objectContaining({ tag: 'dompet-santai-notes-2026-11-23', data: { url: '/?pengingat=catatan' } }))
  })
  it('suppresses the previous account after owner cleanup', async () => {
    const w = await worker()
    let pending: Promise<unknown> | undefined
    w.handlers.message!({ data: { type: 'PUSH_OWNER', owner: '' }, ports: [{ postMessage: vi.fn() }], waitUntil: (promise: Promise<unknown>) => { pending = promise } })
    await pending
    await w.push({ kind: 'notes', owner: 'current', expiresAt: Date.now() + 60000 })
    expect(w.showNotification).not.toHaveBeenCalled()
  })
})
