import { describe, expect, it } from 'vitest'
import { canChangePending, pendingValidationError, validatePendingDraft, type PendingNote } from '../../app/utils/pendingNotes'
import { defaultSettings } from '../../app/utils/settings'
import { emptySavings } from '../../app/utils/savings'
import type { CloudFinanceData } from '../../app/composables/useCloudFinance'
import type { MoneyNote } from '../../app/utils/notes'

function fixture(): CloudFinanceData {
  const settings = defaultSettings()
  settings.openingBalances.cash = 100000
  return { profile: {} as CloudFinanceData['profile'], settings, notes: [], customCategories: [], budgets: [{ month: '2026-10', category: 'food', limit: 100000 }], savings: emptySavings() }
}
const note: MoneyNote = { id: 'stable-id', createdAt: '2026-10-15T00:00:00Z', type: 'expense', amount: 25000, category: 'food', account: 'cash', date: '2026-10-15', description: 'Makan' }
describe('pending transaction validation', () => {
  it('allows a structurally valid offline draft before checking current budget and balance at sync', () => {
    const data = fixture()
    data.budgets = []
    data.settings.openingBalances.cash = 0
    expect(() => validatePendingDraft(note, data, '2026-10-15')).not.toThrow()
    expect(pendingValidationError(note, data, '2026-10-15')).toContain('Belum ada anggaran')
    data.budgets = fixture().budgets
    expect(pendingValidationError(note, data, '2026-10-15')).toContain('Saldo terbaru tidak cukup')
  })
  it('uses the newest ledger, savings reservations and active wallet rules', () => {
    const data = fixture()
    expect(pendingValidationError(note, data, '2026-10-15')).toBe('')
    data.notes = [{ ...note, id: 'other-device', amount: 90000 }]
    expect(pendingValidationError(note, data, '2026-10-15')).toContain('Saldo terbaru')
    data.notes = []
    data.savings.movements = [{ id: 'move', goalId: 'goal', direction: 'deposit', account: 'cash', amount: 90000, date: note.date, createdAt: note.createdAt, description: '' }]
    expect(pendingValidationError(note, data, '2026-10-15')).toContain('Saldo terbaru')
    data.settings.activeAccounts = ['bank']
    expect(pendingValidationError(note, data, '2026-10-15')).toContain('Dompet sudah dinonaktifkan')
  })
  it('blocks archived categories, changed payment wallets, future dates and invalid money', () => {
    const data = fixture()
    data.budgets[0]!.defaultAccount = 'bank'
    expect(pendingValidationError(note, data, '2026-10-15')).toContain('Dompet anggaran berubah')
    data.customCategories = [{ id: 'custom-a', type: 'expense', label: 'Custom', icon: 'category', archived: true }]
    expect(pendingValidationError({ ...note, category: 'custom-a' }, data, '2026-10-15')).toContain('diarsipkan')
    for (const patch of [{ amount: 0 }, { amount: 1.5 }, { date: '2026-10-16' }]) expect(() => validatePendingDraft({ ...note, ...patch }, data, '2026-10-15')).toThrow()
    expect(pendingValidationError({ ...note, type: 'income', category: 'salary' }, data, '2026-10-15')).toBe('')
  })
  it('protects sent or leased entries from edits and allows correction of unsent rejected drafts', () => {
    const item: PendingNote = { key: 'owner:stable-id', owner: 'owner', note, status: 'blocked', revision: 1, error: 'Saldo tidak cukup' }
    expect(canChangePending(item)).toBe(true)
    expect(canChangePending({ ...item, attemptedFingerprint: 'old-server-state' })).toBe(false)
    expect(canChangePending({ ...item, lease: { token: 'tab', until: Date.now() + 90000 } })).toBe(false)
    expect(canChangePending({ ...item, lease: { token: 'tab', until: Date.now() - 1 } })).toBe(true)
  })
})
