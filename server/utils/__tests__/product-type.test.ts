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
          newType: { labelBg: 'Пилешко филе', labelEn: 'Chicken breast', unitBase: 'kg', department: 'meat' },
          confident: true,
        })),
    )
    const deps = makeDeps({ classifyBatch })

    const result = await classifyOffers([makeOffer()], deps)

    expect(result.vocabulary).toHaveLength(1)
    expect(result.vocabulary[0]!.labelBg).toBe('Пилешко филе')
    expect(result.vocabulary[0]!.department).toBe('meat')
    expect(result.assignments['product-1']).toBe(result.vocabulary[0]!.id)
  })

  it('coerces a department outside the taxonomy to the catch-all rather than losing the type', async () => {
    const classifyBatch = vi.fn(
      async (items: ClassificationItem[]): Promise<ClassificationResult[]> =>
        items.map((item) => ({
          index: item.index,
          typeId: null,
          // The model inventing an aisle must cost the aisle, never the comparison group.
          newType: {
            labelBg: 'Пилешко филе',
            labelEn: 'Chicken breast',
            unitBase: 'kg',
            department: 'месо' as never,
          },
          confident: true,
        })),
    )
    const deps = makeDeps({ classifyBatch })

    const result = await classifyOffers([makeOffer()], deps)

    expect(result.vocabulary).toHaveLength(1)
    expect(result.vocabulary[0]!.department).toBe('other')
    expect(result.assignments['product-1']).toBe(result.vocabulary[0]!.id)
  })

  it('reuses an existing type without requiring a department decision for the offer', async () => {
    const classifyBatch = vi.fn(async (items: ClassificationItem[]): Promise<ClassificationResult[]> =>
      items.map((item) => ({ index: item.index, typeId: 'chicken-breast', newType: null, confident: true })),
    )
    const deps = makeDeps(
      { classifyBatch },
      {
        vocabulary: [
          { id: 'chicken-breast', labelBg: 'Пилешко филе', labelEn: 'Chicken breast', unitBase: 'kg', department: 'meat' },
        ],
      },
    )

    const result = await classifyOffers([makeOffer()], deps)

    expect(result.assignments['product-1']).toBe('chicken-breast')
    expect(result.vocabulary).toHaveLength(1)
    expect(result.vocabulary[0]!.department).toBe('meat')
  })

  it('drops an unconfident assignment so the offer never enters a comparison', async () => {
    const classifyBatch = vi.fn(async (items: ClassificationItem[]): Promise<ClassificationResult[]> =>
      items.map((item) => ({ index: item.index, typeId: null, newType: null, confident: false })),
    )
    const deps = makeDeps({ classifyBatch })

    const result = await classifyOffers([makeOffer()], deps)

    expect(result.assignments['product-1']).toBeUndefined()
  })

  it('reuses an existing type when the model proposes one that already exists', async () => {
    // The model proposing a type the vocabulary already holds is exactly what
    // used to mint `кисело-мляко-2`; the system now catches it instead.
    const classifyBatch = vi.fn(
      async (items: ClassificationItem[]): Promise<ClassificationResult[]> =>
        items.map((item) => ({
          index: item.index,
          typeId: null,
          newType: { labelBg: 'Кисело мляко', labelEn: 'Yogurt', unitBase: 'kg', department: 'pantry' },
          confident: true,
        })),
    )
    const deps = makeDeps(
      { classifyBatch },
      {
        vocabulary: [
          { id: 'кисело-мляко', labelBg: 'кисело мляко', labelEn: 'Yogurt', unitBase: 'kg', department: 'dairy-eggs' },
        ],
      },
    )

    const result = await classifyOffers([makeOffer()], deps)

    expect(result.vocabulary).toHaveLength(1)
    expect(result.assignments['product-1']).toBe('кисело-мляко')
    // The existing entry's department wins; the proposal's is discarded with it.
    expect(result.vocabulary[0]!.department).toBe('dairy-eggs')
  })

  it('creates a separate type when the label matches but the base unit does not', async () => {
    const classifyBatch = vi.fn(
      async (items: ClassificationItem[]): Promise<ClassificationResult[]> =>
        items.map((item) => ({
          index: item.index,
          typeId: null,
          newType: { labelBg: 'сладолед', labelEn: 'Ice cream', unitBase: 'l', department: 'frozen' },
          confident: true,
        })),
    )
    const deps = makeDeps(
      { classifyBatch },
      {
        vocabulary: [
          { id: 'сладолед', labelBg: 'сладолед', labelEn: 'Ice cream', unitBase: 'kg', department: 'frozen' },
        ],
      },
    )

    const result = await classifyOffers([makeOffer()], deps)

    expect(result.vocabulary).toHaveLength(2)
    expect(result.assignments['product-1']).toBe('сладолед-2')
  })

  it('still mints a suffixed id for two genuinely different labels that slugify the same', async () => {
    const classifyBatch = vi.fn(
      async (items: ClassificationItem[]): Promise<ClassificationResult[]> =>
        items.map((item) => ({
          index: item.index,
          typeId: null,
          newType: { labelBg: 'кисело-мляко', labelEn: 'Yogurt', unitBase: 'kg', department: 'dairy-eggs' },
          confident: true,
        })),
    )
    const deps = makeDeps(
      { classifyBatch },
      {
        vocabulary: [
          { id: 'кисело-мляко', labelBg: 'кисело мляко', labelEn: 'Yogurt', unitBase: 'kg', department: 'dairy-eggs' },
        ],
      },
    )

    const result = await classifyOffers([makeOffer()], deps)

    // Different labels ("кисело мляко" vs "кисело-мляко") sharing one slug — the
    // case the suffix was written for, and now the only way to reach it.
    expect(result.vocabulary).toHaveLength(2)
    expect(result.assignments['product-1']).toBe('кисело-мляко-2')
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
