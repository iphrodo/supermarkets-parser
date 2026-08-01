import * as cheerio from 'cheerio'
import { ofetch } from 'ofetch'
import type { LoyaltyTier, Offer, OfferMechanic } from '../../../shared/types/offer'
import { computeOfferKey, computeProductKey } from '../normalize'

export const KAUFLAND_OFFERS_URL = 'https://www.kaufland.bg/aktualni-predlozheniya/oferti.html'

const KAUFLAND_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const EAN_PATTERN = /(\d{13})/
const XTRA_PATTERN = /xtra/i
const BUY_2_GET_1_PATTERN = /2\s*\+\s*1/
const BUY_1_GET_1_PATTERN = /1\s*\+\s*1/
const PURCHASE_LIMIT_PATTERN = /до\s+\d+\s*(?:бр\.?|кг)\s*на покупка/iu
const CAMPAIGN_DATE_SUFFIX_PATTERN = /\s+\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4}\s*$/

export class KauflandIngestionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'KauflandIngestionError'
  }
}

interface KauflandRawOffer {
  dateFrom: string
  dateTo: string
  title: string
  subtitle?: string
  price?: number
  discount?: number
  unit?: string
  detailTitle?: string
  detailDescription?: string
  listImage?: string
  formattedOldPrice?: string
  formattedPrice?: string
  loyaltyDiscount?: number
  loyaltyFormattedPrice?: string
  loyaltyFormattedOldPrice?: string
  prices?: {
    alternative?: {
      formatted?: {
        standard?: string
        old?: string
        loyalty?: string
        loyaltyOld?: string
      }
    }
  }
}

interface KauflandCategory {
  offerCategoryId: string
  displayName: string | null
  main: boolean
  offers: KauflandRawOffer[]
}

interface KauflandSsrPayload {
  props?: {
    offerData?: {
      cycles?: { categories?: KauflandCategory[] }[]
    }
  }
}

/** Extracts the balanced `{...}` object starting at `openBraceIndex`. */
function extractBalancedObject(text: string, openBraceIndex: number): string {
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = openBraceIndex; i < text.length; i++) {
    const char = text[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') depth++
    if (char === '}') {
      depth--
      if (depth === 0) {
        return text.slice(openBraceIndex, i + 1)
      }
    }
  }

  throw new KauflandIngestionError('Could not find end of embedded offer data payload')
}

function extractSsrPayload(html: string): KauflandSsrPayload {
  const $ = cheerio.load(html)
  const marker = 'offerData'

  for (const script of $('script').toArray()) {
    const content = $(script).html() ?? ''
    if (!content.includes(marker)) continue

    const assignmentIndex = content.indexOf('window.SSR[')
    if (assignmentIndex === -1) continue

    const openBraceIndex = content.indexOf('{', content.indexOf('=', assignmentIndex))
    if (openBraceIndex === -1) continue

    const jsonText = extractBalancedObject(content, openBraceIndex)

    try {
      return JSON.parse(jsonText) as KauflandSsrPayload
    } catch (error) {
      throw new KauflandIngestionError('Failed to parse embedded offer data payload', { cause: error })
    }
  }

  throw new KauflandIngestionError('Could not locate embedded offer data payload on Kaufland offers page')
}

function parseMoneyToCents(formatted: string | undefined | null): number | null {
  if (!formatted) return null
  const match = formatted.match(/([\d.,]+)/)
  if (!match) return null

  const normalized = match[1].replace(/\./g, '').replace(',', '.')
  const value = Number.parseFloat(normalized)
  if (Number.isNaN(value)) return null

  return Math.round(value * 100)
}

function deriveEan(imageUrl: string | undefined): string | null {
  if (!imageUrl) return null
  const match = imageUrl.match(EAN_PATTERN)
  return match ? match[1] : null
}

function deriveLoyaltyTier(raw: KauflandRawOffer): LoyaltyTier {
  if (!raw.loyaltyFormattedPrice) return 'none'
  return XTRA_PATTERN.test(raw.detailTitle ?? '') ? 'kaufland_card_xtra' : 'kaufland_card'
}

