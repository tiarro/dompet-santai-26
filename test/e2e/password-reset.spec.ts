import { expect, test, type Page } from './auth-fixture'

async function mockRecovery(page: Page) {
  const id = '00000000-0000-4000-8000-000000000123'
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'recovery@example.com',
    app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = encode({ alg: 'ES256', kid: 'test-key', typ: 'JWT' }) + '.' + encode({
    sub: id, aud: 'authenticated', role: 'authenticated', email: user.email,
    exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
  }) + '.' + encode('test-signature')
  const state = {
    user, callback: '', recoverFails: false, exchangeFails: false,
    verification: 'valid' as 'valid' | 'expired' | 'different',
    updateError: '', logoutFails: false, theme: 'light',
    exchanges: 0, updates: [] as string[], logoutScopes: [] as string[], forbiddenWrites: [] as string[],
    storedPassword: 'old-test-password',
  }
  await page.addInitScript(() => { Reflect.deleteProperty(Crypto.prototype, 'subtle') })
  // Auth is mocked in the browser. Keep mock session cookies away from SSR so
  // the Nuxt server never attempts to verify them against the real provider.
  await page.route('http://localhost:3000/**', async route => {
    if (route.request().isNavigationRequest()) {
      const headers = { ...route.request().headers() }
      delete headers.cookie
      await route.continue({ headers })
    } else await route.continue()
  })
  await page.route('**/api/profile/photo', route => route.fulfill({ status: 404, json: { message: 'No photo' } }))
  await page.route('**/rest/v1/**', async route => {
    const request = route.request()
    if (new URL(request.url()).pathname.endsWith('/get_finance_snapshot')) {
      await route.fulfill({ json: { profile: { id }, settings: { theme: state.theme }, wallets: [], categories: [],
        transactions: [], budgets: [], goals: [], movements: [], _meta: { fingerprint: 'test' } } })
    } else if (request.method() === 'GET') await route.fulfill({ json: [] })
    else {
      state.forbiddenWrites.push(request.url())
      await route.fulfill({ status: 400, json: {} })
    }
  })
  await page.route('**/auth/v1/**', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname.endsWith('/recover')) {
      expect(request.postDataJSON().email).toBe(user.email)
      expect(request.postDataJSON().code_challenge).toBeTruthy()
      state.callback = url.searchParams.get('redirect_to')!
      expect(new URL(state.callback).pathname).toBe('/atur-ulang-kata-sandi')
      await route.fulfill(state.recoverFails
        ? { status: 429, json: { code: 'over_email_send_rate_limit', message: 'Terlalu banyak permintaan email.' } }
        : { json: {} })
    } else if (url.pathname.endsWith('/token')) {
      if (url.searchParams.get('grant_type') === 'pkce') {
        state.exchanges++
        expect(request.postDataJSON().code_verifier).toBeTruthy()
        if (state.exchangeFails) {
          await route.fulfill({ status: 400, json: { code: 'invalid_grant', message: 'Recovery code expired or already used' } })
          return
        }
      } else {
        expect(url.searchParams.get('grant_type')).toBe('password')
        expect(request.postDataJSON().password).toBe(state.storedPassword)
      }
      await route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user } })
    } else if (url.pathname.endsWith('/user') && request.method() === 'PUT') {
      expect(request.postDataJSON()).toMatchObject({ password: expect.any(String) })
      expect(request.postDataJSON()).not.toHaveProperty('data')
      expect(request.postDataJSON()).not.toHaveProperty('email')
      state.updates.push(request.postDataJSON().password)
      if (state.updateError) {
        // The browser must be able to read the version header for the SDK to
        // interpret modern Auth error codes, just as with the hosted API.
        await route.fulfill({ status: 422, headers: {
          'x-supabase-api-version': '2024-01-01',
          'access-control-expose-headers': 'X-Supabase-Api-Version',
        }, json: { code: state.updateError, message: 'Password update rejected' } })
      } else {
        state.storedPassword = request.postDataJSON().password
        await route.fulfill({ json: user })
      }
    } else if (url.pathname.endsWith('/user')) {
      if (state.verification === 'expired') {
        await route.fulfill({ status: 401, json: { code: 'session_expired', message: 'Session expired' } })
      } else await route.fulfill({ json: state.verification === 'different'
        ? { ...user, id: '00000000-0000-4000-8000-000000000456', email: 'other@example.com' }
        : user })
    } else if (url.pathname.endsWith('/logout')) {
      state.logoutScopes.push(url.searchParams.get('scope')!)
      await route.fulfill(state.logoutFails
        ? { status: 500, json: { message: 'Logout unavailable' } }
        : { status: 204 })
    } else {
      state.forbiddenWrites.push(url.pathname)
      await route.fulfill({ status: 400, json: { message: 'Unexpected auth request' } })
    }
  })
  return state
}

