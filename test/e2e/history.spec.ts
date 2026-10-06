import { expect, test, type Page } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

const userId = '00000000-0000-4000-8000-000000000123'
const storageKey = 'dompet-santai-notes-v1:' + userId

// Authentication is mocked in the browser: no real account or database writes.
async function signIn(page: Page, id = userId) {
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'notes@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({
    sub: id, aud: 'authenticated', role: 'authenticated', email: user.email,
    exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
  }) + '.' + Buffer.from('test-signature').toString('base64url')
  await page.route('**/auth/v1/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ json: user })
    } else if (url.pathname.endsWith('/token')) {
      await route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user } })
    } else {
      await route.fulfill({ status: 400, json: { message: 'Unexpected auth request in UI test' } })
    }
  })
  // Prevent server-side verification of the fake test session; client auth requests remain mocked.
  await page.route('http://localhost:3000/**', async route => {
    if (route.request().isNavigationRequest()) {
      const headers = { ...route.request().headers() }
      delete headers.cookie
      await route.continue({ headers })
    } else await route.continue()
  })
  await page.goto('/login')
  await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false)
  await page.getByLabel('Alamat email').fill(user.email)
  await page.getByLabel('Kata sandi', { exact: true }).fill('test-password-123')
  await page.getByRole('button', { name: 'Masuk ke Dompet Santai', exact: true }).click()
  await expect(page.getByTestId('page-title')).toHaveText('Dompet Santai')
}


