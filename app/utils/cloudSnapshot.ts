type Snapshot = { profile?: unknown; settings?: unknown; _meta?: { fingerprint?: string }; [key: string]: unknown }

export function snapshotFingerprint(raw: unknown): string {
  const fingerprint = (raw as Snapshot)?._meta?.fingerprint
  if (typeof fingerprint !== 'string' || !fingerprint) throw new Error('Kontrak data cloud belum sesuai. Terapkan migrasi SQL terbaru lalu muat ulang.')
  return fingerprint
}
