import type { Database } from '#shared/types/database'
import { validateBill, type Bill, type BillDraft } from '~/utils/bills'

export function useBills() {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const owner = computed(() => user.value?.sub ?? '')
  const items = ref<Bill[]>([])
  const loading = ref(false)
  const busy = ref(false)
  const error = ref('')
  let generation = 0
  const message = (reason: unknown) => {
    const e = reason as { code?: string; message?: string }
    if (['42P01', 'PGRST205', 'PGRST202'].includes(e.code ?? '')) return 'Penyimpanan tagihan belum tersedia. Terapkan migrasi pengingat tagihan di Supabase.'
    if (e.code === '40001') return 'Tagihan sudah berubah. Muat ulang sebelum mencoba lagi.'
    return e.message || 'Tagihan belum tersimpan. Periksa koneksi lalu coba lagi.'
  }
  async function refresh() {
    const id = owner.value, request = ++generation
    if (!id) { items.value = []; loading.value = false; error.value = ''; return }
    loading.value = true
    try {
      const { data, error: failure } = await client.from('bill_reminders').select('*').eq('user_id', id).order('due_on').order('id')
      if (failure) throw failure
      if (request === generation && owner.value === id) { items.value = data ?? []; error.value = '' }
    } catch (reason) { if (request === generation && owner.value === id) error.value = message(reason) }
    finally { if (request === generation) loading.value = false }
  }
  async function mutate(action: (id: string) => PromiseLike<{ error: unknown }>) {
    if (busy.value) return false
    const id = owner.value
    if (!id) throw new Error('Silakan masuk kembali.')
    busy.value = true
    ++generation
    try {
      const result = await action(id)
      if (result.error) throw result.error
      if (owner.value !== id) throw new Error('Akun berubah. Buka tagihan kembali.')
      await refresh()
      return true
    } catch (reason) { throw new Error(message(reason)) }
    finally { busy.value = false }
  }
  async function save(draft: BillDraft, original?: Bill) {
    validateBill(draft)
    return mutate(async id => {
      const values = { ...draft, name: draft.name.trim(), anchor_day: original && original.due_on === draft.due_on ? original.anchor_day : Number(draft.due_on.slice(8)) }
      const query = original
        ? client.from('bill_reminders').update({ ...values, revision: original.revision + 1 }).eq('id', original.id).eq('user_id', id).eq('revision', original.revision).eq('status', 'pending')
        : client.from('bill_reminders').insert({ ...values, user_id: id })
      const { data, error } = await query.select('id')
      return { error: error || (!data?.length ? { code: '40001' } : null) }
    })
  }
  async function complete(bill: Bill) {
    return mutate(() => client.rpc('complete_bill_reminder', { bill_id: bill.id, expected_revision: bill.revision }))
  }
  async function remove(bill: Bill) {
    return mutate(async id => {
      const { data, error } = await client.from('bill_reminders').delete().eq('id', bill.id).eq('user_id', id).eq('revision', bill.revision).select('id')
      return { error: error || (!data?.length ? { code: '40001' } : null) }
    })
  }
  let stop: (() => void) | undefined
  onMounted(() => {
    stop = watch(owner, () => { items.value = []; error.value = ''; void refresh() }, { immediate: true })
    window.addEventListener('focus', reload)
    window.addEventListener('online', reload)
  })
  function reload() { if (!busy.value) void refresh() }
  onBeforeUnmount(() => { ++generation; stop?.(); window.removeEventListener('focus', reload); window.removeEventListener('online', reload) })
  return { items, owner, loading, busy, error, refresh, save, complete, remove }
}
