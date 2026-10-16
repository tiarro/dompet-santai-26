import { expect, test } from '@playwright/test'

for (const scenario of [
  { entry: 'login', profile: 'complete', destination: '/' },
  { entry: 'register', profile: 'complete', destination: '/' },
  { entry: 'login', profile: 'missing', destination: '/onboarding' },
  { entry: 'register', profile: 'missing', destination: '/onboarding' },
  { entry: 'login', profile: 'incomplete', destination: '/onboarding' },
  { entry: 'login', profile: 'unavailable', destination: '/auth/callback' },
  { entry: 'login', profile: 'expired', destination: '/auth/callback' },
] as const) {
  test(`Google ${scenario.entry}: ${scenario.profile} profile`, async ({ page, context }) => {
    // Exercise HTTP LAN-style verification instead of local JWT cryptography.
    await page.addInitScript(() => { Reflect.deleteProperty(Crypto.prototype, 'subtle') })
    const id = '00000000-0000-4000-8000-000000000123'
    const user = { id, aud: 'authenticated', role: 'authenticated', email: 'google@example.com',
      app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Google User', avatar_url: 'https://lh3.googleusercontent.com/a/test-avatar' }, created_at: '2026-01-01T00:00:00Z' }
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = encode({ alg: 'ES256', kid: 'test-key', typ: 'JWT' }) + '.' + encode({
      sub: id, aud: 'authenticated', role: 'authenticated', email: user.email, user_metadata: user.user_metadata,
      exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
    }) + '.' + encode('test-signature')
    let exchanges = 0
    let profileReads = 0
    let profileUnavailable = scenario.profile === 'unavailable'
    const forbiddenWrites: string[] = []
    await page.route('https://lh3.googleusercontent.com/a/test-avatar', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="teal"/></svg>' }))
    await page.route('**/api/profile/photo', route => route.fulfill({ status: 204 }))
    await page.route('**/rest/v1/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/profiles')) {
        profileReads++
        expect(url.searchParams.get('id')).toBe('eq.' + id)
        expect(route.request().method()).toBe('GET')
        if (profileUnavailable) {
          await route.fulfill({ status: 403, json: { message: 'Profile unavailable' } })
        } else await route.fulfill({ json: scenario.profile === 'missing' ? [] : [{
          username: 'Existing user', onboarding_goal: 'savings',
          onboarding_completed_at: scenario.profile === 'incomplete' ? null : '2026-10-01T00:00:00Z',
        }] })
      } else if (url.pathname.endsWith('/get_finance_snapshot')) {
        await route.fulfill({ json: { profile: { id }, settings: {}, wallets: [], categories: [], transactions: [], budgets: [], goals: [], movements: [], _meta: { fingerprint: 'test' } } })
      } else {
        forbiddenWrites.push(url.pathname)
        await route.fulfill({ status: 400, json: {} })
      }
    })
    await page.route('**/auth/v1/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/authorize')) {
        const callback = url.searchParams.get('redirect_to')!
        expect(new URL(callback).pathname).toBe('/auth/callback')
        expect(url.searchParams.get('provider')).toBe('google')
        expect(url.searchParams.get('code_challenge')).toBeTruthy()
        await route.fulfill({ status: 302, headers: { location: callback + '?code=test-code' } })
      } else if (url.pathname.endsWith('/token')) {
        exchanges++
        expect(url.searchParams.get('grant_type')).toBe('pkce')
        expect(route.request().postDataJSON().code_verifier).toBeTruthy()
        if (scenario.profile === 'expired') {
          await route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Expired code' } })
        } else await route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } })
      } else if (url.pathname.endsWith('/user')) {
        await new Promise(resolve => setTimeout(resolve, 150))
        await route.fulfill({ json: user })
      } else {
        forbiddenWrites.push(url.pathname)
        await route.fulfill({ status: 400, json: {} })
      }
    })

    // Re-enter via both buttons with the same identity to check repeat login.
    const attempts = scenario.profile === 'complete' ? 2 : 1
    for (let attempt = 0; attempt < attempts; attempt++) {
      await context.clearCookies()
      await page.goto('/' + scenario.entry)
      await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false)
      await page.getByRole('button', { name: scenario.entry === 'login' ? 'Masuk dengan Google' : 'Daftar dengan Google', exact: true }).click()
      if (scenario.profile === 'unavailable' || scenario.profile === 'expired') {
        await expect(page.getByRole('alert')).toContainText(scenario.profile === 'expired' ? 'kedaluwarsa' : 'Status akun belum bisa dimuat')
        await expect(page).toHaveURL('http://localhost:3000/auth/callback')
      } else {
        await expect(page).toHaveURL('http://localhost:3000' + scenario.destination)
        if (scenario.destination === '/') {
          await expect(page.getByTestId('page-title')).toHaveText('Dompet Santai')
          await expect(page.locator('.desktop-sidebar__brand img')).toHaveAttribute('src', user.user_metadata.avatar_url)
          await expect(page.locator('.desktop-sidebar__brand img')).toHaveJSProperty('naturalWidth', 32)
        }
        else await expect(page.locator('#onboarding-nickname')).toHaveValue(scenario.profile === 'missing' ? 'Google User' : 'Existing user')
      }
    }
    if (scenario.profile === 'unavailable') {
      profileUnavailable = false
      await page.getByRole('button', { name: 'Coba lagi', exact: true }).click()
      await expect(page).toHaveURL('http://localhost:3000/')
    }
    expect(exchanges).toBe(attempts)
    expect(profileReads).toBe(scenario.profile === 'expired' ? 0 : attempts + (scenario.profile === 'unavailable' ? 1 : 0))
    expect(forbiddenWrites).toEqual([])
  })
}

test('Google callback without a session stays public and shows recovery', async ({ page }) => {
  await page.goto('/auth/callback?error=access_denied')
  await expect(page.getByRole('alert')).toContainText('Login Google belum selesai')
  await expect(page).toHaveURL('http://localhost:3000/auth/callback')
  await expect(page.getByRole('link', { name: 'Kembali ke halaman masuk' })).toBeVisible()
})
