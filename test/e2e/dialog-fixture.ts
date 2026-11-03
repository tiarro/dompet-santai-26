import { expect, type Locator, type Page } from '@playwright/test'

export async function expectExplicitDismissal(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible()
  const overflow = await page.evaluate(() => document.body.style.overflow)
  const bounds = await dialog.boundingBox()
  const viewport = page.viewportSize()!
  const point = [
    { x: 1, y: 1 }, { x: viewport.width - 1, y: 1 },
    { x: 1, y: viewport.height - 1 }, { x: viewport.width - 1, y: viewport.height - 1 },
  ].find(point => bounds && (point.x < bounds.x || point.x > bounds.x + bounds.width
    || point.y < bounds.y || point.y > bounds.y + bounds.height))
  expect(point, 'Panel has a backdrop to click').toBeDefined()
  await page.mouse.click(point!.x, point!.y)
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(overflow)
}
