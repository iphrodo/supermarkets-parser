export type Retailer = 'kaufland' | 'lidl' | 'billa'

export type OfferScope = 'national' | 'regional'

export type LoyaltyTier = 'none' | 'kaufland_card' | 'kaufland_card_xtra'

export type OfferMechanic = 'standard' | 'buy_1_get_1_free' | 'buy_2_get_1_free'

export interface OfferStoreRef {
  id: string
  name: string
  city: string | null
}

export interface Offer {
  offerKey: string
  productKey: string
  retailer: Retailer
  brand: string | null
  name: string
  unitText: string
  category: string
  campaign: string | null
  discountPercentage: number
  priceEurCents: number
  priceBgnCents: number | null
  originalPriceEurCents: number | null
  loyaltyTier: LoyaltyTier
  mechanic: OfferMechanic
  purchaseLimit: string | null
  ean: string | null
  imageUrl?: string | null
  scope: OfferScope
  store: OfferStoreRef | null
  validFrom: string
  validUntil: string
  sourceUrl: string
  scrapedAt: string
  warnings: string[]
}

export interface DealsSnapshot {
  offers: Offer[]
  generatedAt: string
  sources: {
    kaufland: { scrapedAt: string | null; ok: boolean }
    lidl: { scrapedAt: string | null; ok: boolean }
    billa: { scrapedAt: string | null; ok: boolean }
  }
}
