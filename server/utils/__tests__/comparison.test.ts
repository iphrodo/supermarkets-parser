import { describe, expect, it } from 'vitest'
import type { Offer } from '../../../shared/types/offer'
import { buildComparisons, createDepartmentResolver } from '../comparison'
import type { ProductType, ProductTypeAssignments, ProductTypeVocabulary } from '../kv'

const CHICKEN_TYPE: ProductType = { id: 'chicken-breast', labelBg: 'Пилешко филе', labelEn: 'Chicken breast', unitBase: 'kg' }
const YOGURT_TYPE: ProductType = { id: 'yogurt', labelBg: 'Кисело мляко', labelEn: 'Yogurt', unitBase: 'kg' }

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    offerKey: 'offer-1',
    productKey: 'product-1',
    retailer: 'kaufland',
    brand: null,
    name: 'Test product',
    unitText: '500 г',
    category: 'general',
    campaign: null,
    discountPercentage: 0,
    priceEurCents: 500,
    priceBgnCents: null,
    originalPriceEurCents: null,
    loyaltyTier: 'none',
    mechanic: 'standard',
    purchaseLimit: null,
    ean: null,
    imageUrl: null,
    scope: 'national',
    store: null,
    validFrom: '2026-01-01',
    validUntil: '2026-01-31',
    sourceUrl: 'https://example.com',
    scrapedAt: '2026-01-01T00:00:00.000Z',
    warnings: [],
    ...overrides,
  }
}

