import { storedSettings, type AppSettings } from '~/utils/settings'
import { defaultCategories, type CategoryCatalog } from '~/utils/categories'
import { budgetAccountError, readBudgets, setBudget, type BudgetMode, type MonthlyBudget } from '~/utils/budgets'
import { getSpendableBalances, localDate, readNotes } from '~/utils/notes'
import { readSavings, type SavingsState } from '~/utils/savings'
import { useCloudFinance } from './useCloudFinance'

export function useBudgets(getCategories: () => CategoryCatalog = () => defaultCategories) {
  const cloud = useCloudFinance()
  const budgets = computed(() => cloud.data.value.budgets)
  const ready = cloud.ready
  const storageError = cloud.error

  async function save(draft: MonthlyBudget, mode: BudgetMode) {
    const owner = useSupabaseUser().value?.sub
    if (!owner || !ready.value) throw new Error(storageError.value || 'Silakan masuk kembali.')
    const current = budgets.value
    const settings = cloud.data.value.settings
    if (draft.defaultAccount && !settings.activeAccounts.includes(draft.defaultAccount)) {
      throw new Error('Pilih dompet aktif untuk anggaran.')
    }
    if (mode === 'create' && getCategories().expense.find(item => item.id === draft.category)?.archived) {
      throw new Error('Pilih kategori aktif untuk anggaran.')
    }
    const next = setBudget(current, draft, mode, getCategories())
    if (draft.defaultAccount) {
      const balances = getSpendableBalances(cloud.data.value.notes, localDate(), cloud.data.value.savings.movements, settings.openingBalances)
      const error = budgetAccountError(draft, balances)
      if (error) throw new Error(error)
    }
    await cloud.save({ ...cloud.data.value, budgets: next })
  }

  return { budgets, ready, storageError, save }
}

