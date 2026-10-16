import { defaultCategories, categoryCatalog, type CustomCategory } from '~/utils/categories'
import { defaultSettings, type AppSettings } from '~/utils/settings'
import { noteAccounts, type MoneyNote } from '~/utils/notes'
import { emptySavings, type SavingsState } from '~/utils/savings'
import { readFinancialDocuments } from '~/utils/financialStorage'
import { readNotes } from '~/utils/notes'
import { readBudgets, type MonthlyBudget } from '~/utils/budgets'
import { readCategories } from '~/utils/categories'
import { readSavings } from '~/utils/savings'
import type { Database, Json } from '#shared/types/database'
import { validateDocuments } from '~/utils/backup'
import { snapshotIsEmpty, snapshotFingerprint } from '~/utils/cloudSnapshot'

export interface CloudProfile {
  username: string
  bio: string
  gender: string
  onboardingGoal: string
  payday: string
  onboardingBalance: number
  onboardingAccounts: string[]
  onboardingCompleted: boolean
}

export interface CloudFinanceData {
  profile: CloudProfile
  settings: AppSettings
  customCategories: CustomCategory[]
  notes: MoneyNote[]
  budgets: MonthlyBudget[]
  savings: SavingsState
}

interface CloudState {
  owner: string
  ready: boolean
  loading: boolean
  error: string
  data: CloudFinanceData
  fingerprint: string
  snapshotEmpty: boolean
}

const defaultProfile = (): CloudProfile => ({
  username: '', bio: '', gender: '', onboardingGoal: '', payday: '25',
  onboardingBalance: 0, onboardingAccounts: [], onboardingCompleted: false,
})

const emptyCloudData = (): CloudFinanceData => ({
  profile: defaultProfile(),
  settings: defaultSettings(),
  customCategories: [],
  notes: [],
  budgets: [],
  savings: emptySavings(),
})

type SnapshotWire = {
  _meta?: { fingerprint?: string }
  profile?: Record<string, any> | null
  settings?: Record<string, any> | null
  wallets?: Record<string, any>[]
  categories?: Record<string, any>[]
  transactions?: Record<string, any>[]
  budgets?: Record<string, any>[]
  goals?: Record<string, any>[]
  movements?: Record<string, any>[]
}

function dataUrlToBlob(dataUrl: string) {
  const [header, encoded] = dataUrl.split(',', 2)
  if (!header || !encoded) throw new Error('Foto struk tidak valid.')
  const mime = header.match(/^data:([^;]+);base64$/)?.[1]
  if (mime !== 'image/jpeg') throw new Error('Foto struk harus berupa JPEG.')
  const binary = atob(encoded)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Foto tidak bisa dibaca.'))
    reader.onerror = () => reject(reader.error ?? new Error('Foto tidak bisa dibaca.'))
    reader.readAsDataURL(blob)
  })
}

function fingerprint(value: unknown) {
  let hash = 2166136261
  for (const byte of new TextEncoder().encode(JSON.stringify(value))) hash = Math.imul(hash ^ byte, 16777619)
  return 'fnv1a-' + (hash >>> 0).toString(16).padStart(8, '0')
}

function accountDefaults(data: SnapshotWire) {
  const balances = Object.fromEntries(noteAccounts.map(account => [account.id, 0]))
  const active = new Set<string>()
  for (const wallet of data.wallets ?? []) {
    if (typeof wallet.code === 'string' && Object.hasOwn(balances, wallet.code)) {
      balances[wallet.code] = Number(wallet.opening_balance) || 0
      if (wallet.active) active.add(wallet.code)
    }
  }
  return { balances, activeAccounts: active.size ? [...active] : ['cash', 'bank', 'ewallet'] }
}

