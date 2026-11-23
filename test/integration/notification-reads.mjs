// Explicit live check: temporary Auth users and their rows are deleted finally.
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'

process.loadEnvFile('.env')
const url = process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const publishableKey = process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY
if (!url || !publishableKey || !secretKey) throw new Error('Supabase configuration missing.')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, secretKey, options)
const created = []
let browser
let operation = 'initialize'

function check(error) { if (error) throw Object.assign(new Error('Live verification failed: ' + operation), { code: error.code, status: error.status }) }
async function account() {
  const email = 'notification-sync-' + randomUUID() + '@example.invalid'
  const password = randomBytes(30).toString('base64url')
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  check(error)
  created.push(data.user.id)
  const client = createClient(url, publishableKey, options)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  check(signInError)
  return { id: data.user.id, email, password, client }
}
async function login(page, account) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__?.$nuxt?.isHydrating === false)
  await page.getByLabel('Alamat email').fill(account.email)
  await page.getByLabel('Kata sandi', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Masuk ke Dompet Santai', exact: true }).click()
  await expect(page.getByTestId('page-title')).toBeVisible({ timeout: 20000 })
  await page.addStyleTag({ content: '#nuxt-devtools-container { display:none !important }' })
}

try {
  operation = 'create temporary users'
  const a = await account(), b = await account()
  operation = 'insert own read marker'
  const key = JSON.stringify(['note', 'integration-' + randomUUID()])
  const firstTime = new Date().toISOString()
  check((await a.client.from('notification_reads').upsert({ user_id: a.id, read_key: key, read_at: firstTime }, { onConflict: 'user_id,read_key', ignoreDuplicates: true })).error)
  operation = 'retry without replacing first read time'
  check((await a.client.from('notification_reads').upsert({ user_id: a.id, read_key: key, read_at: new Date(Date.now() + 10000).toISOString() }, { onConflict: 'user_id,read_key', ignoreDuplicates: true })).error)
  const own = await a.client.from('notification_reads').select('*').eq('read_key', key)
  check(own.error)
  assert.equal(own.data.length, 1)
  assert.equal(new Date(own.data[0].read_at).toISOString(), firstTime)
  operation = 'cross-account isolation'
  const foreign = await b.client.from('notification_reads').select('*').eq('user_id', a.id)
  check(foreign.error)
  assert.equal(foreign.data.length, 0)
  assert.equal((await b.client.from('notification_reads').insert({ user_id: a.id, read_key: 'forged' })).error?.code, '42501')
  assert.equal((await b.client.from('notification_reads').update({ read_at: firstTime }).eq('user_id', a.id)).error?.code, '42501')
  operation = 'anonymous isolation'
  const anon = createClient(url, publishableKey, options)
  assert.equal((await anon.from('notification_reads').select('*')).error?.code, '42501')
  console.log('PASS live API: own read/write, immutable retry timestamp, cross-account RLS and anonymous denial')

  operation = 'create temporary bill for browser notifications'
  const today = new Date().toLocaleDateString('en-CA')
  check((await a.client.from('bill_reminders').insert({ user_id: a.id, name: 'Verification notification', amount: 10000,
    due_on: today, recurrence: 'once', anchor_day: Number(today.slice(8)), category_code: 'bills', account_code: 'bank' })).error)
  browser = await chromium.launch({ headless: true })
  const oneContext = await browser.newContext(), twoContext = await browser.newContext()
  const one = await oneContext.newPage(), two = await twoContext.newPage()
  operation = 'live browser login for same account on two devices'
  await login(one, a)
  await login(two, a)
  await one.getByRole('button', { name: 'Lihat notifikasi', exact: true }).click()
  await two.getByRole('button', { name: 'Lihat notifikasi', exact: true }).click()
  const firstPanel = one.getByRole('dialog', { name: 'Notifikasi' })
  const secondPanel = two.getByRole('dialog', { name: 'Notifikasi' })
  await expect(firstPanel.locator('.unread-dot')).toHaveCount(1)
  await expect(secondPanel.locator('.unread-dot')).toHaveCount(1)
  operation = 'live cross-device synchronization'
  await firstPanel.getByRole('button', { name: 'Tandai semua dibaca' }).click()
  await expect.poll(async () => {
    const rows = await a.client.from('notification_reads').select('read_key')
    check(rows.error)
    return rows.data.filter(row => row.read_key.startsWith('["bill",')).length
  }, { timeout: 20000 }).toBe(1)
  await two.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(secondPanel.locator('.unread-dot')).toHaveCount(0, { timeout: 20000 })
  await expect(secondPanel.getByRole('alert')).toHaveCount(0)
  console.log('PASS live browsers: two independent sessions share read status through real Supabase')

  operation = 'live offline queue and reconnect'
  check((await a.client.from('bill_reminders').insert({ user_id: a.id, name: 'Offline verification notification', amount: 10000,
    due_on: today, recurrence: 'once', anchor_day: Number(today.slice(8)), category_code: 'bills', account_code: 'bank' })).error)
  await one.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(firstPanel.locator('.unread-dot')).toHaveCount(1, { timeout: 20000 })
  await oneContext.setOffline(true)
  await firstPanel.getByRole('button', { name: 'Tandai semua dibaca' }).click()
  await expect(firstPanel).toContainText('akan disinkronkan saat online')
  await oneContext.setOffline(false)
  await expect.poll(async () => {
    const rows = await a.client.from('notification_reads').select('read_key')
    check(rows.error)
    return rows.data.filter(row => row.read_key.startsWith('["bill",')).length
  }, { timeout: 20000 }).toBe(2)
  await two.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(secondPanel.locator('.notification-item')).toHaveCount(2, { timeout: 20000 })
  await expect(secondPanel.locator('.unread-dot')).toHaveCount(0, { timeout: 20000 })
  console.log('PASS live browsers: offline mark persists locally, reconnect uploads, second device receives it')
} catch (error) {
  console.error(JSON.stringify({ operation, error: error.name, code: error.code, status: error.status, message: 'Live verification did not complete.' }))
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) { console.error('Temporary verification account cleanup failed.'); process.exitCode = 1 }
  }
  if (created.length) console.log('Temporary verification accounts cleaned up.')
}
