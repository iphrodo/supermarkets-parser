import { vi } from 'vitest'
import { computed, type ComputedRef } from 'vue'

import type { ComparisonEntry, ComparisonGroup, UnitBase } from '../../../shared/types/comparison'
import type { DealsSnapshot, Offer, Retailer } from '../../../shared/types/offer'
import { OFFERS_BY_KEY, type OffersByKey } from '../../composables/useOffersByKey'

export const BATCH_SIZE = 24

export function makeOffer(index: number, retailer: Retailer = 'kaufland', overrides: Partial<Offer> = {}): Offer {
  return {
    offerKey: `offer-${index}`,
    productKey: `product-${index}`,
    retailer,
    brand: null,
    name: `Offer ${index}`,
    unitText: '1 pc',
    category: 'general',
    campaign: null,
    discountPercentage: 0,
    priceEurCents: 100,
    priceBgnCents: null,
    originalPriceEurCents: null,
    loyaltyTier: 'none',
    mechanic: 'standard',
    purchaseLimit: null,
    ean: null,
    imageUrl: null,
    imageCrop: null,
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

export function makeSnapshot(offers: Offer[], comparisons: ComparisonGroup[] = []): DealsSnapshot {
  return {
    offers,
    comparisons,
    leafletPages: {},
    generatedAt: '2026-01-01T00:00:00.000Z',
    sources: {
      kaufland: { scrapedAt: '2026-01-01T00:00:00.000Z', ok: true },
      lidl: { scrapedAt: '2026-01-01T00:00:00.000Z', ok: true },
      lidlSite: { scrapedAt: '2026-01-01T00:00:00.000Z', ok: true },
      billa: { scrapedAt: '2026-01-01T00:00:00.000Z', ok: true },
      bulmag: { scrapedAt: '2026-01-01T00:00:00.000Z', ok: true },
    },
  }
}

export function makeComparisonGroup(overrides: Partial<ComparisonGroup> = {}): ComparisonGroup {
  const entries: ComparisonEntry[] = overrides.entries ?? [
    { offerKey: 'offer-0', retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
    { offerKey: 'offer-1', retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
  ]

  return {
    groupKey: 'group-0',
    labelBg: 'Пилешко филе',
    unitBase: 'kg' as UnitBase,
    department: 'meat',
    entries,
    savingsPercentage: 0.2,
    warnings: [],
    ...overrides,
  }
}

export function makeOffersByKey(offers: Offer[]): ComputedRef<OffersByKey> {
  return computed(() => new Map(offers.map((offer) => [offer.offerKey, offer])))
}

/**
 * Spread into `mountSuspended`'s `global` for any component that injects the
 * offer lookup — the page provides it in the real tree, so a component mounted
 * on its own has to be given one.
 */
export function withOffers(offers: Offer[]): { provide: Record<symbol, unknown> } {
  return { provide: { [OFFERS_BY_KEY as symbol]: makeOffersByKey(offers) } }
}

export class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: ReadonlyArray<number> = []
  callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = () => []

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this)
  }
}
