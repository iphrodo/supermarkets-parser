import { describe, expect, it } from 'vitest'
import { parseQuantity, unitPriceEurCents } from '../quantity'

describe('parseQuantity', () => {
  it.each([
    ['500 г', 'kg', 0.5],
    ['500 гр', 'kg', 0.5],
    ['500 g', 'kg', 0.5],
    ['1,5 кг', 'kg', 1.5],
    ['1.5 kg', 'kg', 1.5],
    ['250 мл', 'l', 0.25],
    ['250 ml', 'l', 0.25],
    ['1,5 л', 'l', 1.5],
    ['1.5 l', 'l', 1.5],
    ['3 бр', 'pc', 3],
    ['3 броя', 'pc', 3],
    ['3 pcs', 'pc', 3],
  ])('parses "%s" as %s base unit', (unitText, unitBase, baseQuantity) => {
    expect(parseQuantity(unitText)).toEqual({ unitBase, baseQuantity })
  })

  it('accepts a comma as the decimal separator', () => {
    expect(parseQuantity('1,5 л')).toEqual({ unitBase: 'l', baseQuantity: 1.5 })
  })

  it('sums a multipack across the whole pack, not a single item', () => {
    expect(parseQuantity('4 x 125 г')).toEqual({ unitBase: 'kg', baseQuantity: 0.5 })
  })

  it('accepts the Cyrillic multiplication letter and decimal comma together', () => {
    expect(parseQuantity('2х1,5 л')).toEqual({ unitBase: 'l', baseQuantity: 3 })
  })

  it('prefers the volume token in Kaufland-style slash-joined text', () => {
    expect(parseQuantity('3 л/ 1455 г')).toEqual({ unitBase: 'l', baseQuantity: 3 })
  })

  it('produces the same result regardless of token order', () => {
    expect(parseQuantity('1455 г/ 3 л')).toEqual(parseQuantity('3 л/ 1455 г'))
  })

  it('prefers weight over pieces when both are present', () => {
    expect(parseQuantity('500 г/ 4 бр')).toEqual({ unitBase: 'kg', baseQuantity: 0.5 })
  })

  it('returns null for empty text', () => {
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('   ')).toBeNull()
  })

  it('returns null for unrecognized text', () => {
    expect(parseQuantity('1.00000')).toBeNull()
    expect(parseQuantity('various sizes')).toBeNull()
  })
})

describe('unitPriceEurCents', () => {
  const quantity = { unitBase: 'kg' as const, baseQuantity: 0.5 }

  it('divides price by base quantity for a standard mechanic', () => {
    expect(unitPriceEurCents({ priceEurCents: 500, mechanic: 'standard' }, quantity)).toBe(1000)
  })

  it('halves the effective price for buy_1_get_1_free', () => {
    expect(unitPriceEurCents({ priceEurCents: 500, mechanic: 'buy_1_get_1_free' }, quantity)).toBe(500)
  })

  it('takes two thirds of the effective price for buy_2_get_1_free', () => {
    expect(unitPriceEurCents({ priceEurCents: 300, mechanic: 'buy_2_get_1_free' }, quantity)).toBeCloseTo(400, 5)
  })
})
