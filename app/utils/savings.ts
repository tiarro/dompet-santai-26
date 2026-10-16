import { getSpendableBalances, localDate, maxNoteAmount, validNoteDate, type MoneyNote, type WalletTransfer } from './notes'

export const savingsIcons = ['savings', 'shield', 'home', 'school', 'flight', 'laptop', 'favorite', 'directions_car'] as const
export interface SavingsGoal {
  id: string; name: string; target: number; icon: string; deadline: string; reminderDay: number
  archived: boolean; deleted: boolean; revision: number; createdAt: string
}
export type GoalDraft = Pick<SavingsGoal, 'name' | 'target' | 'icon' | 'deadline' | 'reminderDay'>
export interface SavingsMovement extends WalletTransfer {
  id: string; goalId: string; description: string; createdAt: string
}
export interface SavingsState { version: 1; goals: SavingsGoal[]; movements: SavingsMovement[] }
export const emptySavings = (): SavingsState => ({ version: 1, goals: [], movements: [] })
export const savingsStorageKey = (owner: string) => 'dompet-santai-savings-v1:' + owner
const money = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maxNoteAmount
export function validGoalDraft(value: GoalDraft): boolean {
  return !!value && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 60
    && money(value.target) && (savingsIcons as readonly string[]).includes(value.icon)
    && (value.deadline === '' || validNoteDate(value.deadline))
    && Number.isInteger(value.reminderDay) && value.reminderDay >= 0 && value.reminderDay <= 31
}
export function goalBalance(state: SavingsState, id: string): number {
  return state.movements.filter(item => item.goalId === id).reduce((total, item) => total + (item.direction === 'deposit' ? item.amount : -item.amount), 0)
}
export function readSavings(raw: string | null): SavingsState {
  if (raw === null) return emptySavings()
  const state = JSON.parse(raw) as SavingsState
  const invalid = () => { throw new Error('Data tabungan belum bisa dibaca. Muat ulang atau periksa penyimpanan browser.') }
  if (!state || state.version !== 1 || !Array.isArray(state.goals) || !Array.isArray(state.movements)) return invalid()
  const ids = new Set<string>()
  for (const goal of state.goals) {
    if (!validGoalDraft(goal) || typeof goal.id !== 'string' || !goal.id || ids.has(goal.id)
      || typeof goal.archived !== 'boolean' || typeof goal.deleted !== 'boolean'
      || !Number.isSafeInteger(goal.revision) || goal.revision < 1 || typeof goal.createdAt !== 'string' || !Number.isFinite(Date.parse(goal.createdAt))) return invalid()
    ids.add(goal.id)
  }
  const running: Record<string, number> = {}
  const movementIds = new Set<string>()
  for (const item of state.movements) {
    if (!item || !ids.has(item.goalId) || typeof item.id !== 'string' || !item.id || movementIds.has(item.id)
      || !['cash', 'bank', 'ewallet'].includes(item.account) || !['deposit', 'withdraw'].includes(item.direction)
      || !money(item.amount) || !validNoteDate(item.date) || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))
      || typeof item.description !== 'string' || item.description.length > 120) return invalid()
    movementIds.add(item.id)
    running[item.goalId] = (running[item.goalId] ?? 0) + (item.direction === 'deposit' ? item.amount : -item.amount)
    if (!Number.isSafeInteger(running[item.goalId]) || running[item.goalId]! < 0) return invalid()
  }
  if (state.goals.some(goal => goal.deleted && (running[goal.id] ?? 0) !== 0)) return invalid()
  return state
}
function currentGoal(state: SavingsState, original: SavingsGoal): SavingsGoal {
  const goal = state.goals.find(item => item.id === original.id && !item.deleted)
  if (!goal || goal.revision !== original.revision) throw new Error('Target sudah berubah. Muat ulang tabungan sebelum mencoba lagi.')
  return goal
}
export function saveGoal(state: SavingsState, draft: GoalDraft, original?: SavingsGoal, id = crypto.randomUUID(), today = localDate()): SavingsState {
  if (!validGoalDraft(draft)) throw new Error('Isi nama, target rupiah bulat, ikon, tenggat, dan pengingat yang valid.')
  const old = original ? currentGoal(state, original) : undefined
  if (draft.deadline && draft.deadline < today && draft.deadline !== old?.deadline) throw new Error('Tenggat baru tidak boleh sebelum hari ini.')
  if (old?.archived) throw new Error('Aktifkan kembali target sebelum mengubahnya.')
  const goal: SavingsGoal = { ...draft, name: draft.name.trim(), id: old?.id ?? id, createdAt: old?.createdAt ?? new Date().toISOString(),
    revision: (old?.revision ?? 0) + 1, archived: false, deleted: false }
  if (!old && state.goals.some(item => item.id === id)) throw new Error('Target sudah ada.')
  return { ...state, goals: old ? state.goals.map(item => item.id === old.id ? goal : item) : [...state.goals, goal] }
}
export function moveSavings(state: SavingsState, notes: MoneyNote[], original: SavingsGoal, draft: Pick<SavingsMovement, 'direction' | 'amount' | 'account' | 'description'>, id = crypto.randomUUID(), today = localDate(), openings?: Record<string, number>): SavingsState {
  const goal = currentGoal(state, original)
  if (goal.archived) throw new Error('Aktifkan kembali target sebelum memindahkan dana.')
  if (!money(draft.amount) || !['cash', 'bank', 'ewallet'].includes(draft.account)
    || !['deposit', 'withdraw'].includes(draft.direction) || typeof draft.description !== 'string' || draft.description.length > 120) throw new Error('Periksa nominal, dompet, dan keterangan.')
  if (state.movements.some(item => item.id === id)) throw new Error('Transfer sudah tercatat.')
  if (draft.direction === 'withdraw' && draft.amount > goalBalance(state, goal.id)) throw new Error('Dana target tidak cukup untuk penarikan ini.')
  if (draft.direction === 'deposit' && draft.amount > (getSpendableBalances(notes, today, state.movements, openings)[draft.account] ?? 0)) throw new Error('Saldo dompet sumber tidak cukup.')
  const movement: SavingsMovement = { ...draft, description: draft.description.trim(), id, goalId: goal.id, date: today, createdAt: new Date().toISOString() }
  const next = { ...state, goals: state.goals.map(item => item.id === goal.id ? { ...item, revision: item.revision + 1 } : item), movements: [...state.movements, movement] }
  if (Object.values(getSpendableBalances(notes, today, next.movements, openings)).some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Perpindahan dana membuat saldo dompet tidak cukup.')
  return next
}
export function changeGoalStatus(state: SavingsState, original: SavingsGoal, action: 'archive' | 'restore' | 'delete'): SavingsState {
  const goal = currentGoal(state, original)
  const balance = goalBalance(state, goal.id)
  if (action === 'delete' && balance !== 0) throw new Error('Tarik seluruh dana ke dompet terlebih dahulu sebelum menghapus target.')
  if (action === 'archive' && balance < goal.target) throw new Error('Target harus tercapai sebelum diarsipkan.')
  return { ...state, goals: state.goals.map(item => item.id === goal.id ? { ...item, revision: item.revision + 1,
    archived: action === 'archive', deleted: action === 'delete' } : item) }
}
export function summarizeSavings(state: SavingsState, today: string) {
  const goals = state.goals.filter(goal => !goal.deleted).map(goal => {
    const balance = goalBalance(state, goal.id)
    const remaining = Math.max(0, goal.target - balance)
    const months = goal.deadline ? Math.max(1, (Number(goal.deadline.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(goal.deadline.slice(5, 7)) - Number(today.slice(5, 7)) + 1) : 0
    const lastDay = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()
    const depositedThisMonth = state.movements.some(item => item.goalId === goal.id && item.direction === 'deposit' && item.date.slice(0, 7) === today.slice(0, 7))
    return { ...goal, balance, remaining, progress: Math.min(100, Math.floor(balance / goal.target * 100)), complete: remaining === 0,
      monthly: months ? Math.ceil(remaining / months) : null,
      overdue: !!goal.deadline && goal.deadline < today && remaining > 0,
      reminderDue: !goal.archived && remaining > 0 && goal.reminderDay > 0 && Number(today.slice(8)) >= Math.min(goal.reminderDay, lastDay) && !depositedThisMonth }
  })
  return { goals, total: goals.reduce((sum, goal) => sum + goal.balance, 0),
    active: goals.filter(goal => !goal.archived && !goal.complete).length, completed: goals.filter(goal => goal.complete).length }
}
