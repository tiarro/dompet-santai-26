import { maxNoteAmount } from './notes'

export type ReceiptTotal = { status: 'found'; amount: number } | { status: 'not-found' | 'ambiguous' }

function rupiah(value: string): number | null {
  if (!/\d/.test(value)) return null
  let normalized = value.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').trim().replace(/\s+/g, ' ')
  const cents = normalized.match(/[.,](\d{2})$/)
  if (cents) {
    if (cents[1] !== '00') return null
    normalized = normalized.slice(0, -3)
  }
  if (!/^\d+$/.test(normalized) && !/^\d{1,3}(?:\.\d{3})+$/.test(normalized)
    && !/^\d{1,3}(?:,\d{3})+$/.test(normalized) && !/^\d{1,3}(?: \d{3})+$/.test(normalized)) return null
  const amount = Number(normalized.replace(/[., ]/g, ''))
  return Number.isSafeInteger(amount) && amount > 0 && amount <= maxNoteAmount ? amount : null
}

function lineAmounts(line: string): ReceiptTotal {
  const source = line.replace(/\(\s*\d+\s*(?:ITEM|PCS|BARANG|PRODUK)\s*\)/g, '')
  const tokens = [...source.matchAll(/(?<![\p{L}\d])(?:RP\.?\s*)?([\dOoIl|]+(?:[.,][\dOoIl|]+)*(?:[ \u00a0][\dOoIl|]{3})*(?:[.,][\dOoIl|]{2})?)(?![\p{L}\d])/gu)]
    .filter(token => /\d/.test(token[1]!))
  // Prefer an explicit rupiah amount over an item count on the same line.
  const currency = tokens.filter(token => /^RP/.test(token[0]))
  const selected = currency.length ? currency : tokens
  const amounts: number[] = []
  for (const token of selected) {
    const preceding = source.slice(0, token.index).trimEnd()
    const following = source.slice(token.index! + token[0].length).trimStart()
    const amount = rupiah(token[1]!)
    if (amount === null || preceding.endsWith('-') || following.startsWith('%')) return { status: 'not-found' }
    amounts.push(amount)
  }
  const distinct = [...new Set(amounts)]
  return distinct.length === 1 ? { status: 'found', amount: distinct[0]! }
    : { status: distinct.length > 1 ? 'ambiguous' : 'not-found' }
}

/** Extract a labelled total, never the largest number, cash tendered or change. */
export function extractReceiptTotal(text: string): ReceiptTotal {
  const lines = text.normalize('NFKC').toUpperCase().split(/\r?\n/).map(line => line.trim()
    .replace(/\bT[O0]TA[L1I]\b/g, 'TOTAL').replace(/\b(TOTAL)(?=RP|\d)/g, '$1 '))
  const candidates: Array<{ rank: number; result: ReceiptTotal }> = []
  const labels = [
    { pattern: /\bGRAND\s*TOTAL\b/, rank: 100 },
    { pattern: /\b(?:TOTAL\s*(?:BAYAR|PEMBAYARAN|TAGIHAN|HARGA)|JUMLAH\s*(?:BAYAR|PEMBAYARAN|TAGIHAN))\b/, rank: 100 },
    { pattern: /\bTOTAL\b/, rank: 80 },
  ]
  for (const [index, line] of lines.entries()) {
    for (const { pattern, rank } of labels) {
      const match = pattern.exec(line)
      if (!match) continue
      const prefix = line.slice(0, match.index)
      const tail = line.slice(match.index + match[0].length)
      if (/\b(?:SUB|SUBTOTAL|DISKON|DISCOUNT|PAJAK|PPN|KEMBALIAN|TUNAI|CASH)\s*$/.test(prefix)
        || /^\s*(?:ITEM|QTY|BARANG|PRODUK|DISKON|DISCOUNT|PAJAK|PPN|KEMBALI)/.test(tail)) break
      // Some receipts put the value directly below the total label. Only
      // accept a standalone currency/number line, not the next labelled row.
      const amountLine = /^[\s:=.\-]*(?:RP\.?)?\s*$/.test(tail)
        && /^[\s:=]*(?:RP\.?\s*)?[\dOoIl|][\dOoIl|., \u00a0]*$/.test(lines[index + 1] ?? '')
        ? lines[index + 1]! : tail
      candidates.push({ rank, result: lineAmounts(amountLine) })
      break
    }
  }
  if (!candidates.length) return { status: 'not-found' }
  const rank = Math.max(...candidates.map(candidate => candidate.rank))
  const strongest = candidates.filter(candidate => candidate.rank === rank).map(candidate => candidate.result)
  if (strongest.some(result => result.status === 'ambiguous')) return { status: 'ambiguous' }
  const amounts = [...new Set(strongest.flatMap(result => result.status === 'found' ? [result.amount] : []))]
  return amounts.length === 1 ? { status: 'found', amount: amounts[0]! }
    : { status: amounts.length > 1 ? 'ambiguous' : 'not-found' }
}
