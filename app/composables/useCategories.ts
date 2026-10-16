import { addCategory, categoryCatalog, type CategoryCatalog, type CategoryDraft, type CustomCategory } from '~/utils/categories'
import { useCloudFinance } from './useCloudFinance'

export function useCategories() {
  const cloud = useCloudFinance()
  const custom = computed(() => cloud.data.value.customCategories)
  const catalog = computed(() => categoryCatalog(custom.value))
  const ready = cloud.ready
  const storageError = cloud.error

  async function save(draft: CategoryDraft) {
    const rows = addCategory(custom.value, draft, 'custom-' + crypto.randomUUID())
    await cloud.save({ ...cloud.data.value, customCategories: rows })
    return rows[rows.length - 1]!
  }

  async function update(original: CustomCategory, draft: Pick<CustomCategory, 'label' | 'icon' | 'archived'>) {
    const current = custom.value
    const old = current.find(item => item.id === original.id)
    if (!old || JSON.stringify(old) !== JSON.stringify(original)) {
      throw new Error('Kategori sudah berubah. Buka ulang pengaturan kategori.')
    }
    const validated = addCategory(current.filter(item => item.id !== old.id), { ...draft, type: old.type }, old.id).at(-1)!
    const result = { ...validated, ...(draft.archived ? { archived: true } : {}) }
    const rows = current.map(item => item.id === old.id ? result : item)
    await cloud.save({ ...cloud.data.value, customCategories: rows })
    return result
  }

  return {
    custom, catalog, ready, storageError,
    save, update,
    readLatest: () => catalog.value,
  }
}


