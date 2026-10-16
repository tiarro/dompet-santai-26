import { emptyDocuments, parseBackup, validateDocuments, type FinanceBackup } from '~/utils/backup'
import { readCategories, categoryCatalog } from '~/utils/categories'
import { readBudgets } from '~/utils/budgets'
import { readNotes } from '~/utils/notes'
import { readSavings } from '~/utils/savings'
import { readSettings, validateSettings, type AppSettings } from '~/utils/settings'
import { useCloudFinance, type CloudFinanceData } from './useCloudFinance'

function documentsOf(data: CloudFinanceData): { notes: string | null; budgets: string | null; categories: string | null; savings: string | null; settings: string | null } {
  return {
    notes: data.notes.length ? JSON.stringify(data.notes) : null,
    budgets: data.budgets.length ? JSON.stringify(data.budgets) : null,
    categories: data.customCategories.length ? JSON.stringify(data.customCategories) : null,
    savings: data.savings.goals.length || data.savings.movements.length ? JSON.stringify(data.savings) : null,
    settings: JSON.stringify(data.settings),
  }
}

function dataOf(data: CloudFinanceData, documents: ReturnType<typeof documentsOf>): CloudFinanceData {
  const customCategories = readCategories(documents.categories)
  const catalog = categoryCatalog(customCategories)
  const settings = readSettings(documents.settings)
  const notes = readNotes(documents.notes, catalog)
  const budgets = readBudgets(documents.budgets, catalog)
  const savings = readSavings(documents.savings)
  validateSettings(settings, notes, budgets, savings)
  return { ...data, customCategories, notes, budgets, savings, settings }
}

export function useSettings() {
  const cloud = useCloudFinance()
  const data = computed(() => cloud.data.value.settings)
  const ready = cloud.ready
  const error = cloud.error

  async function save(patch: Partial<Pick<AppSettings, 'openingBalances' | 'activeAccounts' | 'theme' | 'reminders'>>, revision: number) {
    if (!ready.value) throw new Error(error.value || 'Silakan masuk kembali.')
    if (data.value.revision !== revision) throw new Error('Pengaturan berubah di perangkat lain. Muat ulang isian sebelum menyimpan.')
    const next = readSettings(JSON.stringify({ ...data.value, ...patch, revision: revision + 1 }))
    const documents = documentsOf({ ...cloud.data.value, settings: next })
    validateDocuments(documents)
    await cloud.save({ ...cloud.data.value, settings: next })
  }

  async function backup(): Promise<FinanceBackup> {
    if (!ready.value) throw new Error(error.value || 'Silakan masuk kembali.')
    const id = useSupabaseUser().value?.sub
    if (!id) throw new Error('Silakan masuk kembali.')
    const documents = documentsOf(cloud.data.value)
    validateDocuments(documents)
    return { app: 'dompet-santai', version: 1, owner: id, exportedAt: new Date().toISOString(), documents }
  }

  async function prepareRestore(raw: string) {
    const id = useSupabaseUser().value?.sub
    if (!id) throw new Error('Silakan masuk kembali.')
    const backupData = parseBackup(raw, id)
    return { backup: backupData, fingerprint: JSON.stringify(documentsOf(cloud.data.value)) }
  }

  function resetFingerprint() {
    return JSON.stringify(documentsOf(cloud.data.value))
  }

  async function replace(backupData: FinanceBackup | null, expectedFingerprint: string) {
    if (!ready.value) throw new Error(error.value || 'Silakan masuk kembali.')
    if (JSON.stringify(documentsOf(cloud.data.value)) !== expectedFingerprint) {
      throw new Error('Data berubah sejak konfirmasi dibuka. Buka konfirmasi lagi agar perubahan terbaru tidak tertimpa.')
    }
    const source = backupData ? parseBackup(JSON.stringify(backupData), backupData.owner) : { documents: emptyDocuments() }
    const documents = source.documents
    const next = dataOf(cloud.data.value, documents)
    const settings = { ...next.settings, revision: Math.max(data.value.revision, next.settings.revision) + 1 }
    await cloud.save({ ...next, settings })
  }

  return {
    data, ready, error, refresh: cloud.refresh, cloudEmpty: cloud.cloudEmpty,
    save, backup, prepareRestore, resetFingerprint, replace,
    migrateLocal: cloud.migrateLocal,
    localMigrationPreview: cloud.localMigrationPreview,
    migrationOnline: cloud.online,
  }
}




