import { describe, expect, it } from 'vitest'
import type { Offer } from '../../../shared/types/offer'
import { mergeCatalog } from '../catalog'

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    offerKey: 'name:abc:2026-07-27',
    productKey: 'name:abc',
    retailer: 'kaufland',
    brand: null,
    name: 'Test product',
    unitText: '1 бр.',
    category: 'Тест',
    campaign: null,
    discountPercentage: 10,
    priceEurCents: 100,
    priceBgnCents: null,
    originalPriceEurCents: null,
    loyaltyTier: 'none',
    mechanic: 'standard',
    purchaseLimit: null,
    ean: null,
    scope: 'national',
    store: null,
    validFrom: '2026-07-27',
    validUntil: '2026-08-02',
    sourceUrl: 'https://example.com',
    scrapedAt: '2026-08-01T00:00:00.000Z',
    warnings: [],
    ...overrides,
  }
}

describe('mergeCatalog', () => {
  it('combines offer lists from both sources into one list', () => {
    const kaufland = [makeOffer({ offerKey: 'k1' })]
    const lidl = [makeOffer({ offerKey: 'l1', retailer: 'lidl' })]

    const result = mergeCatalog(kaufland, lidl)

    expect(result.offers).toHaveLength(2)
    expect(result.warnings).toHaveLength(0)
  })

  it('deduplicates offers sharing the same offerKey', () => {
    const offers = [makeOffer({ offerKey: 'dup' }), makeOffer({ offerKey: 'dup' })]

    const result = mergeCatalog(offers)

    expect(result.offers).toHaveLength(1)
  })

  it('attaches a warning when two offers with the same offerKey disagree on price', () => {
    const offers = [
      makeOffer({ offerKey: 'dup', priceEurCents: 100 }),
      makeOffer({ offerKey: 'dup', priceEurCents: 150 }),
    ]

    const result = mergeCatalog(offers)

    expect(result.offers).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
    expect(result.offers[0]!.warnings).toHaveLength(1)
  })
})