export function useCloudFinance() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const state = useState<CloudState>('dompet-santai-cloud-finance', () => ({
    owner: '', ready: false, loading: false, error: '', fingerprint: '', snapshotEmpty: true, data: emptyCloudData(),
  }))
  const online = useState('dompet-santai-online', () => true)
  // Supabase's claims state normally exposes `sub`, while mocked or older
  // session payloads can expose the same identifier as `id`. Accept both so
  // the cloud ledger does not remain stuck in its loading state when the
  // session has already been established.
  const owner = computed(() => user.value?.sub ?? (user.value as { id?: string } | null)?.id ?? '')
  const saving = useState('dompet-santai-cloud-saving', () => false)
  const requestVersion = useState('dompet-santai-cloud-request', () => 0)

  async function receiptFromStorage(path: string, name: string) {
    const metadata = { name, dataUrl: '', path }
    try {
      const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600)
      if (error || !data?.signedUrl) return metadata
      const response = await fetch(data.signedUrl, { cache: 'no-store' })
      if (!response.ok) return metadata
      return { ...metadata, dataUrl: await blobToDataUrl(await response.blob()) }
    } catch {
      return metadata
    }
  }

  async function mapSnapshot(raw: unknown): Promise<CloudFinanceData> {
    const wire = (raw ?? {}) as SnapshotWire
    const profile = wire.profile ?? {}
    const accounts = accountDefaults(wire)
    const settings = defaultSettings()
    settings.openingBalances = accounts.balances
    settings.activeAccounts = accounts.activeAccounts
    if (wire.settings) {
      settings.theme = ['light', 'dark', 'system'].includes(wire.settings.theme) ? wire.settings.theme : settings.theme
      settings.reminders = {
        notes: !!wire.settings.notes_reminders,
        time: typeof wire.settings.reminder_time === 'string' ? wire.settings.reminder_time.slice(0, 5) : '20:00',
        savings: wire.settings.savings_reminders !== false,
      }
      settings.revision = Number(wire.settings.revision) || 0
    }

    const categories = (wire.categories ?? []).filter(item => !item.is_system).map(item => ({
      id: String(item.code),
      type: item.type as 'income' | 'expense',
      label: String(item.label),
      icon: String(item.icon),
      ...(item.archived ? { archived: true } : {}),
    }))

    const notes = await Promise.all((wire.transactions ?? []).map(async item => {
      const receipt = item.receipt_path && item.receipt_name
        ? await receiptFromStorage(String(item.receipt_path), String(item.receipt_name))
        : undefined
      return {
        id: String(item.id), type: item.type as 'income' | 'expense', amount: Number(item.amount),
        category: String(item.category_code), account: String(item.account_code),
        date: String(item.occurred_on), description: String(item.description ?? ''),
        createdAt: String(item.created_at ?? new Date().toISOString()),
        ...(receipt ? { receipt } : {}),
      } satisfies MoneyNote
    }))

    const budgets = (wire.budgets ?? []).map(item => ({
      month: String(item.month_start).slice(0, 7),
      category: String(item.category_code),
      limit: Number(item.limit_amount),
      ...(item.default_account ? { defaultAccount: String(item.default_account) } : {}),
    }))
    const goals = (wire.goals ?? []).map(item => ({
      id: String(item.id), name: String(item.name), target: Number(item.target), icon: String(item.icon),
      deadline: item.deadline ? String(item.deadline) : '', reminderDay: Number(item.reminder_day) || 0,
      archived: !!item.archived, deleted: !!item.deleted, revision: Number(item.revision) || 1,
      createdAt: String(item.created_at ?? new Date().toISOString()),
    }))
    const movements = (wire.movements ?? []).map(item => ({
      id: String(item.id), goalId: String(item.goal_id), direction: item.direction as 'deposit' | 'withdraw',
      amount: Number(item.amount), account: String(item.account_code), date: String(item.movement_date),
      description: String(item.description ?? ''), createdAt: String(item.created_at ?? new Date().toISOString()),
    }))

    return {
      profile: {
        username: String(profile.username ?? user.value?.user_metadata?.username ?? ''),
        bio: String(profile.bio ?? user.value?.user_metadata?.bio ?? ''),
        gender: String(profile.gender ?? user.value?.user_metadata?.gender ?? ''),
        onboardingGoal: String(profile.onboarding_goal ?? ''),
        payday: String(profile.payday ?? '25'),
        onboardingBalance: Number(profile.onboarding_balance) || 0,
        onboardingAccounts: Array.isArray(profile.onboarding_accounts) ? profile.onboarding_accounts.map(String) : [],
        onboardingCompleted: !!profile.onboarding_completed_at,
      },
      settings,
      customCategories: categories,
      notes,
      budgets,
      savings: { version: 1, goals, movements },
    }
  }

  function defaultCategoriesForPayload(custom: CustomCategory[]) {
    return (['expense', 'income'] as const).flatMap(type => [
      ...defaultCategories[type].map(category => ({ type, code: category.id, label: category.label, icon: category.icon, archived: false, is_system: true })),
      ...custom.filter(category => category.type === type).map(category => ({ type, code: category.id, label: category.label, icon: category.icon, archived: !!category.archived, is_system: false })),
    ])
  }

  async function payloadFor(data: CloudFinanceData, id: string) {
    const uploaded: string[] = []
    const transactions = []
    for (const note of data.notes) {
      let receiptPath = note.receipt?.path
      if (note.receipt && !receiptPath) {
        receiptPath = id + '/' + note.id + '/' + crypto.randomUUID() + '.jpg'
        const { error } = await supabase.storage.from('receipts').upload(receiptPath, dataUrlToBlob(note.receipt.dataUrl), {
          contentType: 'image/jpeg', upsert: false, cacheControl: '0',
        })
        if (error) {
          for (const path of uploaded) await supabase.storage.from('receipts').remove([path])
          throw new Error('Foto struk belum tersimpan. Coba lagi saat koneksi tersedia.')
        }
        uploaded.push(receiptPath)
      }
      transactions.push({
        id: note.id, type: note.type, amount: note.amount, category_type: note.type,
        category_code: note.category, account_code: note.account, occurred_on: note.date,
        description: note.description, receipt_name: note.receipt?.name ?? null, receipt_path: receiptPath ?? null,
        revision: 1, created_at: note.createdAt,
      })
    }
    return {
      payload: {
        profile: {
          username: data.profile.username, bio: data.profile.bio, gender: data.profile.gender,
          onboarding_goal: data.profile.onboardingGoal, payday: data.profile.payday,
          onboarding_balance: data.profile.onboardingBalance, onboarding_accounts: data.profile.onboardingAccounts,
          onboarding_completed: data.profile.onboardingCompleted,
        },
        settings: {
          theme: data.settings.theme, notes_reminders: data.settings.reminders.notes,
          reminder_time: data.settings.reminders.time + ':00', savings_reminders: data.settings.reminders.savings,
          revision: data.settings.revision,
        },
        wallets: noteAccounts.map(account => ({
          code: account.id, opening_balance: data.settings.openingBalances[account.id] ?? 0,
          active: data.settings.activeAccounts.includes(account.id),
        })),
        categories: defaultCategoriesForPayload(data.customCategories),
        transactions,
        budgets: data.budgets.map(budget => ({
          month_start: budget.month + '-01', category_code: budget.category, limit_amount: budget.limit,
          default_account: budget.defaultAccount ?? null,
        })),
        goals: data.savings.goals.map(goal => ({
          id: goal.id, name: goal.name, target: goal.target, icon: goal.icon,
          deadline: goal.deadline || null, reminder_day: goal.reminderDay, archived: goal.archived,
          deleted: goal.deleted, revision: goal.revision, created_at: goal.createdAt,
        })),
        movements: data.savings.movements.map(movement => ({
          id: movement.id, goal_id: movement.goalId, direction: movement.direction, amount: movement.amount,
          account_code: movement.account, movement_date: movement.date, description: movement.description,
          created_at: movement.createdAt,
        })),
      },
      uploaded,
    }
  }

  async function save(next: CloudFinanceData, migration?: { source_fingerprint: string; counts: Record<string, number> }, guard?: { owner: string; fingerprint: string }) {
    const id = owner.value
    if (guard && (guard.owner !== id || guard.fingerprint !== state.value.fingerprint)) throw Object.assign(new Error('Data atau akun berubah. Coba sinkronkan kembali.'), { code: '40001' })
    if (!id) throw new Error('Silakan masuk kembali.')
    if (!online.value) throw new Error('Tidak ada koneksi internet. Data belum tersimpan.')
    if (!state.value.ready || state.value.owner !== id || state.value.error) throw new Error(state.value.error || 'Muat ulang data sebelum menyimpan.')
    if (saving.value) throw new Error('Penyimpanan lain masih berjalan. Coba lagi setelah selesai.')
    const expected = state.value.fingerprint
    const version = ++requestVersion.value
    saving.value = true
    state.value.loading = false
    try {
      // Freeze the proposal before asynchronous uploads or refreshes can change it.
      const prepared = await payloadFor(JSON.parse(JSON.stringify(next)), id)
      if (owner.value !== id) throw new Error('Akun berubah. Silakan masuk kembali.')
      const payload = { ...prepared.payload, _meta: { expected_fingerprint: expected, require_empty: !!migration, migration: migration ?? null } }
      const { data: result, error } = await supabase.rpc('replace_finance_snapshot', { payload: payload as Json })
      if (error) {
        // Only explicit database rejection proves the uploaded files are unreferenced.
        // A lost network response may have committed, so retain those objects.
        if (error.code === '40001' || error.code === '23505') {
          if (prepared.uploaded.length) await supabase.storage.from('receipts').remove(prepared.uploaded)
        }
        const message = error.code === '40001'
          ? 'Data cloud berubah di perangkat lain. Muat ulang data sebelum mencoba lagi.'
          : error.code === '23505' && migration
            ? 'Data cloud sudah berisi data. Migrasi dibatalkan agar data cloud tidak tertimpa.'
            : error.message || 'Data belum tersimpan ke Supabase. Muat ulang sebelum mencoba lagi.'
        if (owner.value === id) state.value.error = message
        throw Object.assign(new Error(message), { code: error.code })
      }
      const mapped = await mapSnapshot(result)
      if (owner.value === id && version === requestVersion.value) {
        state.value = { owner: id, ready: true, loading: false, error: '', fingerprint: snapshotFingerprint(result), snapshotEmpty: snapshotIsEmpty(result), data: mapped }
      }
      // Retain previously committed receipt objects: another tab or a backup may
      // still reference them. Cleanup belongs in a server-side retention job.
    } finally {
      saving.value = false
    }
  }

  function clear() {
    ++requestVersion.value
    state.value = { owner: '', ready: false, loading: false, error: '', fingerprint: '', snapshotEmpty: true, data: emptyCloudData() }
  }

  async function refresh() {
    const id = owner.value
    if (state.value.owner !== id) clear()
    if (!id || saving.value) return
    const version = ++requestVersion.value
    if (!online.value) {
      state.value.error = 'Tidak ada koneksi internet. Hubungkan internet untuk memuat data.'
      return
    }
    state.value = { ...state.value, owner: id, loading: true }
    try {
      const { data: result, error } = await supabase.rpc('get_finance_snapshot')
      if (error) throw new Error(error.message || 'Data Supabase belum bisa dimuat.')
      const mapped = await mapSnapshot(result)
      if (owner.value !== id || version !== requestVersion.value) return
      // Reading an empty cloud never seeds it; local migration must remain possible.
      state.value = { owner: id, ready: true, loading: false, error: '', fingerprint: snapshotFingerprint(result), snapshotEmpty: snapshotIsEmpty(result), data: mapped }
    } catch (reason) {
      if (owner.value === id && version === requestVersion.value) {
        state.value = { ...state.value, loading: false, error: reason instanceof Error ? reason.message : 'Data Supabase belum bisa dimuat.' }
      }
    }
  }

  function localMigrationPreview() {
    const id = owner.value
    if (!id) throw new Error('Silakan masuk kembali.')
    const documents = readFinancialDocuments(id)
    const customCategories = readCategories(documents.categories)
    const catalog = categoryCatalog(customCategories)
    const notes = readNotes(documents.notes, catalog)
    const budgets = readBudgets(documents.budgets, catalog)
    const savings = readSavings(documents.savings)
    return {
      notes: notes.length,
      receipts: notes.filter(note => !!note.receipt).length,
      budgets: budgets.length,
      categories: customCategories.length,
      goals: savings.goals.length,
      movements: savings.movements.length,
    }
  }
  async function migrateLocal() {
    const id = owner.value
    if (!id) throw new Error('Silakan masuk kembali.')
    if (!online.value) throw new Error('Hubungkan internet sebelum memulai migrasi.')
    await refresh()
    if (state.value.error) throw new Error(state.value.error)
    if (!state.value.snapshotEmpty) throw new Error('Data cloud sudah berisi data. Migrasi browser dibatalkan agar data cloud tidak tertimpa.')
    const documents = readFinancialDocuments(id)
    const parsed = validateDocuments(documents)
    const migrated: CloudFinanceData = { ...state.value.data, customCategories: parsed.categories, notes: parsed.notes, budgets: parsed.budgets, savings: parsed.savings, settings: parsed.settings }
    const counts = { notes: parsed.notes.length, receipts: parsed.notes.filter(note => !!note.receipt).length, budgets: parsed.budgets.length, categories: parsed.categories.length, goals: parsed.savings.goals.length, movements: parsed.savings.movements.length }
    // The server records completion atomically with the empty-cloud check and write.
    await save(migrated, { source_fingerprint: await fingerprint(documents), counts })
    return counts
  }

  async function saveOnboarding(input: { username: string; goal: string; payday: string; balance: number; accounts: string[] }) {
    const spendableAccounts = input.accounts.filter(account => account !== 'savings')
    const balanceAccount = spendableAccounts[0] ?? 'cash'
    const openingBalances = Object.fromEntries(noteAccounts.map(account => [account.id, 0]))
    openingBalances[balanceAccount] = input.balance
    const activeAccounts = spendableAccounts.length ? spendableAccounts : ['cash']
    const next = {
      ...state.value.data,
      profile: { ...state.value.data.profile, username: input.username, onboardingGoal: input.goal, payday: input.payday, onboardingBalance: input.balance, onboardingAccounts: input.accounts, onboardingCompleted: true },
      settings: { ...state.value.data.settings, openingBalances, activeAccounts },
    }
    await save(next)
  }

  return {
    data: computed(() => state.value.data),
    ready: computed(() => state.value.ready && state.value.owner === owner.value),
    loading: computed(() => state.value.loading),
    error: computed(() => state.value.error),
    online,
    saving,
    fingerprint: computed(() => state.value.fingerprint),
    clear,
    cloudEmpty: computed(() => state.value.snapshotEmpty),
    refresh,
    save,
    migrateLocal,
    localMigrationPreview,
    saveOnboarding,
  }
}
