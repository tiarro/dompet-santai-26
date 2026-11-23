import { expect, test, type Page } from './auth-fixture'
import { mockFinanceApi } from './cloud-fixture'

const owner = '00000000-0000-4000-8000-000000000123'
const notesKey = 'dompet-santai-notes-v1:' + owner

async function signIn(page: Page, theme = 'light') {
  await page.addInitScript(({ owner, theme }) => {
    Reflect.deleteProperty(Crypto.prototype, 'subtle')
    localStorage.setItem('dompet-santai-settings-v1:' + owner, JSON.stringify({
      openingBalances: { cash: 450000, bank: 6500000, ewallet: 1500000, savings: 0 },
      activeAccounts: ['cash', 'bank', 'ewallet'], theme,
      reminders: { notes: false, time: '20:00', savings: true }, revision: 0,
    }))
  }, { owner, theme })
  await mockFinanceApi(page, owner)
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'ocr@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = encode({ alg: 'ES256', kid: 'test', typ: 'JWT' }) + '.' + encode({ sub: owner, aud: 'authenticated', role: 'authenticated', email: user.email,
    exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) }) + '.' + encode('test-signature')
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/token')) await route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } })
    else if (path.endsWith('/user')) await route.fulfill({ json: user })
    else await route.fulfill({ status: 400, json: {} })
  })
  await page.route('**/rest/v1/bill_reminders*', route => route.fulfill({ json: [] }))
  await page.route('**/api/profile/photo', route => route.fulfill({ status: 404, json: {} }))
  await page.route('http://localhost:3000/**', async route => {
    if (route.request().isNavigationRequest()) {
      const headers = { ...route.request().headers() }
      delete headers.cookie
      await route.continue({ headers })
    } else await route.fallback()
  })
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false)
  await page.getByLabel('Alamat email').fill(user.email)
  await page.getByLabel('Kata sandi', { exact: true }).fill('test-password-123')
  await page.getByRole('button', { name: 'Masuk ke Dompet Santai', exact: true }).click()
  await expect(page.getByTestId('page-title')).toBeVisible()
}

