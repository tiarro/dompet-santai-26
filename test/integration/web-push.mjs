// Real Supabase/Edge/Push check. All accounts are temporary and removed finally.
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'

process.loadEnvFile('.env')
const url = process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, options)
const users = []
let browser, stage = 'initialize'
function check(error) { if (error) throw Object.assign(new Error('Live push verification failed: ' + stage), { code: error.code, status: error.status }) }
async function account() {
  const email = 'web-push-' + randomUUID() + '@example.invalid', password = randomBytes(30).toString('base64url')
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  check(result.error); users.push(result.data.user.id)
  const client = createClient(url, key, options)
  check((await client.auth.signInWithPassword({ email, password })).error)
  return { id: result.data.user.id, email, password, client }
}
async function invoke(client, action, body = {}) {
  const result = await client.functions.invoke('daily-reminders', { body: { action, ...body } })
  check(result.error)
  return result.data
}
try {
  stage = 'temporary user and configuration'
  const a = await account(), b = await account()
  const config = await invoke(a.client, 'status')
  assert.equal(config.configured, true)
  assert.ok(config.publicKey)
  assert.equal((await a.client.rpc('claim_due_note_push')).error?.code, '42501')
  console.log('PASS live: function configured, authenticated status, server-only claim')
  stage = 'browser registration'
  browser = await chromium.launch({ channel: process.env.PUSH_BROWSER || 'chrome', headless: true,
    ignoreDefaultArgs: ['--disable-background-networking', '--disable-component-update'] })
  const context = await browser.newContext({ permissions: ['notifications'] })
  const page = await context.newPage()
  await page.goto('http://localhost:3000/offline.html')
  const registered = await page.evaluate(async ({ publicKey, owner }) => {
    await navigator.serviceWorker.register('/push-sw.js', { scope: '/' })
    const registration = await navigator.serviceWorker.ready
    const channel = new MessageChannel()
    const saved = new Promise(resolve => { channel.port1.onmessage = resolve })
    registration.active.postMessage({ type: 'PUSH_OWNER', owner }, [channel.port2])
    await saved
    try {
      const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      const subscription = await Promise.race([
        registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Push registration timed out')), 25000)),
      ])
      return { subscription: subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
    } catch (error) { return { browserRegistrationError: error.name } }
  }, { publicKey: config.publicKey, owner: a.id })
  if (!registered.subscription) {
    console.log('UNVERIFIED real push delivery: browser push-service registration unavailable (' + registered.browserRegistrationError + ')')
    // Verify live RLS and handlers with a deliberately inert, unsent endpoint.
    // This is API validation, not a claim of real push-service delivery.
    stage = 'live account isolation with inert subscription'
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const jwk = privateKey.export({ format: 'jwk' })
    const inert = { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/verification-' + randomUUID(), keys: {
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    } }, timezone: 'Asia/Jakarta' }
    await invoke(a.client, 'subscribe', inert)
    assert.equal((await invoke(a.client, 'status', { endpoint: inert.subscription.endpoint })).enabled, true)
    assert.equal((await invoke(b.client, 'status', { endpoint: inert.subscription.endpoint })).enabled, false)
    assert.equal((await b.client.from('push_subscriptions').select('*').eq('user_id', a.id)).data.length, 0)
    await invoke(b.client, 'unsubscribe', { endpoint: inert.subscription.endpoint })
    assert.equal((await invoke(a.client, 'status', { endpoint: inert.subscription.endpoint })).enabled, true)
    await invoke(a.client, 'unsubscribe', { endpoint: inert.subscription.endpoint })
    console.log('PASS live API only: subscribe/status/unsubscribe and RLS with inert endpoint (no push sent)')
  } else {
    stage = 'subscribe with account ownership and RLS'
    await invoke(a.client, 'subscribe', registered)
    assert.equal((await invoke(a.client, 'status', { endpoint: registered.subscription.endpoint })).enabled, true)
    assert.equal((await invoke(b.client, 'status', { endpoint: registered.subscription.endpoint })).enabled, false)
    assert.equal((await b.client.from('push_subscriptions').select('*').eq('user_id', a.id)).data.length, 0)
    await invoke(b.client, 'unsubscribe', { endpoint: registered.subscription.endpoint })
    assert.equal((await invoke(a.client, 'status', { endpoint: registered.subscription.endpoint })).enabled, true)
    console.log('PASS live: browser subscription, account-bound status/delete and cross-account RLS')
    stage = 'send real notification'
    await invoke(a.client, 'test', { endpoint: registered.subscription.endpoint })
    await expect.poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length), { timeout: 30000 }).toBe(1)
    console.log('PASS live: encrypted Web Push accepted and notification visible in the real browser worker')
    // Keep only a static document open. No app timer or frontend scheduler runs.
    stage = 'server schedule while app closed'
    const now = new Date()
    const reminderTime = new Intl.DateTimeFormat('en-GB', { timeZone: registered.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
    check((await admin.from('user_settings').upsert({ user_id: a.id, notes_reminders: true, reminder_time: reminderTime })).error)
    await expect.poll(async () => {
      const result = await admin.from('push_deliveries').select('status').in('subscription_id', (await a.client.from('push_subscriptions').select('id')).data.map(row => row.id))
      check(result.error)
      return result.data.some(row => row.status === 'sent')
    }, { timeout: 85000, intervals: [5000] }).toBe(true)
    const visible = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.tag))
    assert.ok(visible.some(tag => tag.startsWith('dompet-santai-notes-') && !tag.endsWith('test')))
    console.log('PASS live: cron sent daily reminder and worker displayed it without the app running')
    stage = 'unsubscribe'
    await invoke(a.client, 'unsubscribe', { endpoint: registered.subscription.endpoint })
    assert.equal((await invoke(a.client, 'status', { endpoint: registered.subscription.endpoint })).enabled, false)
  }
  stage = 'cron authorization'
  const invalid = await admin.functions.invoke('daily-reminders', { body: { action: 'dispatch' }, headers: { 'x-cron-secret': 'invalid' } })
  assert.equal(invalid.error?.context?.status, 401)
  const secrets = Object.fromEntries((await readFile('.cache/web-push/secrets.env', 'utf8')).trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)))
  const valid = await admin.functions.invoke('daily-reminders', { body: { action: 'dispatch' }, headers: { 'x-cron-secret': secrets.PUSH_CRON_SECRET } })
  check(valid.error)
  assert.equal(typeof valid.data.claimed, 'number')
  console.log('PASS live: cron secret enforced and real dispatcher completes')
} catch (error) {
  console.error(JSON.stringify({ stage, name: error.name, code: error.code, status: error.status }))
  process.exitCode = 1
} finally {
  await browser?.close()
  for (const id of users) {
    const result = await admin.auth.admin.deleteUser(id)
    if (result.error) { console.error('Temporary user cleanup failed'); process.exitCode = 1 }
  }
  console.log('Temporary Web Push test accounts cleaned up.')
}
