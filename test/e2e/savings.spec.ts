import { mockFinanceApi } from './cloud-fixture'
import { expect, test, type Page } from '@playwright/test'
const userId = '00000000-0000-4000-8000-000000000123'
const notesKey = 'dompet-santai-notes-v1:' + userId
const savingsKey = 'dompet-santai-savings-v1:' + userId
async function signIn(page: Page, id = userId) {
  await mockFinanceApi(page, id)
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

async function openSavings(page: Page) {
  await page.addStyleTag({ content: '#nuxt-devtools-container { display: none !important; }' })
  await page.getByRole('button', { name: 'Tabungan', exact: true }).click()
  await expect(page).toHaveURL(/\/tabungan$/)
  await expect(page.locator('.savings-page')).toBeVisible()
}
async function createGoal(page: Page, name = 'Dana Darurat', amount = '100000', reminder = false) {
  await page.getByRole('button', { name: 'Buat Target', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Buat Target', exact: true })
  await dialog.getByLabel('Nama target').fill(name)
  await dialog.getByLabel('Nominal target (Rp)').fill(amount)
  if (reminder) {
    await dialog.getByLabel('Tenggat (opsional)').fill('2099-12-31')
    await dialog.getByLabel('Pengingat bulanan').selectOption('1')
  }
  await dialog.getByRole('button', { name: 'Simpan Target' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Lihat target ' + name, exact: true })).toBeVisible()
}
async function selectGoal(page: Page, name = 'Dana Darurat') {
  await page.getByRole('button', { name: 'Lihat target ' + name, exact: true }).click()
  await expect(page.locator('.goal-detail')).toContainText(name)
}
async function openTransfer(page: Page, kind: 'deposit' | 'withdraw', amount: string, account = 'cash') {
  const label = kind === 'deposit' ? 'Tambah Tabungan' : 'Tarik Dana'
  await page.locator('.goal-detail').getByRole('button', { name: label, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: label, exact: true })
  await dialog.getByLabel(kind === 'deposit' ? 'Sumber dana' : 'Dompet tujuan').selectOption(account)
  await dialog.getByLabel('Nominal transfer (Rp)').fill(amount)
  return dialog
}
async function withdraw(page: Page, amount: string, account = 'bank') {
  const dialog = await openTransfer(page, 'withdraw', amount, account)
  await dialog.getByRole('button', { name: 'Lanjut Penarikan' }).click()
  await expect(dialog.getByRole('status')).toContainText('Tarik')
  await dialog.getByRole('button', { name: 'Konfirmasi Penarikan' }).click()
  await expect(dialog).not.toBeVisible()
}

test('savings lifecycle conserves money, updates dashboard, archives and keeps deleted target history', async ({ page }) => {
  test.setTimeout(60000)
  await signIn(page)
  await openSavings(page)
  await expect(page.getByText('Mulai dari satu tujuan')).toBeVisible()
  await createGoal(page)
  await selectGoal(page)
  let dialog = await openTransfer(page, 'deposit', '100000')
  await dialog.getByLabel('Keterangan (opsional)').fill('Setoran pertama')
  await dialog.getByRole('button', { name: 'Simpan Setoran' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.goal-detail')).toContainText('Target tercapai!')
  await expect(page.locator('.savings-summary')).toContainText('100.000')
  await page.getByRole('button', { name: 'Beranda', exact: true }).click()
  await expect(page.locator('.summary-card').filter({ hasText: 'Saldo Nyata' })).toContainText('8.450.000')
  await expect(page.locator('.summary-card').filter({ hasText: 'Uang Aman Dipakai' })).toContainText('8.350.000')
  await expect(page.locator('.savings-card')).toContainText('100%')
  await expect(page.locator('.summary-card').filter({ hasText: 'Pengeluaran Hari Ini' })).toContainText('125.000')
  expect(await page.evaluate(key => localStorage.getItem(key), notesKey)).toBeNull()
  await page.getByRole('button', { name: 'Riwayat', exact: true }).click()
  await expect(page.locator('.history-row')).toHaveCount(0)
  await openSavings(page)
  await selectGoal(page)
  await page.getByRole('button', { name: 'Hapus Target', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Hapus Target', exact: true })
  await expect(dialog.getByRole('button', { name: 'Ya, Hapus Target' })).toBeDisabled()
  await expect(dialog.getByRole('alert')).toContainText('Tarik seluruh dana')
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click()
  await page.getByRole('button', { name: 'Arsipkan Target', exact: true }).click()
  await page.getByRole('button', { name: 'Ya, Arsipkan' }).click()
  await expect(page.locator('.goal-detail')).toContainText('Diarsipkan')
  await expect(page.locator('.savings-summary')).toContainText('100.000')
  await page.getByRole('button', { name: 'Aktifkan Target', exact: true }).click()
  await page.getByRole('button', { name: 'Ya, Aktifkan' }).click()
  dialog = await openTransfer(page, 'withdraw', '100001')
  await expect(dialog.getByRole('button', { name: 'Lanjut Penarikan' })).toBeDisabled()
  await dialog.getByLabel('Nominal transfer (Rp)').fill('40000')
  await dialog.getByRole('button', { name: 'Lanjut Penarikan' }).click()
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).movements.length, savingsKey)).toBe(1)
  await dialog.getByRole('button', { name: 'Konfirmasi Penarikan' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.goal-detail .large-amount')).toContainText('60.000')
  await withdraw(page, '60000')
  await page.getByRole('button', { name: 'Hapus Target', exact: true }).click()
  await page.getByRole('button', { name: 'Ya, Hapus Target' }).click()
  await expect(page.locator('.target-card')).toHaveCount(0)
  await expect(page.locator('.savings-history li')).toHaveCount(3)
  const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), savingsKey)
  expect(state.goals[0].deleted).toBe(true)
  expect(state.movements).toHaveLength(3)
})

test('savings validates source funds and notes cannot spend deposits again', async ({ page }) => {
  await page.addInitScript(id => {
    const now = new Date()
    const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    localStorage.setItem('dompet-santai-budgets-v1:' + id, JSON.stringify([{ month, category: 'food', limit: 100000, defaultAccount: 'cash' }]))
  }, userId)
  await signIn(page)
  await openSavings(page)
  await createGoal(page, 'Rumah', '1000000')
  await selectGoal(page, 'Rumah')
  const dialog = await openTransfer(page, 'deposit', '450001')
  await expect(dialog.getByRole('button', { name: 'Simpan Setoran' })).toBeDisabled()
  await dialog.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit())
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).movements.length, savingsKey)).toBe(0)
  await dialog.getByLabel('Nominal transfer (Rp)').fill('450000')
  await expect(dialog.getByRole('button', { name: 'Simpan Setoran' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Simpan Setoran' }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: 'Tambah Catatan', exact: true }).click()
  const note = page.getByRole('dialog', { name: 'Tambah Catatan', exact: true })
  await note.getByRole('radio', { name: 'Makan & Minum' }).check()
  await note.getByLabel('Nominal dalam rupiah').fill('1')
  await expect(note.getByRole('button', { name: 'Simpan Catatan' })).toBeDisabled()
  await expect(note.locator('#note-funds-error')).toContainText('Saldo Tunai tidak cukup')
  await note.getByRole('button', { name: 'Tutup tambah catatan' }).click()
  await note.getByRole('button', { name: 'Buang isian' }).click()
  await page.getByRole('button', { name: 'Anggaran', exact: true }).click()
  await page.getByRole('button', { name: 'Buat Anggaran', exact: true }).click()
  const budget = page.getByRole('dialog', { name: 'Buat Anggaran', exact: true })
  await budget.getByLabel('Kategori', { exact: true }).selectOption('transport')
  await budget.getByLabel('Batas anggaran (Rp)').fill('1')
  await budget.getByLabel('Biasanya bayar dari (opsional)').selectOption('cash')
  await expect(budget.getByRole('button', { name: 'Simpan Anggaran' })).toBeDisabled()
})

test('savings preserves drafts on storage failure and rejects unreadable data', async ({ page }) => {
  await signIn(page)
  await openSavings(page)
  await createGoal(page)
  await selectGoal(page)
  const dialog = await openTransfer(page, 'deposit', '10000')
  await page.evaluate(() => {
    ;(window as any).__setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('dompet-santai-savings-v1:')) throw new DOMException('Full', 'QuotaExceededError')
      return (window as any).__setItem.call(this, key, value)
    }
  })
  await dialog.getByRole('button', { name: 'Simpan Setoran' }).click()
  await expect(dialog.getByRole('alert')).toContainText('belum tersimpan')
  await expect(dialog.getByLabel('Nominal transfer (Rp)')).toHaveValue('10000')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).movements.length, savingsKey)).toBe(0)
  await page.evaluate(() => { Storage.prototype.setItem = (window as any).__setItem })
  await dialog.getByRole('button', { name: 'Simpan Setoran' }).click()
  await expect(dialog).not.toBeVisible()
  await openTransfer(page, 'deposit', '20000')
  await page.evaluate(key => localStorage.setItem(key, 'invalid-json'), savingsKey)
  await dialog.getByRole('button', { name: 'Simpan Setoran' }).click()
  await expect(dialog.getByRole('alert')).toContainText('belum bisa dibaca')
  expect(await page.evaluate(key => localStorage.getItem(key), savingsKey)).toBe('invalid-json')
  await page.reload()
  await signIn(page)
  await openSavings(page)
  await expect(page.locator('.savings-page').getByRole('alert')).toContainText('belum bisa dibaca')
  await expect(page.getByRole('button', { name: 'Buat Target', exact: true })).toBeDisabled()
})

