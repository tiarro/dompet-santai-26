import { defaultCategories, type CategoryCatalog } from '~/utils/categories'
import { changeGoalStatus, moveSavings, saveGoal, type GoalDraft, type SavingsGoal, type SavingsMovement } from '~/utils/savings'
import { getSpendableBalances } from '~/utils/notes'
import { localDate } from '~/utils/notes'
import { useCloudFinance } from './useCloudFinance'

export function useSavings(getCategories: () => CategoryCatalog = () => defaultCategories) {
  const cloud = useCloudFinance()
  const data = computed(() => cloud.data.value.savings)
  const ready = cloud.ready
  const error = cloud.error
  const balances = computed(() => getSpendableBalances(
    cloud.data.value.notes,
    localDate(),
    data.value.movements,
    cloud.data.value.settings.openingBalances,
  ))

  async function save(draft: GoalDraft, original?: SavingsGoal) {
    if (!ready.value) throw new Error(error.value || 'Silakan masuk kembali.')
    const next = saveGoal(data.value, draft, original)
    await cloud.save({ ...cloud.data.value, savings: next })
    return next.goals.find(goal => goal.id === (original?.id ?? next.goals.at(-1)?.id))!
  }

  async function transfer(goal: SavingsGoal, draft: Pick<SavingsMovement, 'direction' | 'amount' | 'account' | 'description'>) {
    if (!ready.value) throw new Error(error.value || 'Silakan masuk kembali.')
    const settings = cloud.data.value.settings
    if (!settings.activeAccounts.includes(draft.account)) throw new Error('Dompet sudah dinonaktifkan. Pilih dompet aktif.')
    const next = moveSavings(data.value, cloud.data.value.notes, goal, draft, undefined, localDate(), settings.openingBalances)
    await cloud.save({ ...cloud.data.value, savings: next })
  }

  async function status(goal: SavingsGoal, action: 'archive' | 'restore' | 'delete') {
    if (!ready.value) throw new Error(error.value || 'Silakan masuk kembali.')
    const next = changeGoalStatus(data.value, goal, action)
    await cloud.save({ ...cloud.data.value, savings: next })
  }

  return { data, ready, error, balances, save, transfer, status }
}

