import { expect, test, type Page } from './auth-fixture'
import { mockFinanceApi } from './cloud-fixture'
import { mockNotificationReads, notificationReadService } from './notification-read-fixture'

const a = '00000000-0000-4000-8000-000000000123'
const b = '00000000-0000-4000-8000-000000000456'
const readKey = (id: string, stage = 'today') => JSON.stringify(['bill', id, '2026-11-23', stage])
type Service = ReturnType<typeof notificationReadService>

async function signIn(page: Page, service: Service, id = a, bills = ['internet']) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  await page.addInitScript(() => { Reflect.deleteProperty(Crypto.prototype, 'subtle') })
  await page.clock.setFixedTime(new Date('2026-11-23T12:00:00'))
  await mockFinanceApi(page, id)
  await mockNotificationReads(page, service)
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'sync@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = encode({ alg: 'ES256', kid: 'test', typ: 'JWT' }) + '.' + encode({ sub: id, role: 'authenticated', aud: 'authenticated', email: user.email,
    exp: Math.floor(new Date('2026-11-23T12:00:00').getTime() / 1000) + 14 * 86400, iat: Math.floor(Date.now() / 1000) }) + '.' + encode('test')
  await page.route('**/auth/v1/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/token')) await route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } })
    else await route.fulfill({ json: user })
  })
  await page.route('**/api/profile/photo', route => route.fulfill({ status: 404, json: {} }))
  await page.route('**/rest/v1/bill_reminders*', route => route.fulfill({ json: bills.map(name => ({ id: name, user_id: id, name, amount: 10000,
    due_on: '2026-11-23', status: 'pending', account_code: 'cash', category_code: 'bills', recurrence: 'once', anchor_day: 23, revision: 1 })) }))
  await page.route('http://localhost:3000/**', async route => {
    if (route.request().isNavigationRequest()) {
      const headers = { ...route.request().headers() }; delete headers.cookie
      await route.continue({ headers })
    } else await route.fallback()
  })
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false)
  await page.getByLabel('Alamat email').fill(user.email)
  await page.getByLabel('Kata sandi', { exact: true }).fill('test-password-123')
  await page.getByRole('button', { name: 'Masuk ke Dompet Santai', exact: true }).click()
  await expect(page.getByTestId('page-title')).toBeVisible()
  await page.addStyleTag({ content: '#nuxt-devtools-container { display:none !important }' })
}
async function panel(page: Page) {
  await page.getByRole('button', { name: 'Lihat notifikasi', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Notifikasi' })
  await expect(dialog.locator('.notification-item').first()).toBeVisible()
  return dialog
}
async function offline(page: Page, value: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !value })
    window.dispatchEvent(new Event(value ? 'offline' : 'online'))
  }, value)
}
async function records(page: Page) {
  return page.evaluate(() => new Promise<Array<{ owner: string; readKey: string; pending: boolean }>>((resolve, reject) => {
    const request = indexedDB.open('dompet-santai-notification-reads-v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('reads')
      const list = transaction.objectStore('reads').getAll()
      transaction.oncomplete = () => { resolve(list.result); db.close() }
    }
  }))
}

test('read markers synchronize between independent browser devices and preserve timestamps', async ({ page, browser }) => {
  const service = notificationReadService()
  await signIn(page, service)
  const second = await browser.newContext()
  const other = await second.newPage()
  try {
    await signIn(other, service)
    const one = await panel(page), two = await panel(other)
    await one.getByRole('button', { name: 'Tandai semua dibaca' }).click()
    await expect.poll(() => service.rows.size).toBe(1)
    const timestamp = [...service.rows.values()][0]!.read_at
    expect(Number.isFinite(Date.parse(timestamp))).toBe(true)
    await other.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(two.locator('.unread-dot')).toHaveCount(0)
    expect(await other.evaluate(() => localStorage.getItem('dompet-santai-notifications-v1:' + '00000000-0000-4000-8000-000000000123'))).toBeNull()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(() => service.rows.size).toBe(1)
    expect([...service.rows.values()][0]!.read_at).toBe(timestamp)
  } finally { await second.close() }
})