test('savings targets persist per account, support mobile themes, editing and reminder estimates', async ({ page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await openSavings(page)
  await createGoal(page, 'Laptop', '200000', true)
  await expect(page.locator('.reminders')).toContainText('Laptop')
  await selectGoal(page, 'Laptop')
  await expect(page.locator('.estimate')).toContainText('Perkiraan setoran per bulan')
  await page.getByRole('button', { name: 'Ubah Target', exact: true }).click()
  let editor = page.getByRole('dialog', { name: 'Ubah Target', exact: true })
  await editor.getByLabel('Nominal target (Rp)').fill('300000')
  await editor.getByRole('button', { name: 'Simpan Target' }).click()
  await expect(editor).not.toBeVisible()
  await expect(page.locator('.goal-detail')).toContainText('300.000')
  editor = await openTransfer(page, 'deposit', '1000', 'ewallet')
  await editor.getByRole('button', { name: 'Simpan Setoran' }).click()
  await expect(page.locator('.reminders')).toHaveCount(0)
  const light = await page.locator('.goal-detail').evaluate(el => getComputedStyle(el).backgroundColor)
  await page.screenshot({ path: 'test-results/savings-mobile-light.png', fullPage: true })
  await page.getByRole('button', { name: 'Gunakan mode gelap', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/theme-dark/)
  expect(await page.locator('.goal-detail').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(light)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/savings-mobile-dark.png', fullPage: true })
  await page.getByRole('button', { name: 'Ubah Target', exact: true }).click()
  editor = page.getByRole('dialog', { name: 'Ubah Target', exact: true })
  await editor.getByLabel('Nama target').fill('Draft belum disimpan')
  await page.keyboard.press('Escape')
  await expect(editor.getByRole('alert')).toContainText('Isian belum disimpan')
  await editor.getByRole('button', { name: 'Buang isian' }).click()
  await page.reload()
  await signIn(page)
  await openSavings(page)
  await expect(page.getByRole('button', { name: 'Lihat target Laptop' })).toContainText('1.000')
  await signIn(page, '00000000-0000-4000-8000-000000000456')
  await openSavings(page)
  await expect(page.locator('.target-card')).toHaveCount(0)
  await signIn(page)
  await openSavings(page)
  await expect(page.getByRole('button', { name: 'Lihat target Laptop' })).toBeVisible()
})

test('savings serializes concurrent deposits across tabs so money cannot fund two targets', async ({ page, context }) => {
  test.setTimeout(60000)
  await signIn(page)
  await openSavings(page)
  await createGoal(page, 'Satu', '500000')
  await createGoal(page, 'Dua', '500000')
  const second = await context.newPage()
  await signIn(second)
  await openSavings(second)
  await selectGoal(page, 'Satu')
  await selectGoal(second, 'Dua')
  const firstDialog = await openTransfer(page, 'deposit', '300000')
  const secondDialog = await openTransfer(second, 'deposit', '300000')
  await Promise.all([
    firstDialog.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit()),
    secondDialog.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit()),
  ])
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).movements.length, savingsKey)).toBe(1)
  // A third write must also read the reduced balance, rather than allowing a duplicate allocation.
  const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), savingsKey)
  expect(state.movements[0].amount).toBe(300000)
  await expect.poll(async () => Number(await firstDialog.isVisible()) + Number(await secondDialog.isVisible())).toBe(1)
  const remaining = await firstDialog.isVisible() ? firstDialog : secondDialog
  await expect(remaining.getByRole('alert').filter({ hasText: 'Saldo dompet sumber tidak cukup' }).first()).toBeVisible()
  await second.close()
})

