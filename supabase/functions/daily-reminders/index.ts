import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import webpush from 'npm:web-push@3.6.7'
import { deliveryResult, pushPayload, validateSubscription } from './core.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: cors })
const url = Deno.env.get('SUPABASE_URL')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const cronSecret = Deno.env.get('PUSH_CRON_SECRET') || ''
const configured = !!publicKey && !!privateKey && !!cronSecret
if (configured) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || url, publicKey, privateKey)
function check(error: unknown) { if (error) throw new Error('Penyimpanan notifikasi belum tersedia. Coba lagi nanti.') }
async function send(subscription: { endpoint: string; p256dh: string; auth: string }, owner: string, date: string, expiresAt: number) {
  try {
    const response = await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, pushPayload(owner, date, expiresAt), {
      TTL: Math.max(0, Math.min(3600, Math.floor((expiresAt - Date.now()) / 1000))), urgency: 'normal', timeout: 10000,
    })
    return response.statusCode as number
  } catch (error) { return (error as { statusCode?: number }).statusCode || 0 }
}

async function dispatch() {
  const { data: jobs, error } = await admin.rpc('claim_due_note_push', { p_limit: 100 })
  check(error)
  const result = { claimed: jobs?.length || 0, sent: 0, failed: 0, expired: 0, skipped: 0 }
  // Bounded concurrency keeps each minute's worker inside the Edge runtime limit.
  for (let offset = 0; offset < (jobs?.length || 0); offset += 10) {
    await Promise.all(jobs.slice(offset, offset + 10).map(async (job: any) => {
      // Recheck after claiming, so a newly saved note or disabled reminder wins.
      const [{ data: settings, error: settingsError }, { count, error: notesError }, { data: active, error: activeError }] = await Promise.all([
        admin.from('user_settings').select('notes_reminders').eq('user_id', job.user_id).maybeSingle(),
        admin.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', job.user_id).eq('occurred_on', job.reminder_date),
        admin.from('push_subscriptions').select('id').eq('id', job.subscription_id).maybeSingle(),
      ])
      check(settingsError || notesError || activeError)
      let status: number | null = null
      let state = 'skipped'
      if (active && settings?.notes_reminders && !count && Date.parse(job.expires_at) > Date.now()) {
        status = await send(job, job.user_id, job.reminder_date, Date.parse(job.expires_at))
        const delivered = deliveryResult(status)
        if (delivered === 'expired') {
          check((await admin.from('push_subscriptions').delete().eq('id', job.subscription_id)).error)
          result.expired++
          return
        }
        state = delivered
      }
      check((await admin.from('push_deliveries').update({ status: state, last_status: status,
        ...(state === 'sent' ? { sent_at: new Date().toISOString() } : {}), retry_at: new Date(Date.now() + 300000).toISOString(),
      }).eq('subscription_id', job.subscription_id).eq('reminder_date', job.reminder_date).eq('lease_token', job.lease_token)).error)
      result[state as 'sent' | 'failed' | 'skipped']++
    }))
  }
  // Delivery metadata is operational history, not a permanent archive.
  check((await admin.from('push_deliveries').delete().lt('reminder_date', new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10))).error)
  return result
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
  try {
    if (Number(request.headers.get('content-length') || 0) > 8192) return reply({ error: 'Permintaan terlalu besar.' }, 413)
    const text = await request.text()
    if (text.length > 8192) return reply({ error: 'Permintaan terlalu besar.' }, 413)
    const body = JSON.parse(text)
    if (body.action === 'dispatch') {
      if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) return reply({ error: 'Unauthorized' }, 401)
      if (!configured) return reply({ error: 'Notifikasi server belum dikonfigurasi.' }, 503)
      return reply(await dispatch())
    }
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return reply({ error: 'Silakan masuk kembali.' }, 401)
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return reply({ error: 'Silakan masuk kembali.' }, 401)
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    if (body.action === 'status') {
      const { data, error } = await admin.from('push_subscriptions').select('id,timezone').eq('user_id', user.id).eq('endpoint', endpoint).maybeSingle()
      check(error)
      return reply({ configured, publicKey, enabled: !!data, timezone: data?.timezone })
    }
    if (body.action === 'unsubscribe') {
      check((await admin.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)).error)
      return reply({ removed: true })
    }
    if (!configured) return reply({ error: 'Layanan notifikasi server belum siap.' }, 503)
    if (body.action === 'subscribe') {
      const valid = validateSubscription(body.subscription, body.timezone)
      const { count, error } = await admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).neq('endpoint', valid.subscription.endpoint)
      check(error)
      if ((count || 0) >= 10) return reply({ error: 'Maksimal 10 perangkat. Nonaktifkan salah satu perangkat terlebih dahulu.' }, 400)
      // A deliberate opt-in binds this origin's current browser endpoint to
      // the verified account; request bodies never decide the owner.
      check((await admin.from('push_subscriptions').upsert({ user_id: user.id, endpoint: valid.subscription.endpoint,
        ...valid.subscription.keys, timezone: valid.timezone }, { onConflict: 'endpoint' })).error)
      return reply({ enabled: true })
    }
    if (body.action === 'test') {
      const { data, error } = await admin.from('push_subscriptions').update({ last_test_at: new Date().toISOString() })
        .eq('user_id', user.id).eq('endpoint', endpoint).or(`last_test_at.is.null,last_test_at.lt.${new Date(Date.now() - 60000).toISOString()}`).select('*').maybeSingle()
      check(error)
      if (!data) return reply({ error: 'Aktifkan perangkat ini atau tunggu satu menit sebelum mengirim uji lagi.' }, 429)
      const status = await send(data, user.id, 'test', Date.now() + 300000)
      if (deliveryResult(status) === 'expired') await admin.from('push_subscriptions').delete().eq('id', data.id)
      if (deliveryResult(status) !== 'sent') return reply({ error: 'Notifikasi uji belum terkirim. Aktifkan ulang perangkat atau coba lagi nanti.' }, 503)
      return reply({ accepted: true })
    }
    return reply({ error: 'Permintaan tidak dikenal.' }, 400)
  } catch (error) {
    // No tokens, endpoint URLs, keys or financial details in logs/responses.
    return reply({ error: error instanceof Error && /tidak valid|tidak didukung|belum tersedia/.test(error.message) ? error.message : 'Notifikasi belum berhasil diproses. Coba lagi nanti.' }, 400)
  }
})
