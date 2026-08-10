import { describe, expect, it } from 'vitest'
import { formatRupiah } from '../../app/utils/currency'

describe('formatRupiah', () => {
  it('formats an amount in Indonesian rupiah', () => {
    expect(formatRupiah(12500)).toBe('Rp 12.500')
  })
})