test('savings prevents deleting income that has already funded a target and rejects stale goal edits', async ({ page }) => {
  await page.addInitScript(key => {
    const now = new Date()
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
    localStorage.setItem(key, JSON.stringify([{ id: 'funding', type: 'income', category: 'salary', account: 'cash', amount: 100000, date, description: 'Dana tambahan', createdAt: now.toISOString() }]))
  }, notesKey)
  await signIn(page)
  await openSavings(page)
  await createGoal(page, 'Rumah', '1000000')
  await selectGoal(page, 'Rumah')
  const dialog = await openTransfer(page, 'deposit', '550000')
  await dialog.getByRole('button', { name: 'Simpan Setoran' }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: 'Ubah Target', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Ubah Target', exact: true })
  await editor.getByLabel('Nama target').fill('Perubahan lama')
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!)
    state.goals[0].revision++
    state.goals[0].name = 'Perubahan tab lain'
    localStorage.setItem(key, JSON.stringify(state))
  }, savingsKey)
  await editor.getByRole('button', { name: 'Simpan Target' }).click()
  await expect(editor.getByRole('alert')).toContainText('Target sudah berubah')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).goals[0].name, savingsKey)).toBe('Perubahan tab lain')
  await editor.getByRole('button', { name: 'Tutup form tabungan' }).click()
  await editor.getByRole('button', { name: 'Buang isian' }).click()
  await page.getByRole('button', { name: 'Riwayat', exact: true }).click()
  await page.locator('.history-row').click()
  const detail = page.getByRole('dialog', { name: 'Detail Transaksi', exact: true })
  await detail.getByRole('button', { name: 'Hapus Catatan', exact: true }).click()
  await detail.getByRole('button', { name: 'Ya, Hapus Catatan' }).click()
  await expect(detail.getByRole('alert')).toContainText('saldo Tunai tidak cukup')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).length, notesKey)).toBe(1)
})

test('savings route requires login', async ({ page }) => {
  await page.goto('/tabungan')
  await expect(page).toHaveURL(/\/login$/)
})
