import { canChangePending, changePendingNote, listPendingNotes, pendingValidationError, validatePendingDraft, type PendingNote, type SavedNote } from '~/utils/pendingNotes'
import type { MoneyNote, NoteDraft } from '~/utils/notes'

export function usePendingNotes() {
  const cloud = useCloudFinance()
  const user = useSupabaseUser()
  const owner = computed(() => user.value?.sub ?? '')
  const state = useState<{ owner: string; items: PendingNote[]; error: string }>('pending-notes', () => ({ owner: '', items: [], error: '' }))
  const running = useState('pending-notes-running', () => false)
  const items = computed(() => state.value.owner === owner.value ? state.value.items : [])
  const error = computed(() => state.value.owner === owner.value ? state.value.error : '')
  async function reload() {
    const id = owner.value
    if (state.value.owner !== id) state.value = { owner: id, items: [], error: '' }
    if (!id || !import.meta.client) return
    try {
      const records = await listPendingNotes(id)
      if (owner.value === id) state.value = { owner: id, items: records, error: '' }
    } catch (reason) { if (owner.value === id) state.value.error = (reason as Error).message }
  }
  async function enqueue(draft: NoteDraft, existing?: MoneyNote, attemptedFingerprint?: string): Promise<SavedNote> {
    const id = owner.value
    if (!id || !cloud.ready.value) throw new Error('Buka data akun ini saat online terlebih dahulu sebelum mencatat offline.')
    validatePendingDraft(draft, cloud.data.value)
    const note: MoneyNote = existing ?? { ...draft, description: draft.description.trim(), id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    await changePendingNote(id, note.id, current => current ?? ({ key: id + ':' + note.id, owner: id, note, revision: 1, status: 'pending', error: '', attemptedFingerprint }))
    await reload()
    return { ...note, pendingSync: true }
  }
  async function edit(original: PendingNote, draft: NoteDraft) {
    const id = owner.value
    if (original.owner !== id) throw new Error('Akun berubah. Buka antrean akun yang sesuai.')
    validatePendingDraft(draft, cloud.data.value)
    await changePendingNote(id, original.note.id, current => {
      if (!current || current.revision !== original.revision || !canChangePending(current)) throw new Error('Catatan berubah atau sedang disinkronkan. Buka kembali antrean.')
      return { ...current, note: { ...draft, description: draft.description.trim(), id: current.note.id, createdAt: current.note.createdAt }, status: 'pending', error: '', revision: current.revision + 1 }
    })
    await reload()
    return { ...draft, id: original.note.id, createdAt: original.note.createdAt, pendingSync: true }
  }
  async function discard(original: PendingNote) {
    if (owner.value !== original.owner) throw new Error('Akun berubah.')
    await changePendingNote(original.owner, original.note.id, current => {
      if (!current) return
      if (current.revision !== original.revision || !canChangePending(current)) throw new Error('Catatan sedang diperiksa di server. Sinkronkan sebelum menghapus.')
      return null
    })
    await reload()
  }
  async function sync(retryBlocked = false) {
    const id = owner.value
    if (!import.meta.client || !id || !cloud.online.value || running.value || cloud.saving.value) return
    running.value = true
    try {
      const records = await listPendingNotes(id)
      for (const original of records) {
        if (owner.value !== id || !cloud.online.value) break
        if (original.status === 'blocked' && !retryBlocked) continue
        const token = crypto.randomUUID()
        const claimed = await changePendingNote(id, original.note.id, current => {
          if (!current || (current.lease && current.lease.until > Date.now())) return
          return { ...current, lease: { token, until: Date.now() + 90000 } }
        })
        if (!claimed) continue
        let heartbeat: ReturnType<typeof setInterval> | undefined
        const update = (fn: (row: PendingNote) => PendingNote | null) => changePendingNote(id, claimed.note.id, current => current?.lease?.token === token ? fn(current) : undefined)
        try {
          heartbeat = setInterval(() => { void update(row => ({ ...row, lease: { token, until: Date.now() + 90000 } })).catch(() => {}) }, 20000)
          await cloud.refresh()
          if (owner.value !== id || !cloud.online.value || !cloud.ready.value || cloud.error.value || cloud.loading.value || cloud.saving.value) break
          // Stable UUID and the server's snapshot compare-and-swap make retries
          // idempotent, including a committed write with a lost response.
          if (cloud.data.value.notes.some(note => note.id === claimed.note.id)) { await update(() => null); continue }
          const currentFingerprint = cloud.fingerprint.value
          const uncertain = !!claimed.attemptedFingerprint && claimed.attemptedFingerprint === currentFingerprint
          const validation = pendingValidationError(claimed.note, cloud.data.value)
          if (validation) {
            await update(row => ({ ...row, status: 'blocked', error: validation, attemptedFingerprint: uncertain ? row.attemptedFingerprint : undefined }))
            continue
          }
          const prepared = await update(row => ({ ...row, attemptedFingerprint: currentFingerprint, error: '' }))
          if (!prepared || owner.value !== id) break
          await cloud.save({ ...cloud.data.value, notes: [...cloud.data.value.notes, claimed.note] }, undefined, { owner: id, fingerprint: currentFingerprint })
          if (owner.value === id && cloud.data.value.notes.some(note => note.id === claimed.note.id)) await update(() => null)
        } catch (reason) {
          const failure = reason as Error & { code?: string }
          const rejected = !!failure.code && /^[0-9A-Z]{5}$/.test(failure.code)
          await update(row => ({ ...row, status: rejected && failure.code !== '40001' ? 'blocked' : 'pending', error: rejected ? failure.message : 'Koneksi atau sesi belum siap. Catatan tetap tersimpan; akan diperiksa lagi sebelum dikirim.', attemptedFingerprint: rejected ? undefined : row.attemptedFingerprint }))
          if (!rejected || failure.code === '40001') break
        } finally {
          clearInterval(heartbeat)
          await update(row => ({ ...row, lease: undefined }))
        }
      }
    } catch (reason) {
      if (owner.value === id) state.value.error = (reason as Error).message
    } finally { running.value = false; await reload() }
  }
  return { owner, items, error, running, reload, enqueue, edit, discard, sync, online: cloud.online }
}
