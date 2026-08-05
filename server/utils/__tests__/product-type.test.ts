import { describe, expect, it, vi } from 'vitest'
import type { Offer } from '../../../shared/types/offer'
import type { ClassificationItem, ClassificationResult, ClassifyOffersDeps } from '../product-type'
import { classifyOffers } from '../product-type'
import type { ProductTypeAssignments, ProductTypeVocabulary } from '../kv'

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    offerKey: 'offer-1',
    productKey: 'product-1',
    retailer: 'kaufland',
    brand: null,
    name: 'Пилешко филе',
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

function makeDeps(
  overrides: Partial<ClassifyOffersDeps> = {},
  initial: { vocabulary?: ProductTypeVocabulary; assignments?: ProductTypeAssignments } = {},
): ClassifyOffersDeps {
  const state = {
    vocabulary: initial.vocabulary ?? [],
    assignments: initial.assignments ?? {},
  }

  return {
    readVocabulary: async () => state.vocabulary,
    writeVocabulary: async (v) => {
      state.vocabulary = v
    },
    readAssignments: async () => state.assignments,
    writeAssignments: async (a) => {
      state.assignments = a
    },
    classifyBatch: vi.fn(async () => []),
    logError: () => {},
    ...overrides,
  }
}

describe('classifyOffers', () => {
  it('never calls the model for an already-cached productKey', async () => {
    const classifyBatch = vi.fn(async () => [])
    const deps = makeDeps({ classifyBatch }, { assignments: { 'product-1': 'chicken-breast' } })

    const result = await classifyOffers([makeOffer()], deps)

    expect(classifyBatch).not.toHaveBeenCalled()
    expect(result.assignments['product-1']).toBe('chicken-breast')
  })

  it('appends a proposed new type to the vocabulary and assigns it', async () => {
    const classifyBatch = vi.fn(
      async (items: ClassificationItem[]): Promise<ClassificationResult[]> =>
        items.map((item) => ({
          index: item.index,
          typeId: null,
          newType: { labelBg: 'Пилешко филе', labelEn: 'Chicken breast', unitBase: 'kg' },
          confident: true,
        })),
    )
    const deps = makeDeps({ classifyBatch })

    const result = await classifyOffers([makeOffer()], deps)

    expect(result.vocabulary).toHaveLength(1)
    expect(result.vocabulary[0]!.labelBg).toBe('Пилешко филе')
    expect(result.assignments['product-1']).toBe(result.vocabulary[0]!.id)
  })

  it('drops an unconfident assignment so the offer never enters a comparison', async () => {
    const classifyBatch = vi.fn(async (items: ClassificationItem[]): Promise<ClassificationResult[]> =>
      items.map((item) => ({ index: item.index, typeId: null, newType: null, confident: false })),
    )
    const deps = makeDeps({ classifyBatch })

    const result = await classifyOffers([makeOffer()], deps)

    expect(result.assignments['product-1']).toBeUndefined()
  })

  it('splits large inputs into multiple batches', async () => {
    const offers = Array.from({ length: 85 }, (_, i) => makeOffer({ offerKey: `o-${i}`, productKey: `p-${i}` }))
    const classifyBatch = vi.fn(async (items: ClassificationItem[]): Promise<ClassificationResult[]> =>
      items.map((item) => ({ index: item.index, typeId: null, newType: null, confident: false })),
    )
    const deps = makeDeps({ classifyBatch })

    await classifyOffers(offers, deps)

    expect(classifyBatch).toHaveBeenCalledTimes(3)
  })
})