async function openNote(page: Page) {
  await page.getByRole('button', { name: 'Tambah Catatan', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Tambah Catatan', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

async function photo(page: Page, name = 'struk.png') {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1000; canvas.height = 800
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'; context.fillRect(0, 0, 1000, 800)
    context.fillStyle = '#000'; context.font = 'bold 40px monospace'
    const lines = ['TOKO SANTAI', 'STRUK PEMBELIAN', 'MAKAN          50.000', 'MINUM          30.000', 'SUBTOTAL       80.000', 'PAJAK           5.000', 'TOTAL          85.000', 'TUNAI         100.000', 'KEMBALIAN      15.000']
    lines.forEach((line, index) => context.fillText(line, 60, 70 + index * 75))
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') }
}

async function mockReader(page: Page, responses: Array<{ text?: string; error?: boolean; delay?: number }>) {
  let calls = 0
  await page.context().route('**/receipt-ocr-worker.js', route => {
    const response = responses[Math.min(calls++, responses.length - 1)]!
    return route.fulfill({ contentType: 'application/javascript', body: `
      self.onmessage = () => {
        self.postMessage({ type: 'progress', stage: 'recognizing', percent: 25 });
        setTimeout(() => self.postMessage(${JSON.stringify(response.error ? { type: 'error' } : { type: 'result', text: response.text ?? 'TOTAL Rp85.000' })}), ${response.delay ?? 20});
      };
    ` })
  })
  return () => calls
}

test('real browser OCR reads the total using local worker, WASM and language models', async ({ page, context }) => {
  test.setTimeout(90_000)
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await signIn(page)
  const dialog = await openNote(page)
  await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
  const panel = dialog.getByRole('region', { name: 'Pembacaan nominal struk' })
  await expect(panel.getByText(/Nominal terbaca:/)).toContainText('85.000', { timeout: 60_000 })
  await expect(dialog.getByLabel('Nominal dalam rupiah')).toHaveValue('')
  await panel.getByRole('button', { name: 'Gunakan nominal', exact: true }).click()
  await expect(dialog.getByLabel('Nominal dalam rupiah')).toHaveValue('85.000')
  expect(requests.some(url => url.includes('/ocr/v7/core/'))).toBe(true)
  expect(requests.some(url => url.includes('/ocr/v7/lang/'))).toBe(true)
  expect(requests.filter(url => /tesseract|traineddata|receipt-ocr-worker|\/ocr\//.test(url)).every(url => new URL(url).origin === 'http://localhost:3000')).toBe(true)
  const cdp = await context.newCDPSession(page)
  await expect.poll(async () => (await cdp.send('Target.getTargets')).targetInfos.filter(target => /receipt-ocr-worker|\/ocr\/v7\/worker/.test(target.url)).length).toBe(0)
})

test('cancelling real OCR initialization disposes the API worker and its engine worker', async ({ page, context }) => {
  await signIn(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await context.route('**/ocr/v7/core/**', async route => {
    await gate
    try { await route.abort() } catch { /* The cancelled worker may already have closed its request. */ }
  })
  const cdp = await context.newCDPSession(page)
  const workers = async () => (await cdp.send('Target.getTargets')).targetInfos.filter(target => /receipt-ocr-worker|\/ocr\/v7\/worker/.test(target.url)).length
  try {
    const dialog = await openNote(page)
    await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
    await expect.poll(workers).toBeGreaterThanOrEqual(2)
    await dialog.getByRole('button', { name: 'Batalkan pembacaan' }).click()
    await expect.poll(workers).toBe(0)
    await expect(dialog.getByAltText('Pratinjau foto struk')).toBeVisible()
    await expect(dialog.getByText('Pembacaan dibatalkan.', { exact: false })).toBeVisible()
  } finally { release() }
})

test.describe('OCR interface with a simulated reader', () => {
  test('requires explicit use, preserves draft fields, and saves the confirmed amount once', async ({ page }) => {
    const readerCalls = await mockReader(page, [{}])
    await signIn(page)
    const writes: string[] = []
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (request.method() !== 'GET' && !path.endsWith('/get_finance_snapshot')) writes.push(path)
    })
    const dialog = await openNote(page)
    await dialog.getByLabel('Nominal dalam rupiah').fill('12000')
    await dialog.getByRole('radio', { name: 'Makan & Minum' }).check()
    await dialog.getByLabel('Keterangan').fill('Makan siang')
    await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
    const panel = dialog.getByRole('region', { name: 'Pembacaan nominal struk' })
    await expect(panel.getByText(/Nominal terbaca:/)).toContainText('85.000')
    expect(readerCalls()).toBe(1)
    await expect(dialog.getByLabel('Nominal dalam rupiah')).toHaveValue('12.000')
    await expect(panel).toContainText('Nominal yang sudah diisi akan diganti')
    expect(writes).toEqual([])
    await panel.getByRole('button', { name: 'Gunakan nominal', exact: true }).click()
    await expect(dialog.getByLabel('Nominal dalam rupiah')).toHaveValue('85.000')
    await expect(dialog.getByLabel('Keterangan')).toHaveValue('Makan siang')
    await expect(dialog.getByRole('radio', { name: 'Makan & Minum' })).toBeChecked()
    await dialog.getByRole('button', { name: 'Simpan Catatan', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    const notes = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), notesKey)
    expect(notes).toHaveLength(1)
    expect(notes[0].amount).toBe(85000)
    expect(notes[0].receipt.dataUrl).toMatch(/^data:image\/jpeg/)
    expect(notes[0]).not.toHaveProperty('ocrText')
  })

  for (const [text, message] of [
    ['SUBTOTAL 80.000\nTUNAI 100.000\nKEMBALIAN 20.000', 'Total belum terbaca dengan jelas'],
    ['TOTAL 80.000\nTOTAL 85.000', 'Ada beberapa total yang berbeda'],
  ]) {
    test(`manual entry remains available: ${message}`, async ({ page }) => {
      await mockReader(page, [{ text }])
      await signIn(page)
      const dialog = await openNote(page)
      await dialog.getByLabel('Nominal dalam rupiah').fill('12000')
      await dialog.getByRole('radio', { name: 'Makan & Minum' }).check()
      await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
      await expect(dialog.getByRole('region', { name: 'Pembacaan nominal struk' })).toContainText(message!)
      await expect(dialog.getByLabel('Nominal dalam rupiah')).toHaveValue('12.000')
      await expect(dialog.getByRole('button', { name: 'Simpan Catatan', exact: true })).toBeEnabled()
    })
  }

  test('reader failure keeps the photo and manual amount, then retries successfully', async ({ page }) => {
    await mockReader(page, [{ error: true }, {}])
    await signIn(page)
    const dialog = await openNote(page)
    await dialog.getByLabel('Nominal dalam rupiah').fill('12000')
    await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
    const panel = dialog.getByRole('region', { name: 'Pembacaan nominal struk' })
    await expect(panel.getByRole('alert')).toContainText('Pembaca struk belum dapat dijalankan')
    await expect(dialog.getByAltText('Pratinjau foto struk')).toBeVisible()
    await panel.getByRole('button', { name: 'Baca ulang struk' }).click()
    await expect(panel.getByText(/Nominal terbaca:/)).toContainText('85.000')
    await expect(dialog.getByLabel('Nominal dalam rupiah')).toHaveValue('12.000')
  })

  test('replacement and removal discard results from an earlier photo', async ({ page }) => {
    await mockReader(page, [{ text: 'TOTAL 11.000', delay: 600 }, { text: 'TOTAL 22.000' }])
    await signIn(page)
    const dialog = await openNote(page)
    const input = dialog.getByLabel('Pilih foto struk', { exact: true })
    await input.setInputFiles(await photo(page))
    await expect(dialog.getByRole('button', { name: 'Batalkan pembacaan' })).toBeVisible()
    await input.setInputFiles(await photo(page, 'struk-baru.png'))
    const panel = dialog.getByRole('region', { name: 'Pembacaan nominal struk' })
    await expect(panel.getByText(/Nominal terbaca:/)).toContainText('22.000')
    await page.waitForTimeout(650)
    await expect(panel).not.toContainText('11.000')
    await expect(dialog.getByLabel('Nominal dalam rupiah')).toHaveValue('')
    await dialog.getByRole('button', { name: 'Hapus foto', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect.poll(() => page.workers().filter(worker => worker.url().includes('receipt-ocr-worker')).length).toBe(0)
  })

  test('can cancel, retry, and save manually while reading is still running', async ({ page }) => {
    await mockReader(page, [{ delay: 10_000 }])
    await signIn(page)
    const dialog = await openNote(page)
    await dialog.getByLabel('Nominal dalam rupiah').fill('12000')
    await dialog.getByRole('radio', { name: 'Makan & Minum' }).check()
    await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
    await dialog.getByRole('button', { name: 'Batalkan pembacaan' }).click()
    const panel = dialog.getByRole('region', { name: 'Pembacaan nominal struk' })
    await expect(panel).toContainText('Pembacaan dibatalkan')
    await panel.getByRole('button', { name: 'Baca ulang struk' }).click()
    await expect(panel.getByRole('button', { name: 'Batalkan pembacaan' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Simpan Catatan', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect.poll(() => page.workers().filter(worker => worker.url().includes('receipt-ocr-worker')).length).toBe(0)
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!)[0].amount, notesKey)).toBe(12000)
  })

  test('unsupported browsers explain manual entry instead of losing the photo', async ({ page }) => {
    await signIn(page)
    await page.evaluate(() => { Reflect.deleteProperty(window, 'WebAssembly') })
    const dialog = await openNote(page)
    await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
    await expect(dialog.getByRole('region', { name: 'Pembacaan nominal struk' }).getByRole('alert')).toContainText('belum didukung browser ini')
    await expect(dialog.getByAltText('Pratinjau foto struk')).toBeVisible()
  })

  test('sufficient wallet balance is still required after applying an OCR total', async ({ page }) => {
    await mockReader(page, [{ text: 'TOTAL 900.000' }])
    await signIn(page)
    const dialog = await openNote(page)
    await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
    await dialog.getByRole('button', { name: 'Gunakan nominal', exact: true }).click()
    await expect(dialog.getByText(/Saldo Tunai tidak cukup/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Simpan Catatan', exact: true })).toBeDisabled()
  })

  test('editing a saved receipt waits for an explicit scan and preserves its stored amount', async ({ page }) => {
    const calls = await mockReader(page, [{}])
    await signIn(page)
    const dialog = await openNote(page)
    await dialog.getByLabel('Nominal dalam rupiah').fill('12000')
    await dialog.getByRole('radio', { name: 'Makan & Minum' }).check()
    await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
    await expect(dialog.getByText(/Nominal terbaca:/)).toContainText('85.000')
    await dialog.getByRole('button', { name: 'Simpan Catatan', exact: true }).click()
    await page.getByRole('button', { name: 'Riwayat', exact: true }).click()
    await page.locator('.history-row').first().click()
    await page.getByRole('dialog', { name: 'Detail Transaksi', exact: true }).getByRole('button', { name: 'Ubah Catatan', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Ubah Catatan', exact: true })
    const panel = editor.getByRole('region', { name: 'Pembacaan nominal struk' })
    await expect(panel.getByRole('button', { name: 'Baca nominal', exact: true })).toBeVisible()
    expect(calls()).toBe(1)
    await expect(editor.getByLabel('Nominal dalam rupiah')).toHaveValue('12.000')
    await panel.getByRole('button', { name: 'Baca nominal', exact: true }).click()
    await expect(panel.getByText(/Nominal terbaca:/)).toContainText('85.000')
    await expect(editor.getByLabel('Nominal dalam rupiah')).toHaveValue('12.000')
    expect(calls()).toBe(2)
  })

  test('mobile dark layout keeps the OCR result and controls inside the dialog', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockReader(page, [{}])
    await signIn(page, 'dark')
    const dialog = await openNote(page)
    await dialog.getByLabel('Pilih foto struk', { exact: true }).setInputFiles(await photo(page))
    const panel = dialog.getByRole('region', { name: 'Pembacaan nominal struk' })
    await expect(panel.getByText(/Nominal terbaca:/)).toContainText('85.000')
    await expect(page.locator('html')).toHaveClass(/theme-dark/)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await panel.scrollIntoViewIfNeeded()
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('ocr-mobile-dark.png') })
  })
})
