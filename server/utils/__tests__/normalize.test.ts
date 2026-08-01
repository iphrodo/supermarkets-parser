import { describe, expect, it } from 'vitest'
import { computeOfferKey, computeProductKey, normalizeUnitText } from '../normalize'

describe('normalizeUnitText', () => {
  it('collapses reordered unit tokens to the same normalized value', () => {
    expect(normalizeUnitText('3 л/ 1455 г')).toBe(normalizeUnitText('1455 г/ 3 л'))
  })

  it('ignores case and extra whitespace', () => {
    expect(normalizeUnitText('  1 Л ')).toBe(normalizeUnitText('1 л'))
  })
})

describe('computeProductKey', () => {
  it('produces identical keys for the known real-data duplicate case', () => {
    const a = computeProductKey({
      retailer: 'kaufland',
      name: 'ALOMA Сладолед XXL',
      unitText: '3 л/ 1455 г',
      ean: null,
    })
    const b = computeProductKey({
      retailer: 'kaufland',
      name: 'ALOMA Сладолед XXL',
      unitText: '1455 г/ 3 л',
      ean: null,
    })
    expect(a).toBe(b)
  })

  it('prefers EAN over name/unit when present', () => {
    const withEan = computeProductKey({
      retailer: 'kaufland',
      name: 'Different name entirely',
      unitText: '1 бр.',
      ean: '8606018614950',
    })
    expect(withEan).toBe('ean:8606018614950')
  })

  it('scopes the name/unit fallback by retailer to avoid cross-retailer false merges', () => {
    const kaufland = computeProductKey({ retailer: 'kaufland', name: 'Мляко', unitText: '1 л', ean: null })
    const lidl = computeProductKey({ retailer: 'lidl', name: 'Мляко', unitText: '1 л', ean: null })
    expect(kaufland).not.toBe(lidl)
  })
})

describe('computeOfferKey', () => {
  it('stays stable across weeks for productKey, changes per validFrom', () => {
    const productKey = computeProductKey({ retailer: 'lidl', name: 'Кашкавал', unitText: '400 г', ean: null })
    const week1 = computeOfferKey(productKey, '2026-07-06')
    const week2 = computeOfferKey(productKey, '2026-07-13')
    expect(week1).not.toBe(week2)
    expect(week1.startsWith(productKey)).toBe(true)
  })
})
