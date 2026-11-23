import { describe, expect, it } from 'vitest'
import { deliveryResult, pushPayload, validateSubscription } from '../../supabase/functions/daily-reminders/core'

const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }
describe('web push input and delivery handling', () => {
  it('accepts supported push services and rejects SSRF endpoints or malformed keys', () => {
    expect(validateSubscription(subscription, 'Asia/Jakarta').timezone).toBe('Asia/Jakarta')
    for (const endpoint of ['http://fcm.googleapis.com/send', 'https://localhost/push', 'https://fcm.googleapis.com.evil.test/push', 'https://user:password@fcm.googleapis.com/push', 'https://fcm.googleapis.com:444/send']) {
      expect(() => validateSubscription({ ...subscription, endpoint }, 'UTC')).toThrow()
    }
    expect(() => validateSubscription({ ...subscription, keys: {} }, 'UTC')).toThrow()
    expect(() => validateSubscription(subscription, 'Wrong/Timezone')).toThrow()
  })
  it('marks expired subscriptions and transient failures separately', () => {
    expect(deliveryResult(201)).toBe('sent')
    expect(deliveryResult(410)).toBe('expired')
    expect(deliveryResult(404)).toBe('expired')
    for (const status of [undefined, 0, 401, 429, 503]) expect(deliveryResult(status)).toBe('failed')
  })
  it('sends only reminder metadata, with an owner guard and expiration', () => {
    expect(JSON.parse(pushPayload('account', '2026-11-23', 123))).toEqual({ kind: 'notes', owner: 'account', date: '2026-11-23', expiresAt: 123 })
  })
})