function deriveMechanic(raw: KauflandRawOffer): OfferMechanic {
  const text = `${raw.detailTitle ?? ''} ${raw.detailDescription ?? ''}`
  if (BUY_2_GET_1_PATTERN.test(text)) return 'buy_2_get_1_free'
  if (BUY_1_GET_1_PATTERN.test(text)) return 'buy_1_get_1_free'
  return 'standard'
}

function derivePurchaseLimit(raw: KauflandRawOffer): string | null {
  const text = `${raw.subtitle ?? ''}\n${raw.detailDescription ?? ''}`
  const match = text.match(PURCHASE_LIMIT_PATTERN)
  return match ? match[0].replace(/\s+/g, ' ').trim() : null
}

function deriveCampaignName(category: KauflandCategory): string | null {
  if (category.main || !category.displayName) return null
  return category.displayName.replace(CAMPAIGN_DATE_SUFFIX_PATTERN, '').trim()
}

function mapOffer(raw: KauflandRawOffer, category: KauflandCategory, scrapedAt: string): Offer {
  const brand = raw.subtitle ? (raw.title ?? null) : null
  const name = (raw.subtitle || raw.title || '').replace(/\n/g, ' ').trim()
  const unitText = raw.unit ?? ''
  const ean = deriveEan(raw.listImage)

  const eurPrice = raw.loyaltyFormattedPrice ?? raw.formattedPrice
  const eurOldPrice = raw.loyaltyFormattedOldPrice ?? raw.formattedOldPrice
  const bgn = raw.prices?.alternative?.formatted
  const bgnPrice = bgn?.loyalty ?? bgn?.standard

  const priceEurCents = parseMoneyToCents(eurPrice) ?? 0
  const discountPercentage = raw.discount ?? raw.loyaltyDiscount ?? 0

  const productKey = computeProductKey({ retailer: 'kaufland', name, unitText, ean })
  const offerKey = computeOfferKey(productKey, raw.dateFrom)

  return {
    offerKey,
    productKey,
    retailer: 'kaufland',
    brand,
    name,
    unitText,
    category: category.displayName
      ? category.displayName.replace(CAMPAIGN_DATE_SUFFIX_PATTERN, '').trim()
      : 'Други',
    campaign: deriveCampaignName(category),
    discountPercentage,
    priceEurCents,
    priceBgnCents: parseMoneyToCents(bgnPrice),
    originalPriceEurCents: parseMoneyToCents(eurOldPrice),
    loyaltyTier: deriveLoyaltyTier(raw),
    mechanic: deriveMechanic(raw),
    purchaseLimit: derivePurchaseLimit(raw),
    ean,
    imageUrl: raw.listImage ?? null,
    scope: 'national',
    store: null,
    validFrom: raw.dateFrom,
    validUntil: raw.dateTo,
    sourceUrl: KAUFLAND_OFFERS_URL,
    scrapedAt,
    warnings: [],
  }
}

export async function fetchKauflandOffers(): Promise<Offer[]> {
  let html: string
  try {
    html = await ofetch(KAUFLAND_OFFERS_URL, {
      headers: { 'User-Agent': KAUFLAND_USER_AGENT },
    })
  } catch (error) {
    throw new KauflandIngestionError('Failed to fetch Kaufland offers page', { cause: error })
  }

  return parseKauflandHtml(html)
}

/** Exported separately so fixture-based tests never need to hit the network. */
export function parseKauflandHtml(html: string): Offer[] {
  const scrapedAt = new Date().toISOString()
  const payload = extractSsrPayload(html)
  const currentCycle = payload.props?.offerData?.cycles?.[0]

  if (!currentCycle?.categories) {
    throw new KauflandIngestionError('Embedded offer data payload had no categories for the current cycle')
  }

  const offers: Offer[] = []
  for (const category of currentCycle.categories) {
    for (const raw of category.offers ?? []) {
      offers.push(mapOffer(raw, category, scrapedAt))
    }
  }

  return offers
}