describe('buildComparisons', () => {
  it('discards a group with offers from only one retailer', () => {
    const offers = [
      makeOffer({ offerKey: 'a', productKey: 'a', retailer: 'kaufland' }),
      makeOffer({ offerKey: 'b', productKey: 'b', retailer: 'kaufland' }),
    ]
    const vocabulary: ProductTypeVocabulary = [CHICKEN_TYPE]
    const assignments: ProductTypeAssignments = { a: 'chicken-breast', b: 'chicken-breast' }

    expect(buildComparisons(offers, vocabulary, assignments)).toEqual([])
  })

  it('collapses two Lidl sources into a single Lidl entry', () => {
    const offers = [
      makeOffer({ offerKey: 'kaufland-1', productKey: 'kaufland-1', retailer: 'kaufland', priceEurCents: 500 }),
      makeOffer({
        offerKey: 'lidl-pricelist',
        productKey: 'lidl-pricelist',
        retailer: 'lidl',
        priceEurCents: 600,
        sourceUrl: 'https://www.lidl.bg/explore/assets/webPriceData/bg/ExportSecondList.xlsx',
      }),
      makeOffer({
        offerKey: 'lidl-site',
        productKey: 'lidl-site',
        retailer: 'lidl',
        priceEurCents: 400,
        sourceUrl: 'https://www.lidl.bg/p/milbona-kaskaval/p10060798',
      }),
    ]
    const vocabulary: ProductTypeVocabulary = [CHICKEN_TYPE]
    const assignments: ProductTypeAssignments = {
      'kaufland-1': 'chicken-breast',
      'lidl-pricelist': 'chicken-breast',
      'lidl-site': 'chicken-breast',
    }

    const groups = buildComparisons(offers, vocabulary, assignments)

    expect(groups).toHaveLength(1)
    expect(groups[0]!.entries).toHaveLength(2)
    const lidlEntry = groups[0]!.entries.find((e) => e.retailer === 'lidl')
    expect(lidlEntry?.offerKey).toBe('lidl-site')
  })

  it('drops an entry above 10x the group median and records a warning', () => {
    const offers = [
      makeOffer({ offerKey: 'a', productKey: 'a', retailer: 'kaufland', priceEurCents: 500, unitText: '500 г' }),
      makeOffer({ offerKey: 'b', productKey: 'b', retailer: 'lidl', priceEurCents: 550, unitText: '500 г' }),
      makeOffer({ offerKey: 'c', productKey: 'c', retailer: 'billa', priceEurCents: 50000, unitText: '500 г' }),
    ]
    const vocabulary: ProductTypeVocabulary = [CHICKEN_TYPE]
    const assignments: ProductTypeAssignments = { a: 'chicken-breast', b: 'chicken-breast', c: 'chicken-breast' }

    const groups = buildComparisons(offers, vocabulary, assignments)

    expect(groups).toHaveLength(1)
    expect(groups[0]!.entries.map((e) => e.retailer).sort()).toEqual(['kaufland', 'lidl'])
    expect(groups[0]!.warnings).toHaveLength(1)
    expect(groups[0]!.warnings[0]).toContain('billa')
  })

  it('marks exactly one entry as cheapest', () => {
    const offers = [
      makeOffer({ offerKey: 'a', productKey: 'a', retailer: 'kaufland', priceEurCents: 500 }),
      makeOffer({ offerKey: 'b', productKey: 'b', retailer: 'lidl', priceEurCents: 300 }),
    ]
    const vocabulary: ProductTypeVocabulary = [CHICKEN_TYPE]
    const assignments: ProductTypeAssignments = { a: 'chicken-breast', b: 'chicken-breast' }

    const groups = buildComparisons(offers, vocabulary, assignments)

    expect(groups[0]!.entries.filter((e) => e.isCheapest)).toHaveLength(1)
    expect(groups[0]!.entries.find((e) => e.isCheapest)?.offerKey).toBe('b')
  })

  it('sorts groups by savings percentage, largest first', () => {
    const offers = [
      makeOffer({ offerKey: 'chicken-a', productKey: 'chicken-a', retailer: 'kaufland', priceEurCents: 500 }),
      makeOffer({ offerKey: 'chicken-b', productKey: 'chicken-b', retailer: 'lidl', priceEurCents: 480 }),
      makeOffer({ offerKey: 'yogurt-a', productKey: 'yogurt-a', retailer: 'kaufland', priceEurCents: 500 }),
      makeOffer({ offerKey: 'yogurt-b', productKey: 'yogurt-b', retailer: 'lidl', priceEurCents: 100 }),
    ]
    const vocabulary: ProductTypeVocabulary = [CHICKEN_TYPE, YOGURT_TYPE]
    const assignments: ProductTypeAssignments = {
      'chicken-a': 'chicken-breast',
      'chicken-b': 'chicken-breast',
      'yogurt-a': 'yogurt',
      'yogurt-b': 'yogurt',
    }

    const groups = buildComparisons(offers, vocabulary, assignments)

    expect(groups.map((g) => g.groupKey)).toEqual(['yogurt', 'chicken-breast'])
  })

  it('excludes offers whose base unit disagrees with the type', () => {
    const offers = [
      makeOffer({ offerKey: 'a', productKey: 'a', retailer: 'kaufland', unitText: '500 г' }),
      makeOffer({ offerKey: 'b', productKey: 'b', retailer: 'lidl', unitText: '3 бр' }),
    ]
    const vocabulary: ProductTypeVocabulary = [CHICKEN_TYPE]
    const assignments: ProductTypeAssignments = { a: 'chicken-breast', b: 'chicken-breast' }

    expect(buildComparisons(offers, vocabulary, assignments)).toEqual([])
  })

  it('excludes offers without a confident assignment', () => {
    const offers = [
      makeOffer({ offerKey: 'a', productKey: 'a', retailer: 'kaufland' }),
      makeOffer({ offerKey: 'b', productKey: 'b', retailer: 'lidl' }),
    ]
    const vocabulary: ProductTypeVocabulary = [CHICKEN_TYPE]
    const assignments: ProductTypeAssignments = { a: 'chicken-breast' }

    expect(buildComparisons(offers, vocabulary, assignments)).toEqual([])
  })

  it('carries the canonical type’s department onto the published group', () => {
    const offers = [
      makeOffer({ offerKey: 'a', productKey: 'a', retailer: 'kaufland' }),
      makeOffer({ offerKey: 'b', productKey: 'b', retailer: 'lidl' }),
    ]
    const vocabulary: ProductTypeVocabulary = [{ ...CHICKEN_TYPE, department: 'meat' }]
    const assignments: ProductTypeAssignments = { a: 'chicken-breast', b: 'chicken-breast' }

    const groups = buildComparisons(offers, vocabulary, assignments)

    expect(groups[0]!.department).toBe('meat')
  })

  it('publishes a type that predates departments under the catch-all', () => {
    const offers = [
      makeOffer({ offerKey: 'a', productKey: 'a', retailer: 'kaufland' }),
      makeOffer({ offerKey: 'b', productKey: 'b', retailer: 'lidl' }),
    ]
    // CHICKEN_TYPE carries no department, as every vocabulary entry written
    // before this change does.
    const vocabulary: ProductTypeVocabulary = [CHICKEN_TYPE]
    const assignments: ProductTypeAssignments = { a: 'chicken-breast', b: 'chicken-breast' }

    const groups = buildComparisons(offers, vocabulary, assignments)

    expect(groups[0]!.department).toBe('other')
  })
})

describe('createDepartmentResolver', () => {
  const vocabulary: ProductTypeVocabulary = [{ ...CHICKEN_TYPE, department: 'meat' }, YOGURT_TYPE]
  const assignments: ProductTypeAssignments = { 'chicken-1': 'chicken-breast', 'yogurt-1': 'yogurt' }

  it('resolves a known type’s department by typeId', () => {
    const resolver = createDepartmentResolver(vocabulary, assignments)

    expect(resolver.forTypeId('chicken-breast')).toBe('meat')
  })

  it('falls back to the catch-all for an unknown typeId', () => {
    const resolver = createDepartmentResolver(vocabulary, assignments)

    expect(resolver.forTypeId('unknown-type')).toBe('other')
  })

  it('falls back to the catch-all when the matched type has no department', () => {
    const resolver = createDepartmentResolver(vocabulary, assignments)

    expect(resolver.forTypeId('yogurt')).toBe('other')
  })

  it('resolves forProductKey through assignments', () => {
    const resolver = createDepartmentResolver(vocabulary, assignments)

    expect(resolver.forProductKey('chicken-1')).toBe('meat')
  })

  it('falls back to the catch-all for an unmapped productKey', () => {
    const resolver = createDepartmentResolver(vocabulary, assignments)

    expect(resolver.forProductKey('unmapped-product')).toBe('other')
  })
})
