export const defaultCategories = {
  expense: [
    { id: 'food', label: 'Makan & Minum', icon: 'restaurant' },
    { id: 'transport', label: 'Transportasi', icon: 'directions_car' },
    { id: 'shopping', label: 'Belanja', icon: 'shopping_bag' },
    { id: 'bills', label: 'Tagihan', icon: 'receipt_long' },
    { id: 'entertainment', label: 'Hiburan', icon: 'movie' },
    { id: 'other', label: 'Lainnya', icon: 'more_horiz' },
  ],
  income: [
    { id: 'salary', label: 'Gaji', icon: 'work' },
    { id: 'bonus', label: 'Bonus', icon: 'redeem' },
    { id: 'business', label: 'Usaha', icon: 'storefront' },
    { id: 'other', label: 'Lainnya', icon: 'more_horiz' },
  ],
}

export type CategoryType = 'expense' | 'income'
export interface NoteCategory { id: string; label: string; icon: string }
export type CategoryCatalog = Record<CategoryType, NoteCategory[]>
export interface CustomCategory extends NoteCategory { type: CategoryType }
export type CategoryDraft = Omit<CustomCategory, 'id'>
export type SaveCategory = (draft: CategoryDraft) => CustomCategory

export const categoryIcons = [
  { id: 'category', label: 'Umum' },
  { id: 'school', label: 'Pendidikan' },
  { id: 'health_and_safety', label: 'Kesehatan' },
  { id: 'pets', label: 'Hewan' },
  { id: 'home', label: 'Rumah' },
  { id: 'fitness_center', label: 'Olahraga' },
  { id: 'volunteer_activism', label: 'Donasi' },
  { id: 'work', label: 'Pekerjaan' },
  { id: 'flight', label: 'Perjalanan' },
  { id: 'redeem', label: 'Hadiah' },
]
export function normalizeCategoryName(label: string) {
  return label.normalize('NFKC').trim().replace(/\s+/g, ' ')
}
export function categoryCatalog(custom: CustomCategory[] = []): CategoryCatalog {
  return {
    expense: [...defaultCategories.expense, ...custom.filter(item => item.type === 'expense')],
    income: [...defaultCategories.income, ...custom.filter(item => item.type === 'income')],
  }
}
function validateDraft(draft: CategoryDraft, current: CustomCategory[]) {
  if (!draft || (draft.type !== 'expense' && draft.type !== 'income') || typeof draft.label !== 'string') throw new Error('Periksa jenis dan nama kategori.')
  const label = normalizeCategoryName(draft.label)
  if (!label || label.length > 32 || /[\u0000-\u001f\u007f]/.test(label)) throw new Error('Isi nama kategori 1 sampai 32 karakter.')
  if (!categoryIcons.some(icon => icon.id === draft.icon)) throw new Error('Pilih ikon kategori yang tersedia.')
  if (categoryCatalog(current)[draft.type].some(item => normalizeCategoryName(item.label).toLocaleLowerCase('id-ID') === label.toLocaleLowerCase('id-ID'))) {
    throw new Error('Nama kategori sudah digunakan untuk jenis catatan ini.')
  }
  return label
}
export function addCategory(current: CustomCategory[], draft: CategoryDraft, id: string): CustomCategory[] {
  const label = validateDraft(draft, current)
  if (!/^custom-[0-9a-f-]{36}$/.test(id) || current.some(item => item.id === id)) throw new Error('ID kategori tidak valid.')
  return [...current, { id, type: draft.type, label, icon: draft.icon }]
}
export function readCategories(raw: string | null): CustomCategory[] {
  if (raw === null) return []
  const rows: unknown = JSON.parse(raw)
  if (!Array.isArray(rows)) throw new Error('Invalid saved categories')
  let result: CustomCategory[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('Invalid saved category')
    result = addCategory(result, row as CustomCategory, (row as CustomCategory).id)
  }
  return result
}
