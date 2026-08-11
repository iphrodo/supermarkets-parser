import type { ComparisonGroup } from './comparison'
import type { DepartmentId } from './department'

export type Retailer = 'kaufland' | 'lidl' | 'billa' | 'bulmag'

export type OfferScope = 'national' | 'regional'

export type LoyaltyTier = 'none' | 'kaufland_card' | 'kaufland_card_xtra'

export type OfferMechanic = 'standard' | 'buy_1_get_1_free' | 'buy_2_get_1_free'

export interface OfferStoreRef {
  id: string
  name: string
  city: string | null
}

/**
 * `[ymin, xmin, ymax, xmax]`, normalized to 0–1000 — the convention Gemini
 * models are trained to emit for detection. Deliberately not pixels and
 * deliberately not `[x, y, w, h]`.
 */
export type BoundingBox2d = [number, number, number, number]

/** Locates a product's photograph within a page of `DealsSnapshot.leafletPages`. */
export interface OfferImageCrop {
  pageId: string
  box: BoundingBox2d
}

export interface LeafletPage {
  /**
   * The *display* variant, deliberately smaller than the one submitted for
   * vision extraction — a crop needs far less resolution than OCR does.
   */
  imageUrl: string
  width: number
  height: number
  pageNumber: number
  sourceUrl: string
}

export interface Offer {
  offerKey: string
  productKey: string
  retailer: Retailer
  brand: string | null
  name: string
  unitText: string
  category: string
  /**
   * Resolved via classification, same as `ProductType.department`. Absence is
   * meaningful — scrapers construct offers before classification runs, and
   * cached pre-migration snapshots predate this field — so consumers coerce
   * with `toDepartmentId` rather than assuming presence.
   */
  department?: DepartmentId
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
  imageCrop?: OfferImageCrop | null
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
  comparisons: ComparisonGroup[]
  /** Keyed by `OfferImageCrop.pageId`, so ~1000 leaflet offers don't each duplicate a page URL. */
  leafletPages: Record<string, LeafletPage>
  generatedAt: string
  sources: {
    kaufland: { scrapedAt: string | null; ok: boolean }
    lidl: { scrapedAt: string | null; ok: boolean }
    lidlSite: { scrapedAt: string | null; ok: boolean }
    billa: { scrapedAt: string | null; ok: boolean }
    bulmag: { scrapedAt: string | null; ok: boolean }
  }
}
