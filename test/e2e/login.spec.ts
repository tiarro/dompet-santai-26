import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

for (const outcome of ['success', 'invalid-password', 'verification-failed'] as const) {
  test(`mobile login with delayed session verification: ${outcome}`, async ({ page }) => {
    // HTTP LAN origins cannot use WebCrypto for local JWT verification.
    await page.addInitScript(() => { Reflect.deleteProperty(Crypto.prototype, 'subtle') })
    const id = '00000000-0000-4000-8000-000000000123'
    const user = { id, aud: 'authenticated', role: 'authenticated', email: 'login@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = encode({ alg: 'ES256', kid: 'test-key', typ: 'JWT' }) + '.' + encode({
      sub: id, aud: 'authenticated', role: 'authenticated', email: user.email,
      exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
    }) + '.' + Buffer.from('test-signature').toString('base64url')
    await page.route('**/api/profile/photo', route => route.fulfill({ status: 404, json: { message: 'No photo' } }))
    let verificationCalls = 0
    await page.route('**/auth/v1/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/token')) {
        if (outcome === 'invalid-password') {
          await route.fulfill({ status: 400, json: { code: 'invalid_credentials', message: 'Invalid login credentials' } })
        } else {
          await route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user } })
        }
      } else if (path.endsWith('/user')) {
        verificationCalls++
        await new Promise(resolve => setTimeout(resolve, 1200))
        if (outcome === 'verification-failed') {
          await route.fulfill({ status: 401, json: { message: 'Invalid token' } })
        } else await route.fulfill({ json: user })
      } else await route.fulfill({ status: 400, json: { message: 'Unexpected auth request' } })
    })
    await page.goto('/login')
    await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false)
    expect(await page.evaluate(() => 'subtle' in crypto)).toBe(false)
    await page.getByLabel('Alamat email').fill(user.email)
    await page.getByLabel('Kata sandi', { exact: true }).fill('test-password-123')
    await page.getByRole('button', { name: 'Masuk ke Dompet Santai', exact: true }).click()

    if (outcome === 'success') {
      await expect(page.getByTestId('page-title')).toHaveText('Dompet Santai')
      await expect(page).toHaveURL(/\/$/)
      expect(verificationCalls).toBeGreaterThan(0)
      // The established session also supports navigation to another protected page.
      await page.addStyleTag({ content: '#nuxt-devtools-container { display:none !important }' })
      await page.getByRole('button', { name: 'Anggaran', exact: true }).click()
      await expect(page).toHaveURL(/\/anggaran$/)
      await expect(page.locator('.summary-metrics')).toBeVisible()
    } else {
      await expect(page.getByRole('alert')).toContainText(outcome === 'invalid-password' ? 'Invalid login credentials' : 'Sesi login belum dapat diverifikasi')
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByRole('button', { name: 'Masuk ke Dompet Santai', exact: true })).toBeEnabled()
      await expect(page.getByTestId('page-title')).toHaveCount(0)
    }
  })
}
