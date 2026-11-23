export interface PushSubscriptionData { endpoint: string; keys: { p256dh: string; auth: string } }

export function validateSubscription(value: unknown, timezone: unknown): { subscription: PushSubscriptionData; timezone: string } {
  const subscription = value as PushSubscriptionData
  if (!subscription || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2048) throw new Error('Data langganan notifikasi tidak valid.')
  const url = new URL(subscription.endpoint)
  const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']
  const allowed = hosts.includes(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !allowed) throw new Error('Penyedia notifikasi tidak didukung.')
  if (!/^[A-Za-z0-9_-]{87}$/.test(subscription.keys?.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(subscription.keys?.auth)) throw new Error('Kunci notifikasi tidak valid.')
  if (typeof timezone !== 'string' || timezone.length > 100) throw new Error('Zona waktu tidak valid.')
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }) } catch { throw new Error('Zona waktu tidak valid.') }
  return { subscription, timezone }
}

export function pushPayload(owner: string, date: string, expiresAt: number) {
  return JSON.stringify({ kind: 'notes', owner, date, expiresAt })
}

export function deliveryResult(status: number | undefined) {
  if (status === 404 || status === 410) return 'expired'
  if (status !== undefined && status >= 200 && status < 300) return 'sent'
  return 'failed'
}