test('offline marks survive reload and synchronize after reconnecting without changing wallet data', async ({ page }) => {
  const service = notificationReadService()
  await signIn(page, service)
  const dialog = await panel(page)
  await offline(page, true)
  await dialog.getByRole('button', { name: 'Tandai semua dibaca' }).click()
  await expect(dialog).toContainText('akan disinkronkan saat online')
  await expect.poll(async () => (await records(page)).filter(row => row.pending).length).toBe(1)
  expect(service.rows.size).toBe(0)
  // A lost network prevents upload after the app is reloaded, while the cached
  // marker remains. This app still requires connectivity to load its shell.
  service.failWrites = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await signIn(page, service)
  const reopened = await panel(page)
  await expect(reopened.locator('.unread-dot')).toHaveCount(0)
  await expect(reopened.getByRole('alert')).toContainText('belum dapat disinkronkan')
  service.failWrites = false
  await offline(page, false)
  await expect.poll(() => service.rows.size).toBe(1)
  await expect.poll(async () => (await records(page)).filter(row => row.pending).length).toBe(0)
})

test('a bill becoming overdue has a different unread stage on every device', async ({ page }) => {
  const service = notificationReadService()
  await signIn(page, service)
  const dialog = await panel(page)
  await dialog.getByRole('button', { name: 'Tandai semua dibaca' }).click()
  await expect.poll(() => service.rows.size).toBe(1)
  expect([...service.rows.values()][0]!.read_key).toBe(readKey('internet'))
  await page.clock.setFixedTime(new Date('2026-11-24T12:00:00'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(dialog.locator('.notification-item')).toContainText('Terlambat 1 hari')
  await expect(dialog.locator('.unread-dot')).toHaveCount(1)
  expect(service.rows.has(a + ':' + readKey('internet', 'late'))).toBe(false)
})

test('concurrent devices add different read markers without replacing one another', async ({ page, browser }) => {
  const service = notificationReadService()
  const context = await browser.newContext()
  const other = await context.newPage()
  try {
    await signIn(page, service, a, ['internet'])
    await signIn(other, service, a, ['listrik'])
    const first = await panel(page), second = await panel(other)
    await Promise.all([first.getByRole('button', { name: 'Tandai semua dibaca' }).click(), second.getByRole('button', { name: 'Tandai semua dibaca' }).click()])
    await expect.poll(() => service.rows.size).toBe(2)
    expect([...service.rows.values()].map(row => row.read_key)).toEqual(expect.arrayContaining([readKey('internet'), readKey('listrik')]))
  } finally { await context.close() }
})

test('an offline queue is isolated on account change and resumes only for its owner', async ({ page }) => {
  const service = notificationReadService()
  await signIn(page, service)
  const first = await panel(page)
  await offline(page, true)
  await first.getByRole('button', { name: 'Tandai semua dibaca' }).click()
  await expect.poll(async () => (await records(page)).filter(row => row.pending).length).toBe(1)
  // Navigation can load here, but the notification synchronizer stays offline.
  await signIn(page, service, b)
  const second = await panel(page)
  await expect(second.locator('.unread-dot')).toHaveCount(1)
  await offline(page, false)
  await expect.poll(() => service.reads).toBeGreaterThan(0)
  expect(service.rows.size).toBe(0)
  await second.getByRole('button', { name: 'Tandai semua dibaca' }).click()
  await expect.poll(() => service.rows.size).toBe(1)
  expect([...service.rows.values()][0]!.user_id).toBe(b)
  await signIn(page, service, a)
  await expect.poll(() => service.rows.size).toBe(2)
  expect([...service.rows.values()].map(row => row.user_id).sort()).toEqual([a, b].sort())
})

test('legacy browser markers import once with no duplicate records', async ({ page }) => {
  const service = notificationReadService()
  await page.addInitScript(({ a, key }) => localStorage.setItem('dompet-santai-notifications-v1:' + a, JSON.stringify([key])), { a, key: readKey('internet') })
  await signIn(page, service)
  const dialog = await panel(page)
  await expect(dialog.locator('.unread-dot')).toHaveCount(0)
  await expect.poll(() => service.rows.size).toBe(1)
  const timestamp = [...service.rows.values()][0]!.read_at
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(async () => (await records(page)).filter(row => row.pending).length).toBe(0)
  expect([...service.rows.values()][0]!.read_at).toBe(timestamp)
})

test('a failed remote read stays visible as an error and can be retried', async ({ page }) => {
  const service = notificationReadService()
  service.failReads = true
  await signIn(page, service)
  const dialog = await panel(page)
  await expect(dialog.getByRole('alert')).toContainText('belum dapat disinkronkan')
  await expect(dialog.getByText('Semua sudah terbaca', { exact: true })).toHaveCount(0)
  service.rows.set(a + ':' + readKey('internet'), { user_id: a, read_key: readKey('internet'), read_at: new Date().toISOString() })
  service.failReads = false
  await dialog.getByRole('button', { name: 'Coba lagi', exact: true }).click()
  await expect(dialog.locator('.unread-dot')).toHaveCount(0)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})

test('a lost upload response is reconciled idempotently without losing the offline mark', async ({ page }) => {
  const service = notificationReadService()
  await signIn(page, service)
  let loseResponse = true
  await page.route('**/rest/v1/notification_reads*', async route => {
    if (route.request().method() !== 'POST' || !loseResponse) { await route.fallback(); return }
    const rows = route.request().postDataJSON()
    for (const row of rows) service.rows.set(row.user_id + ':' + row.read_key, row)
    await route.fulfill({ status: 503, json: { message: 'Response lost' } })
  })
  const dialog = await panel(page)
  await dialog.getByRole('button', { name: 'Tandai semua dibaca' }).click()
  await expect(dialog.getByRole('alert')).toContainText('belum dapat disinkronkan')
  await expect.poll(async () => (await records(page)).filter(row => row.pending).length).toBe(1)
  loseResponse = false
  await dialog.getByRole('button', { name: 'Coba lagi', exact: true }).click()
  await expect.poll(async () => (await records(page)).filter(row => row.pending).length).toBe(0)
  expect(service.rows.size).toBe(1)
})

test('blocked local storage is reported while online cloud synchronization can still complete', async ({ page }) => {
  const service = notificationReadService()
  await page.addInitScript(() => { IDBFactory.prototype.open = () => { throw new DOMException('Blocked', 'SecurityError') } })
  await signIn(page, service)
  const dialog = await panel(page)
  await expect(dialog).toContainText('Penyimpanan perangkat tidak tersedia')
  await dialog.getByRole('button', { name: 'Tandai semua dibaca' }).click()
  await expect.poll(() => service.rows.size).toBe(1)
  await expect(dialog.locator('.unread-dot')).toHaveCount(0)
})

test('all remote pages load beyond the first 500 rows', async ({ page }) => {
  const service = notificationReadService()
  for (let index = 0; index < 650; index++) {
    const key = JSON.stringify(['note', String(index).padStart(6, '0')])
    service.rows.set(a + ':' + key, { user_id: a, read_key: key, read_at: '2026-11-23T00:00:00Z' })
  }
  service.rows.set(a + ':' + readKey('internet'), { user_id: a, read_key: readKey('internet'), read_at: '2026-11-23T00:00:00Z' })
  await signIn(page, service)
  const dialog = await panel(page)
  await expect(dialog.locator('.unread-dot')).toHaveCount(0)
  await expect.poll(async () => (await records(page)).length).toBe(651)
  expect(service.reads).toBeGreaterThanOrEqual(2)
})

test('two offline tabs keep both markers in their shared IndexedDB transaction queue', async ({ page, context }) => {
  const service = notificationReadService()
  const other = await context.newPage()
  await signIn(page, service, a, ['internet'])
  await signIn(other, service, a, ['listrik'])
  const first = await panel(page), second = await panel(other)
  await offline(page, true)
  await offline(other, true)
  await Promise.all([first.getByRole('button', { name: 'Tandai semua dibaca' }).click(), second.getByRole('button', { name: 'Tandai semua dibaca' }).click()])
  await expect.poll(async () => (await records(page)).filter(row => row.pending).length).toBe(2)
  expect(service.rows.size).toBe(0)
  await offline(page, false)
  await offline(other, false)
  await expect.poll(() => service.rows.size).toBe(2)
  await expect.poll(async () => (await records(page)).filter(row => row.pending).length).toBe(0)
})

test('a remote response from a previous account cannot mark the new account read', async ({ page }) => {
  const service = notificationReadService()
  await signIn(page, service)
  service.rows.set(a + ':' + readKey('internet'), { user_id: a, read_key: readKey('internet'), read_at: new Date().toISOString() })
  service.readDelay = 750
  const before = service.reads
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => service.reads).toBeGreaterThan(before)
  await signIn(page, service, b)
  service.readDelay = 0
  const dialog = await panel(page)
  await expect(dialog.locator('.unread-dot')).toHaveCount(1)
  await expect.poll(async () => (await records(page)).filter(row => row.owner === b).length).toBe(0)
})