async function requestRecovery(page: Page, state: Awaited<ReturnType<typeof mockRecovery>>) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false)
  await page.getByLabel('Alamat email').fill(state.user.email)
  await page.getByRole('button', { name: 'Lupa kata sandi?' }).click()
  await expect(page.locator('.form-message--success')).toContainText('Jika email terdaftar')
}

async function openRecovery(page: Page, state: Awaited<ReturnType<typeof mockRecovery>>) {
  await requestRecovery(page, state)
  const callback = new URL(state.callback)
  callback.searchParams.set('code', 'test-recovery-code')
  expect((await page.context().cookies()).some(cookie => cookie.name.endsWith('-code-verifier'))).toBe(true)
  await page.goto(callback.href, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false)
}

async function fillPassword(page: Page, password = 'new-test-password-123') {
  await page.getByLabel('Kata sandi baru', { exact: true }).fill(password)
  await page.getByLabel('Konfirmasi kata sandi baru', { exact: true }).fill(password)
}

test('password recovery: email, PKCE exchange, update, local logout, and sign in again', async ({ page }) => {
  const state = await mockRecovery(page)
  await openRecovery(page, state)
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toBeVisible()
  await expect(page.locator('.account')).toContainText(state.user.email)
  await expect(page).toHaveURL('http://localhost:3000/atur-ulang-kata-sandi')
  await page.screenshot({ path: test.info().outputPath('recovery-desktop.png') })
  await fillPassword(page)
  await page.getByRole('button', { name: 'Simpan kata sandi baru' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(page.locator('.success-message')).toHaveText('Kata sandi berhasil diperbarui.')
  await page.getByRole('link', { name: 'Masuk dengan kata sandi baru' }).click()
  await page.getByLabel('Alamat email').fill(state.user.email)
  await page.getByLabel('Kata sandi', { exact: true }).fill('new-test-password-123')
  await page.getByRole('button', { name: 'Masuk ke Dompet Santai', exact: true }).click()
  await expect(page.getByTestId('page-title')).toBeVisible()
  expect(state.exchanges).toBe(1)
  expect(state.updates).toEqual(['new-test-password-123'])
  expect(state.logoutScopes).toEqual(['local'])
  expect(state.forbiddenWrites).toEqual([])
})

test('password recovery: minimum length and confirmation are checked before sending', async ({ page }) => {
  const state = await mockRecovery(page)
  await openRecovery(page, state)
  await fillPassword(page, 'short')
  await page.getByRole('button', { name: 'Simpan kata sandi baru' }).click()
  await expect(page.getByRole('alert')).toContainText('minimal 8 karakter')
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toBeFocused()
  await page.getByLabel('Kata sandi baru', { exact: true }).fill('long-test-password')
  await page.getByRole('button', { name: 'Simpan kata sandi baru' }).click()
  await expect(page.getByRole('alert')).toContainText('Konfirmasi kata sandi belum sama')
  await page.getByLabel('Tampilkan kata sandi').check()
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toHaveAttribute('type', 'text')
  await expect(page.getByLabel('Konfirmasi kata sandi baru', { exact: true })).toHaveAttribute('type', 'text')
  expect(state.updates).toEqual([])
})

test('password recovery: a verified session survives reloading the cleaned URL', async ({ page }) => {
  const state = await mockRecovery(page)
  await openRecovery(page, state)
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toBeVisible()
  await expect(page).toHaveURL('http://localhost:3000/atur-ulang-kata-sandi')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toBeVisible()
  await expect(page.locator('.account')).toContainText(state.user.email)
  expect(state.exchanges).toBe(1)
  expect(state.updates).toEqual([])
})

for (const entry of ['', '?code=missing-verifier', '#error=access_denied&error_code=otp_expired&error_description=Expired'] as const) {
  test(`password recovery: rejects a missing or invalid session ${entry || '(direct visit)'}`, async ({ page }) => {
    const state = await mockRecovery(page)
    const response = await page.goto('/atur-ulang-kata-sandi' + entry)
    expect(response?.headers()['cache-control']).toBe('no-store')
    await expect(page.getByRole('alert')).toContainText('Minta tautan baru')
    await expect(page.getByLabel('Kata sandi baru', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Kembali ke halaman masuk' })).toBeVisible()
    await expect(page).toHaveURL('http://localhost:3000/atur-ulang-kata-sandi')
    expect(state.updates).toEqual([])
  })
}

test('password recovery: an expired code does not fall back to an existing session', async ({ page }) => {
  const state = await mockRecovery(page)
  await openRecovery(page, state)
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toBeVisible()
  state.exchangeFails = true
  await openRecovery(page, state)
  await expect(page.getByRole('alert')).toContainText('kedaluwarsa')
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toHaveCount(0)
  await expect(page).toHaveURL('http://localhost:3000/atur-ulang-kata-sandi')
  expect(state.exchanges).toBe(2)
  expect(state.updates).toEqual([])
})

test('password recovery: a callback without its verifier does not use an existing session', async ({ page }) => {
  const state = await mockRecovery(page)
  await openRecovery(page, state)
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toBeVisible()
  await page.goto('/atur-ulang-kata-sandi?code=no-verifier')
  await expect(page.getByRole('alert')).toContainText('tidak valid')
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toHaveCount(0)
  expect(state.exchanges).toBe(1)
  expect(state.updates).toEqual([])
})

for (const [code, message] of [
  ['weak_password', 'kata sandi yang lebih kuat'],
  ['same_password', 'berbeda dari kata sandi sebelumnya'],
  ['unexpected_failure', 'Periksa koneksi lalu coba lagi'],
] as const) {
  test(`password recovery: ${code} preserves the form and supports retry`, async ({ page }) => {
    const state = await mockRecovery(page)
    state.updateError = code
    await openRecovery(page, state)
    await fillPassword(page)
    await page.getByRole('button', { name: 'Simpan kata sandi baru' }).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByLabel('Kata sandi baru', { exact: true })).toHaveValue('new-test-password-123')
    await expect(page.getByLabel('Konfirmasi kata sandi baru', { exact: true })).toHaveValue('new-test-password-123')
    state.updateError = ''
    await page.getByRole('button', { name: 'Simpan kata sandi baru' }).click()
    await expect(page.locator('.success-message')).toHaveText('Kata sandi berhasil diperbarui.')
    expect(state.updates).toHaveLength(2)
  })
}

for (const verification of ['expired', 'different'] as const) {
  test(`password recovery: ${verification} account at submission cannot change a password`, async ({ page }) => {
    const state = await mockRecovery(page)
    await openRecovery(page, state)
    await fillPassword(page)
    state.verification = verification
    await page.getByRole('button', { name: 'Simpan kata sandi baru' }).click()
    await expect(page.getByRole('alert')).toContainText(verification === 'expired' ? 'Sesi pemulihan sudah berakhir' : 'Akun atau sesi berubah')
    await expect(page.getByLabel('Kata sandi baru', { exact: true })).toHaveCount(0)
    expect(state.updates).toEqual([])
  })
}

test('password recovery: logout endpoint failure preserves success after local session cleanup', async ({ page }) => {
  const state = await mockRecovery(page)
  state.logoutFails = true
  await openRecovery(page, state)
  await fillPassword(page)
  await page.getByRole('button', { name: 'Simpan kata sandi baru' }).click()
  await expect(page.locator('.success-message')).toHaveText('Kata sandi berhasil diperbarui.')
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toHaveCount(0)
  // This SDK clears the local session even when the remote logout fails.
  // A saved password must not be submitted again or reported as a failure.
  await expect(page.getByRole('link', { name: 'Masuk dengan kata sandi baru' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(state.updates).toHaveLength(1)
  expect(state.logoutScopes).toEqual(['local'])
})

test('password recovery: mobile dark theme fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await mockRecovery(page)
  state.theme = 'dark'
  await openRecovery(page, state)
  await expect(page.getByLabel('Kata sandi baru', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/theme-dark/)
  await expect(page.locator('.reset-password-page')).toHaveCSS('background-color', 'rgb(18, 22, 21)')
  await expect(page.locator('.recovery-card')).toHaveCSS('background-color', 'rgb(27, 34, 32)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('recovery-mobile-dark.png') })
})

test('password recovery: failed email request remains retryable', async ({ page }) => {
  const state = await mockRecovery(page)
  state.recoverFails = true
  await page.goto('/login')
  await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false)
  await page.getByLabel('Alamat email').fill(state.user.email)
  await page.getByRole('button', { name: 'Lupa kata sandi?' }).click()
  await expect(page.getByRole('alert')).toContainText('Terlalu banyak permintaan email')
  await expect(page.getByRole('button', { name: 'Lupa kata sandi?' })).toBeEnabled()
  expect(state.updates).toEqual([])
})
