import { expect, test } from '@playwright/test'

test('shows the Dompet Santai dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('page-title')).toHaveText('Dompet Santai')
})
