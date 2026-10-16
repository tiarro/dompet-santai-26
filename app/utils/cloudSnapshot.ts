type Snapshot = { profile?: unknown; settings?: unknown; _meta?: { fingerprint?: string }; [key: string]: unknown }

export function snapshotIsEmpty(raw: unknown): boolean {
  const wire = raw as Snapshot
  return !wire.profile && !wire.settings && ['wallets', 'categories', 'transactions', 'budgets', 'goals', 'movements'].every(key => Array.isArray(wire[key]) && wire[key].length === 0)
}

export function snapshotFingerprint(raw: unknown): string {
  const fingerprint = (raw as Snapshot)?._meta?.fingerprint
  if (typeof fingerprint !== 'string' || !fingerprint) throw new Error('Kontrak data cloud belum sesuai. Terapkan migrasi SQL terbaru lalu muat ulang.')
  return fingerprint
}