async function seedHistory(page: Page, mode = 'normal') {
  await page.addInitScript(({ key, mode }) => {
    if (localStorage.getItem(key)) return
    const d = new Date()
    const date = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
    const previous = new Date(d.getFullYear(), d.getMonth(), 0)
    const previousDate = [previous.getFullYear(), String(previous.getMonth() + 1).padStart(2, '0'), String(previous.getDate()).padStart(2, '0')].join('-')
    const base = { type: 'expense', category: 'food', account: 'cash', date, amount: 10000, description: '', createdAt: date + 'T01:00:00Z' }
    if (mode === 'spent-income') {
      localStorage.setItem('dompet-santai-budgets-v1:00000000-0000-4000-8000-000000000123', JSON.stringify([{ month: date.slice(0, 7), category: 'food', limit: 100000 }]))
      localStorage.setItem(key, JSON.stringify([
        { ...base, id: 'funding', type: 'income', category: 'salary', account: 'savings', amount: 100000, description: 'Dana tabungan' },
        { ...base, id: 'spent', account: 'savings', amount: 90000, description: 'Belanja tabungan' },
      ]))
      return
    }
    if (mode === 'many') {
      localStorage.setItem(key, JSON.stringify(Array.from({ length: 55 }, (_, i) => ({ ...base, id: 'note-' + String(i).padStart(2, '0'), amount: 1, description: 'Transaksi ' + String(i).padStart(2, '0') }))))
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = 200; canvas.height = 300
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 200, 300)
    ctx.fillStyle = 'black'; ctx.fillText('STRUK MAKAN', 20, 40)
    const custom = 'custom-00000000-0000-4000-8000-000000000999'
    localStorage.setItem('dompet-santai-categories-v1:00000000-0000-4000-8000-000000000123', JSON.stringify([{ id: custom, type: 'expense', label: 'Pendidikan', icon: 'school' }]))
    localStorage.setItem('dompet-santai-budgets-v1:00000000-0000-4000-8000-000000000123', JSON.stringify([{ month: date.slice(0, 7), category: 'food', limit: 100000, defaultAccount: 'cash' }]))
    localStorage.setItem(key, JSON.stringify([
      { ...base, id: 'salary', type: 'income', category: 'salary', account: 'bank', amount: 1000000, description: 'Gaji bulanan' },
      { ...base, id: 'food', account: 'ewallet', amount: 30000, description: 'Makan siang', receipt: { name: 'makan.jpg', dataUrl: canvas.toDataURL('image/jpeg') } },
      { ...base, id: 'transport', category: 'transport', amount: 20000, description: 'Ojek kantor' },
      { ...base, id: 'school', category: custom, amount: 10000, description: 'Buku sekolah' },
      { ...base, id: 'old', category: 'shopping', date: previousDate, amount: 50000, description: 'Belanja bulan lalu' },
      { ...base, id: 'old-income', type: 'income', category: 'other', date: '2020-01-01', amount: 7000, description: 'Bonus lama' },
      { ...base, id: 'old-expense', category: 'other', date: '2020-01-01', amount: 8000, description: 'Pengeluaran lain' },
    ]))
  }, { key: storageKey, mode })
}
async function openHistory(page: Page) {
  await page.getByRole('button', { name: 'Riwayat', exact: true }).click()
  await expect(page).toHaveURL(/\/riwayat$/)
  await expect(page.locator('.history-page')).toBeVisible()
}
async function detailFor(page: Page, text: string) {
  const row = page.locator('.history-row').filter({ hasText: text })
  await row.evaluate(el => el.scrollIntoView({ block: 'center' }))
  await row.click()
  const detail = page.getByRole('dialog', { name: 'Detail Transaksi', exact: true })
  await expect(detail).toBeVisible()
  return detail
}
test('history combines periods, search, typed categories and wallet filters with accurate summaries', async ({ page }) => {
  await seedHistory(page)
  await signIn(page)
  await openHistory(page)
  await expect(page.locator('.history-row')).toHaveCount(4)
  await expect(page.locator('.history-summary')).toContainText('1.000.000')
  await expect(page.locator('.history-summary')).toContainText('60.000')
  await expect(page.locator('.history-summary')).toContainText('940.000')
  await page.getByLabel('Cari transaksi').fill('PENDIDIKAN')
  await expect(page.locator('.history-row')).toHaveCount(1)
  await expect(page.locator('.history-row')).toContainText('Buku sekolah')
  await page.getByLabel('Cari transaksi').fill('')
  await page.getByLabel('Dompet', { exact: true }).selectOption('ewallet')
  await expect(page.locator('.history-row')).toHaveCount(1)
  await expect(page.locator('.history-summary')).toContainText('30.000')
  await page.getByLabel('Dompet', { exact: true }).selectOption('')
  await page.getByLabel('Periode riwayat').selectOption('last-month')
  await expect(page.locator('.history-row')).toContainText('Belanja bulan lalu')
  await page.getByLabel('Periode riwayat').selectOption('all')
  await expect(page.locator('.history-row')).toHaveCount(7)
  await page.getByLabel('Kategori transaksi').selectOption('income:other')
  await expect(page.locator('.history-row')).toContainText('Bonus lama')
  await expect(page.locator('.history-row')).toHaveCount(1)
  await page.getByLabel('Jenis transaksi').selectOption('expense')
  await expect(page.getByLabel('Kategori transaksi')).toHaveValue('')
  await expect(page.locator('.history-row')).toHaveCount(5)
  await page.locator('.active-filters').getByRole('button', { name: 'Reset Filter', exact: true }).click()
  await page.getByLabel('Periode riwayat').selectOption('custom')
  await page.getByLabel('Dari tanggal').fill('2020-01-01')
  await page.getByLabel('Sampai tanggal').fill('2020-01-01')
  await expect(page.locator('.history-row')).toHaveCount(2)
  await page.getByLabel('Dari tanggal').fill('2020-01-02')
  await expect(page.locator('.history-page').getByRole('alert')).toContainText('rentang tanggal')
  await expect(page.locator('.history-summary')).toHaveCount(0)
})
test('history detail keeps filters and receipts while edit replaces the transaction and updates budgets', async ({ page }) => {
  await seedHistory(page)
  await signIn(page)
  await openHistory(page)
  await page.getByLabel('Cari transaksi').fill('Makan')
  const detail = await detailFor(page, 'Makan siang')
  await detail.getByRole('button', { name: 'Lihat struk' }).click()
  const viewer = page.getByRole('dialog', { name: 'Foto struk', exact: true })
  await expect(viewer.getByAltText('Foto struk tersimpan')).toHaveJSProperty('naturalWidth', 200)
  await viewer.getByRole('button', { name: 'Tutup foto struk' }).click()
  await detail.getByRole('button', { name: 'Ubah Catatan', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Ubah Catatan', exact: true })
  await expect(editor.getByLabel('Bayar dari', { exact: true })).toHaveValue('ewallet')
  await expect(editor.getByAltText('Pratinjau foto struk')).toBeVisible()
  await editor.getByLabel('Nominal dalam rupiah').fill('80000')
  await expect(editor.locator('.budget-warning')).toHaveCount(0)
  await editor.getByLabel('Keterangan').fill('Makan malam')
  await editor.getByRole('button', { name: 'Simpan Perubahan', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await expect(detail).toContainText('80.000')
  await expect(detail).toContainText('Makan malam')
  await expect(detail.getByRole('button', { name: 'Lihat struk' })).toBeVisible()
  await detail.getByRole('button', { name: 'Tutup detail transaksi' }).click()
  await expect(page.getByLabel('Cari transaksi')).toHaveValue('Makan')
  await expect(page.locator('.history-row')).toHaveCount(1)
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).length, storageKey)).toBe(7)
  await page.getByRole('button', { name: 'Anggaran', exact: true }).click()
  await expect(page.locator('.category-card').filter({ hasText: 'Makan & Minum' })).toContainText('20.000')
  await page.reload()
  await signIn(page)
  await openHistory(page)
  await expect(page.locator('.history-row').filter({ hasText: 'Makan malam' })).toContainText('80.000')
})
test('history confirms deletion and prevents editing or deleting already spent income', async ({ page }) => {
  await seedHistory(page, 'spent-income')
  await signIn(page)
  await openHistory(page)
  let detail = await detailFor(page, 'Dana tabungan')
  await detail.getByRole('button', { name: 'Hapus Catatan', exact: true }).click()
  await detail.getByRole('button', { name: 'Ya, Hapus Catatan', exact: true }).click()
  await expect(detail.getByRole('alert')).toContainText('saldo Tabungan tidak cukup')
  await detail.getByRole('button', { name: 'Batal hapus' }).click()
  await detail.getByRole('button', { name: 'Ubah Catatan', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Ubah Catatan', exact: true })
  await expect(editor.getByLabel('Masuk ke', { exact: true })).toHaveValue('savings')
  await editor.getByLabel('Nominal dalam rupiah').fill('50000')
  await expect(editor.getByRole('button', { name: 'Simpan Perubahan' })).toBeDisabled()
  await expect(editor.locator('#note-revision-error')).toContainText('saldo Tabungan')
  await editor.getByLabel('Nominal dalam rupiah').fill('100000')
  await editor.getByLabel('Masuk ke', { exact: true }).selectOption('bank')
  await expect(editor.getByRole('button', { name: 'Simpan Perubahan' })).toBeDisabled()
  await editor.getByRole('button', { name: 'Tutup ubah catatan' }).click()
  await editor.getByRole('button', { name: 'Buang isian' }).click()
  await detail.getByRole('button', { name: 'Tutup detail transaksi' }).click()
  detail = await detailFor(page, 'Belanja tabungan')
  await detail.getByRole('button', { name: 'Ubah Catatan', exact: true }).click()
  await editor.getByLabel('Nominal dalam rupiah').fill('100000')
  await expect(editor.getByRole('button', { name: 'Simpan Perubahan' })).toBeEnabled()
  await editor.getByRole('button', { name: 'Simpan Perubahan' }).click()
  await detail.getByRole('button', { name: 'Hapus Catatan', exact: true }).click()
  await detail.getByRole('button', { name: 'Batal hapus' }).click()
  await expect(page.locator('.history-row')).toHaveCount(2)
  await detail.getByRole('button', { name: 'Hapus Catatan', exact: true }).click()
  await detail.getByRole('button', { name: 'Ya, Hapus Catatan' }).click()
  await expect(detail).not.toBeVisible()
  await expect(page.locator('.history-row')).toHaveCount(1)
  detail = await detailFor(page, 'Dana tabungan')
  await detail.getByRole('button', { name: 'Hapus Catatan', exact: true }).click()
  await detail.getByRole('button', { name: 'Ya, Hapus Catatan' }).click()
  await expect(page.getByText('Belum ada riwayat', { exact: true })).toBeVisible()
})
test('history preserves drafts on storage failure and rejects stale edits and deletion', async ({ page }) => {
  await seedHistory(page)
  await signIn(page)
  await openHistory(page)
  const detail = await detailFor(page, 'Makan siang')
  await detail.getByRole('button', { name: 'Ubah Catatan', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Ubah Catatan', exact: true })
  await editor.getByLabel('Nominal dalam rupiah').fill('40000')
  await page.evaluate(() => {
    ;(window as any).__originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('dompet-santai-notes-v1:')) throw new DOMException('Full', 'QuotaExceededError')
      return (window as any).__originalSetItem.call(this, key, value)
    }
  })
  await editor.getByRole('button', { name: 'Simpan Perubahan' }).click()
  await expect(editor.locator('.save-error')).toContainText('belum tersimpan')
  await expect(editor.getByLabel('Nominal dalam rupiah')).toHaveValue('40.000')
  await editor.getByRole('button', { name: 'Tutup ubah catatan' }).click()
  await editor.getByRole('button', { name: 'Buang isian' }).click()
  await detail.getByRole('button', { name: 'Hapus Catatan', exact: true }).click()
  await detail.getByRole('button', { name: 'Ya, Hapus Catatan' }).click()
  await expect(detail.getByRole('alert')).toContainText('belum tersimpan')
  await detail.getByRole('button', { name: 'Batal hapus' }).click()
  await detail.getByRole('button', { name: 'Ubah Catatan', exact: true }).click()
  await editor.getByLabel('Nominal dalam rupiah').fill('40000')
  await page.evaluate(key => {
    Storage.prototype.setItem = (window as any).__originalSetItem
    const rows = JSON.parse(localStorage.getItem(key)!)
    rows.find((note: any) => note.id === 'food').amount = 35000
    localStorage.setItem(key, JSON.stringify(rows))
  }, storageKey)
  await editor.getByRole('button', { name: 'Simpan Perubahan' }).click()
  await expect(editor.locator('.save-error')).toContainText('sudah berubah')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).find((note: any) => note.id === 'food').amount, storageKey)).toBe(35000)
})
test('history supports empty state, mobile filters and both themes', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date()
    const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    localStorage.setItem('dompet-santai-budgets-v1:00000000-0000-4000-8000-000000000123', JSON.stringify([{ month, category: 'food', limit: 100000 }]))
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'light' })
  await signIn(page)
  await page.addStyleTag({ content: '#nuxt-devtools-container { display: none !important; }' })
  await openHistory(page)
  await expect(page.getByText('Belum ada riwayat', { exact: true })).toBeVisible()
  await page.locator('.history-empty').getByRole('button', { name: 'Tambah Catatan' }).click()
  const editor = page.getByRole('dialog', { name: 'Tambah Catatan', exact: true })
  await editor.getByLabel('Nominal dalam rupiah').fill('10000')
  await editor.getByRole('radio', { name: 'Makan & Minum', exact: true }).check()
  await editor.getByRole('button', { name: 'Simpan Catatan' }).click()
  await expect(page.locator('.history-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  await page.getByLabel('Dompet', { exact: true }).selectOption('bank')
  await expect(page.getByText('Tidak ada transaksi yang cocok', { exact: true })).toBeVisible()
  await page.locator('.history-empty').getByRole('button', { name: 'Reset Filter' }).click()
  await expect(page.locator('.history-row')).toHaveCount(1)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/history-mobile-light.png', fullPage: true })
  const light = await page.locator('.history-group ul').evaluate(el => getComputedStyle(el).backgroundColor)
  await page.getByRole('button', { name: 'Gunakan mode gelap' }).click()
  expect(await page.locator('.history-group ul').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(light)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/history-mobile-dark.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const detail = await detailFor(page, 'Makan & Minum')
  await page.screenshot({ path: 'test-results/history-detail-mobile-dark.png' })
  const box = await detail.boundingBox()
  expect(Math.abs(box!.width - 390)).toBeLessThanOrEqual(2)
  await detail.getByRole('button', { name: 'Tutup detail transaksi' }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'test-results/history-desktop-dark.png', fullPage: true })
  await page.getByRole('button', { name: 'Gunakan mode terang' }).click()
  await page.screenshot({ path: 'test-results/history-desktop-light.png', fullPage: true })
})
test('history loads every transaction and restores list scroll after viewing details', async ({ page }) => {
  await seedHistory(page, 'many')
  await signIn(page)
  await openHistory(page)
  await expect(page.locator('.history-row')).toHaveCount(50)
  await expect(page.locator('.history-summary')).toContainText('55')
  await page.getByRole('button', { name: /Tampilkan lebih banyak/ }).click()
  await expect(page.locator('.history-row')).toHaveCount(55)
  const last = page.locator('.history-row').last()
  await last.evaluate(el => el.scrollIntoView({ block: 'center' }))
  const scroll = await page.evaluate(() => scrollY)
  await last.click()
  const detail = page.getByRole('dialog', { name: 'Detail Transaksi', exact: true })
  await detail.getByRole('button', { name: 'Tutup detail transaksi' }).click()
  await expect(last).toBeFocused()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scroll)
})


test('history releases nested editor and receipt dialogs when navigating back', async ({ page }) => {
  await seedHistory(page)
  await signIn(page)
  await openHistory(page)
  const detail = await detailFor(page, 'Makan siang')
  await detail.getByRole('button', { name: 'Ubah Catatan', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Ubah Catatan', exact: true })
  await editor.getByRole('button', { name: 'Lihat foto struk lebih besar' }).click()
  await expect(page.getByRole('dialog', { name: 'Foto struk', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

