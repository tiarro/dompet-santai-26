import { test as base } from '@playwright/test'

// Authentication tests exercise the app and mocked Auth APIs without waiting
// for third-party font servers. Browser layout uses the app's fallback fonts.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
    await page.route('https://fonts.gstatic.com/**', route => route.abort())
    await use(page)
  },
})

export { expect, type Page } from '@playwright/test'
