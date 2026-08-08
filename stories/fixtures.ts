import { computed, provide } from 'vue'
import { OFFERS_BY_KEY } from '../app/composables/useOffersByKey'
import type { ComparisonGroup } from '../shared/types/comparison'
import type { Offer } from '../shared/types/offer'

/**
 * A 1×1 product photograph stand-in. Stories must render without network
 * access, and the Artifact-style CSP in a static Storybook build blocks a
 * remote image anyway.
 */
export const SAMPLE_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%23e5e7eb"/><circle cx="32" cy="28" r="14" fill="%239ca3af"/><rect x="14" y="44" width="36" height="8" rx="4" fill="%239ca3af"/></svg>',
  )

export const kauflandOffer: Offer = {
  offerKey: 'ean:8606018614950:2026-07-27',
  productKey: 'ean:8606018614950',
  retailer: 'kaufland',
  brand: 'BULMEAT',
  name: 'Пилешко филе, охладено',
  unitText: '500 г',
  category: 'Месо',
  campaign: null,
  discountPercentage: 20,
  priceEurCents: 500,
  priceBgnCents: 978,
  originalPriceEurCents: 625,
  loyaltyTier: 'none',
  mechanic: 'standard',
  purchaseLimit: null,
  ean: '8606018614950',
  scope: 'national',
  store: null,
  validFrom: '2026-07-27',
  validUntil: '2026-08-02',
  sourceUrl: 'https://www.kaufland.bg/aktualni-predlozheniya/oferti.html',
  scrapedAt: '2026-08-01T06:00:00.000Z',
  warnings: [],
  imageUrl: SAMPLE_IMAGE,
}

/** The Lidl product listing: a direct photograph, a real product page, and no EAN. */
export const lidlOffer: Offer = {
  ...kauflandOffer,
  offerKey: 'lidl-1',
  productKey: 'lidl-1',
  retailer: 'lidl',
  brand: null,
  name: 'Пилешки гърди',
  unitText: '450 г',
  priceEurCents: 360,
  originalPriceEurCents: null,
  ean: null,
  imageUrl: SAMPLE_IMAGE,
  sourceUrl: 'https://www.lidl.bg/p/pileshki-gardi/p10060798',
  warnings: ['Discount label "Акция" states no percentage, so the reduction could not be quantified'],
}

/** Billa comes from the leaflet, so it carries a crop rather than a photograph. */
export const billaOffer: Offer = {
  ...kauflandOffer,
  offerKey: 'billa-1',
  productKey: 'billa-1',
  retailer: 'billa',
  brand: null,
  name: 'Пилешко филе',
  unitText: '600 г',
  priceEurCents: 720,
  originalPriceEurCents: null,
  ean: null,
  imageUrl: null,
  sourceUrl: 'https://www.billa.bg',
}

export const chickenGroup: ComparisonGroup = {
  groupKey: 'chicken-breast',
  labelBg: 'Пилешко филе',
  unitBase: 'kg',
  department: 'meat',
  savingsPercentage: 0.2,
  warnings: [],
  entries: [
    { offerKey: lidlOffer.offerKey, retailer: 'lidl', priceEurCents: 360, unitPriceEurCents: 800, isCheapest: true },
    { offerKey: kauflandOffer.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
    { offerKey: billaOffer.offerKey, retailer: 'billa', priceEurCents: 720, unitPriceEurCents: 1200, isCheapest: false },
  ],
}

/** Supplies the lookup that `PriceComparisonCard` and the details view inject. */
export function withOffers(offers: Offer[]) {
  return () => ({
    setup() {
      provide(
        OFFERS_BY_KEY,
        computed(() => new Map(offers.map((offer) => [offer.offerKey, offer]))),
      )
      return {}
    },
    template: '<story />',
  })
}
