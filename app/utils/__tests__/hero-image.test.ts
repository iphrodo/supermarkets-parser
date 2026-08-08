import { describe, expect, it } from 'vitest'

import type { ComparisonGroup } from '../../../shared/types/comparison'
import type { LeafletPage, Offer } from '../../../shared/types/offer'
import { resolveHeroOffer } from '../hero-image'

const PAGE_ID = 'billa:cw31:3'
const PAGE: LeafletPage = {
  imageUrl: 'https://example.com/leaflet/page-3.jpg',
  width: 1000,
  height: 1400,
  pageNumber: 3,
  sourceUrl: 'https://example.com/leaflet/',
}
const PAGES = { [PAGE_ID]: PAGE }

function makeOffer(offerKey: string, overrides: Partial<Offer> = {}): Offer {
  return {
    offerKey,
    productKey: offerKey,
    retailer: 'kaufland',
    brand: null,
    name: offerKey,
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

/** `cheap` is the cheapest entry, `dear` is not — the order the builder emits. */
function makeGroup(): ComparisonGroup {
  return {
    groupKey: 'chicken-breast',
    labelBg: 'Пилешко филе',
    unitBase: 'kg',
    department: 'meat',
    savingsPercentage: 0.2,
    warnings: [],
    entries: [
      { offerKey: 'cheap', retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      { offerKey: 'dear', retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
    ],
  }
}

function lookup(...offers: Offer[]): Map<string, Offer> {
  return new Map(offers.map((offer) => [offer.offerKey, offer]))
}

describe('resolveHeroOffer', () => {
  it('prefers the cheapest entry’s direct image URL', () => {
    const cheap = makeOffer('cheap', { imageUrl: 'https://example.com/cheap.jpg' })
    const dear = makeOffer('dear', { imageUrl: 'https://example.com/dear.jpg' })

    expect(resolveHeroOffer(makeGroup(), lookup(cheap, dear), {})?.offerKey).toBe('cheap')
  })

  it('falls back to any entry’s direct image URL when the cheapest has none', () => {
    const cheap = makeOffer('cheap')
    const dear = makeOffer('dear', { imageUrl: 'https://example.com/dear.jpg' })

    expect(resolveHeroOffer(makeGroup(), lookup(cheap, dear), {})?.offerKey).toBe('dear')
  })

  it('prefers a photograph over a crop even when the crop is the cheapest entry’s', () => {
    const cheap = makeOffer('cheap', { imageCrop: { pageId: PAGE_ID, box: [100, 100, 300, 300] } })
    const dear = makeOffer('dear', { imageUrl: 'https://example.com/dear.jpg' })

    expect(resolveHeroOffer(makeGroup(), lookup(cheap, dear), PAGES)?.offerKey).toBe('dear')
  })

  it('takes the cheapest entry’s crop when no entry has a photograph', () => {
    const cheap = makeOffer('cheap', { imageCrop: { pageId: PAGE_ID, box: [100, 100, 300, 300] } })
    const dear = makeOffer('dear', { imageCrop: { pageId: PAGE_ID, box: [400, 400, 600, 600] } })

    expect(resolveHeroOffer(makeGroup(), lookup(cheap, dear), PAGES)?.offerKey).toBe('cheap')
  })

  it('takes any entry’s crop when the cheapest has none', () => {
    const cheap = makeOffer('cheap')
    const dear = makeOffer('dear', { imageCrop: { pageId: PAGE_ID, box: [400, 400, 600, 600] } })

    expect(resolveHeroOffer(makeGroup(), lookup(cheap, dear), PAGES)?.offerKey).toBe('dear')
  })

  it('resolves to nothing when no entry has usable imagery', () => {
    expect(resolveHeroOffer(makeGroup(), lookup(makeOffer('cheap'), makeOffer('dear')), {})).toBeNull()
  })

  it('treats a crop whose page is absent from the snapshot as no imagery at all', () => {
    const cheap = makeOffer('cheap', { imageCrop: { pageId: 'billa:cw30:9', box: [100, 100, 300, 300] } })

    expect(resolveHeroOffer(makeGroup(), lookup(cheap, makeOffer('dear')), PAGES)).toBeNull()
  })

  it('ignores an entry whose offer is missing from the snapshot', () => {
    const dear = makeOffer('dear', { imageUrl: 'https://example.com/dear.jpg' })

    expect(resolveHeroOffer(makeGroup(), lookup(dear), {})?.offerKey).toBe('dear')
  })
})
