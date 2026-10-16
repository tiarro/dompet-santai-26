// All mutations share a lock, including backup restoration and category edits.
export const financialKinds = ['notes', 'budgets', 'categories', 'savings', 'settings'] as const
export type FinancialDocuments = Record<typeof financialKinds[number], string | null>
export const snapshotKey = (owner: string) => 'dompet-santai-snapshot-v1:' + owner
const documentKey = (kind: string, owner: string) => 'dompet-santai-' + kind + '-v1:' + owner
function readSnapshot(owner: string): FinancialDocuments | null {
  const raw = localStorage.getItem(snapshotKey(owner))
  if (raw === null) return null
  const data = JSON.parse(raw)
  if (!data || data.version !== 1 || !data.documents || financialKinds.some(kind => data.documents[kind] !== null && typeof data.documents[kind] !== 'string')) {
    throw new Error('Data pemulihan tidak bisa dibaca. Data belum diubah.')
  }
  return data.documents
}
function parts(key: string) {
  const match = /^dompet-santai-(notes|budgets|categories|savings|settings)-v1:(.+)$/.exec(key)
  if (!match) throw new Error('Kunci data keuangan tidak valid.')
  return { kind: match[1] as typeof financialKinds[number], owner: match[2]! }
}
export function readFinancialItem(key: string): string | null {
  const { kind, owner } = parts(key)
  const snapshot = readSnapshot(owner)
  return snapshot ? snapshot[kind] : localStorage.getItem(key)
}
export function writeFinancialItem(key: string, value: string) {
  const { kind, owner } = parts(key)
  const snapshot = readSnapshot(owner)
  if (snapshot) replaceFinancialDocuments(owner, { ...snapshot, [kind]: value })
  else localStorage.setItem(key, value)
}
export function readFinancialDocuments(owner: string): FinancialDocuments {
  return readSnapshot(owner) ?? Object.fromEntries(financialKinds.map(kind => [kind, localStorage.getItem(documentKey(kind, owner))])) as FinancialDocuments
}
// One atomic setItem: a failed import/reset never leaves a partially replaced ledger.
// Once restored, all readers/writers use this snapshot; legacy keys are inert.
export function replaceFinancialDocuments(owner: string, documents: FinancialDocuments) {
  localStorage.setItem(snapshotKey(owner), JSON.stringify({ version: 1, documents }))
}
const fallbackLocks = new Map<string, Promise<void>>()

export async function withFinancialLock<T>(owner: string, action: () => T): Promise<T> {
  if (navigator.locks) return navigator.locks.request('dompet-santai-finances:' + owner, action)

  // Web Locks is unavailable on HTTP LAN origins (for example when testing from a phone).
  // Serialize writes within this page so local development can still persist preferences.
  const previous = fallbackLocks.get(owner) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  const tail = previous.then(() => current)
  fallbackLocks.set(owner, tail)
  await previous
  try {
    return await action()
  } finally {
    release()
    if (fallbackLocks.get(owner) === tail) fallbackLocks.delete(owner)
  }
}
export function notifyFinancialChange() {
  window.dispatchEvent(new Event('dompet-santai-finances'))
}
export function financialStorageEvent(event: StorageEvent, owner: string | undefined) {
  return !event.key || (!!owner && event.key.startsWith('dompet-santai-') && event.key.endsWith(':' + owner))
}

export function clearLegacyDocuments(owner: string) {
  for (const kind of financialKinds) {
    try { localStorage.removeItem(documentKey(kind, owner)) } catch { /* The committed snapshot remains authoritative. */ }
  }
}
export function financialFingerprint(owner: string) {
  return JSON.stringify([localStorage.getItem(snapshotKey(owner)), ...financialKinds.map(kind => localStorage.getItem(documentKey(kind, owner)))])
}
