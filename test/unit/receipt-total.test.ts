import { describe, expect, it } from 'vitest'
import { extractReceiptTotal } from '../../app/utils/receiptTotal'

describe('receipt total extraction', () => {
  it.each([
    ['TOTAL Rp85.000', 85000], ['TOTAL: 85.000,00', 85000],
    ['TOTAL 85,000.00', 85000], ['TOTAL 85000', 85000],
    ['TOTAL Rp 85 000,00', 85000], ['TOTAL 1.234.567,00', 1234567],
    ['TOTAL 1,234,567.00', 1234567], ['TOTAL 85.OOO', 85000],
    ['T0TAL Rp I00.000', 100000], ['TOTAL\nRp85.000', 85000],
    ['TOTAL (3 ITEM) Rp85.000', 85000], ['TOTAL 3 ITEM Rp85.000', 85000],
    ['Jumlah Bayar 42.500', 42500], ['TOTALRp85000', 85000],
    ['SUB TOTAL 80.000\nPPN 5.000\nTOTAL 85.000\nTUNAI 100.000\nKEMBALIAN 15.000', 85000],
    ['TOTAL 80.000\nGRAND TOTAL 85.000\nCASH 100.000', 85000],
    ['TOTAL ITEM 3\nTOTAL DISKON 5.000\nTOTAL BAYAR 85.000', 85000],
    ['TOTAL 85.000\nTOTAL 85.000', 85000],
    ['GRAND TOTAL 85.000\nTOTAL BAYAR 85.000', 85000],
  ])('reads %j as integer rupiah %d', (text, amount) => {
    expect(extractReceiptTotal(text)).toEqual({ status: 'found', amount })
  })

  it.each([
    '', 'TOKO SANTAI\n081234567890\n85.000', 'SUBTOTAL 85.000',
    'SUB TOTAL 85.000\nTUNAI 100.000\nKEMBALIAN 15.000', 'TOTAL ITEM 3',
    'TOTAL DISKON 5.000', 'TOTAL 42.500,50', 'TOTAL 42,500.50',
    'TOTAL -85.000', 'TOTAL 0', 'TOTAL 1000000000000', 'TOTAL 85.000%',
    'TOTAL 1.23.456', 'TOTAL\nPPN 5.000\nTUNAI 100.000',
    'TOTAL 85.000\nGRAND TOTAL tidak terbaca',
  ])('does not guess a usable amount from %j', text => {
    expect(extractReceiptTotal(text)).toEqual({ status: 'not-found' })
  })

  it.each(['TOTAL 85.000\nTOTAL 95.000', 'TOTAL 85.000 95.000', 'GRAND TOTAL 100.000\nTOTAL BAYAR 90.000'])('asks for manual entry when totals conflict: %j', text => {
    expect(extractReceiptTotal(text)).toEqual({ status: 'ambiguous' })
  })
})
