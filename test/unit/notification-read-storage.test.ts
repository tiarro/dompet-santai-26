import { describe, expect, it } from 'vitest'
import { mergeReadRecords, validReadKey, type NotificationReadRecord } from '../../app/utils/notificationReadStorage'

describe('notification read records', () => {
  const first = { readKey: '["bill","internet","2026-11-23","today"]', readAt: '2026-11-23T08:00:00Z' }
  const second = { readKey: '["bill","internet","2026-11-23","late"]', readAt: '2026-11-24T08:00:00Z' }
  it('merges additions without replacing concurrent or pending marks', () => {
    const records = mergeReadRecords([], [first], 'a', true)
    const next = mergeReadRecords(records, [second], 'a', true)
    expect(next).toHaveLength(2)
    expect(next.every(record => record.pending)).toBe(true)
  })
  it('does not requeue confirmed legacy imports or change their first timestamp', () => {
    const records: NotificationReadRecord[] = [{ ...first, owner: 'a', pending: false }]
    expect(mergeReadRecords(records, [{ ...first, readAt: second.readAt }], 'a', true)).toEqual(records)
  })
  it('acknowledges an existing stage from the server without clearing newer local stages', () => {
    const local = mergeReadRecords([], [first, second], 'a', true)
    const next = mergeReadRecords(local, [first], 'a', false)
    expect(next.find(record => record.readKey === first.readKey)?.pending).toBe(false)
    expect(next.find(record => record.readKey === second.readKey)?.pending).toBe(true)
  })
  it('rejects malformed timestamps and keys exceeding the database byte limit', () => {
    expect(mergeReadRecords([], [{ readKey: '', readAt: first.readAt }, { readKey: 'x', readAt: 'invalid' }], 'a', true)).toEqual([])
    expect(validReadKey('é'.repeat(256))).toBe(true)
    expect(validReadKey('é'.repeat(257))).toBe(false)
  })
})
