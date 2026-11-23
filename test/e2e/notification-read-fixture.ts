import type { Page } from '@playwright/test'

export function notificationReadService() {
  return { rows: new Map<string, { user_id: string; read_key: string; read_at: string }>(),
    failReads: false, failWrites: false, readDelay: 0, writes: 0, reads: 0 }
}
const defaults = new WeakMap<object, ReturnType<typeof notificationReadService>>()

export async function mockNotificationReads(page: Page, service?: ReturnType<typeof notificationReadService>) {
  if (!service) {
    service = defaults.get(page.context())
    if (!service) { service = notificationReadService(); defaults.set(page.context(), service) }
  }
  const store = service
  await page.route('**/rest/v1/notification_reads*', async route => {
    const request = route.request(), url = new URL(request.url())
    const token = request.headers().authorization?.replace(/^Bearer /, '') ?? ''
    let owner = ''
    try { owner = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()).sub } catch { /* No mock identity. */ }
    if (!owner) { await route.fulfill({ status: 401, json: {} }); return }
    if (request.method() === 'POST') {
      store.writes++
      if (store.failWrites) { await route.fulfill({ status: 503, json: { message: 'Unavailable' } }); return }
      const rows = request.postDataJSON() as Array<{ user_id: string; read_key: string; read_at: string }>
      if (rows.some(row => row.user_id !== owner)) { await route.fulfill({ status: 403, json: {} }); return }
      for (const row of rows) if (!store.rows.has(row.user_id + ':' + row.read_key)) store.rows.set(row.user_id + ':' + row.read_key, row)
      await route.fulfill({ status: 201, body: '' })
    } else if (request.method() === 'GET') {
      store.reads++
      if (store.readDelay) await new Promise(resolve => setTimeout(resolve, store.readDelay))
      if (store.failReads) { await route.fulfill({ status: 503, json: { message: 'Unavailable' } }); return }
      const requested = url.searchParams.get('user_id')?.replace(/^eq\./, '')
      const cursor = url.searchParams.get('read_key')?.replace(/^gt\./, '') ?? ''
      const rows = [...store.rows.values()].filter(row => row.user_id === owner && row.user_id === requested && row.read_key > cursor)
        .sort((a, b) => a.read_key < b.read_key ? -1 : 1).slice(0, Number(url.searchParams.get('limit') ?? 500))
      await route.fulfill({ json: rows })
    } else await route.fulfill({ status: 403, json: {} })
  })
  return store
}
