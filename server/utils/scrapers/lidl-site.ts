import { ofetch } from 'ofetch'
import type { Offer } from '../../../shared/types/offer'
import { computeOfferKey, computeProductKey } from '../normalize'

export const LIDL_SITE_SEARCH_URL = 'https://www.lidl.bg/q/api/search'
export const LIDL_SITE_SOURCE_URL_PREFIX = 'https://www.lidl.bg'

const LIDL_SITE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/**
 * The endpoint caps a page at 108 regardless of what is requested, so the
 * offset always advances by the number of items actually returned. The page
 * bound is a safety net against a non-terminating result set, not a real limit:
 * the whole catalogue is ~6 pages.
 */
const PAGE_SIZE = 108
const MAX_PAGES = 20

/**
 * Second segment of `keyfacts.wonCategoryPrimaryPath` — the retailer's stable
 * numeric top-level department ids. `17` = Храна и близки до нея храни,
 * `10` = Вино, бира и спиртни напитки. Everything else is a non-food range with
 * no cross-retailer equivalent to compare against.
 */
const FOOD_DEPARTMENT_IDS = new Set(['17', '10'])

/** `en-CA` renders `YYYY-MM-DD` directly; the offers are Bulgarian, so the dates are Sofia's. */
const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Sofia',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const PERCENTAGE_PATTERN = /(\d+)\s*%/
/** "27% безплатно" is a quantity promotion, not a price cut, so its percentage is not a discount. */
const QUANTITY_PROMOTION_PATTERN = /безплатно/i

export class LidlSiteIngestionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'LidlSiteIngestionError'
  }
}

/**
 * Only the fields this source reads, all optional: the payload is an
 * undocumented storefront interface, so every field is validated at the
 * boundary rather than trusted.
 */
interface RawDiscount {
  percentageDiscount?: number | null
  discountText?: string | null
}

interface RawPrice {
  price?: number | null
  priceSecond?: number | null
  oldPrice?: number | null
  discount?: RawDiscount | null
  packaging?: { text?: string | null } | null
}

interface RawValidityBadge {
  validFrom?: number | null
  validUntil?: number | null
}

interface RawProduct {
  erpNumber?: string | null
  fullTitle?: string | null
  canonicalPath?: string | null
  image?: string | null
  ians?: string[] | null
  lidlPlus?: unknown[] | null
  brand?: { name?: string | null } | null
  price?: RawPrice | null
  keyfacts?: { wonCategoryPrimary?: string | null; wonCategoryPrimaryPath?: string | null } | null
  stockAvailability?: { badgeInfoV2?: RawValidityBadge[] | null } | null
}

interface RawItem {
  gridbox?: { data?: RawProduct | null } | null
}

export interface LidlSiteSearchPage {
  numFound?: number | null
  items?: RawItem[] | null
}

export interface ParseLidlSiteDeps {
  logWarning?: (message: string) => void
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

/**
 * Unix seconds → `YYYY-MM-DD`, the calendar-date form every other source
 * publishes. The window boundaries are Sofia-local midnight, so converting via
 * UTC would date every `validFrom` a day early (summer offset +03:00).
 */
function toDateOnly(unixSeconds: number): string {
  return DATE_FORMATTER.format(new Date(unixSeconds * 1000))
}

function departmentId(categoryPath: string): string | null {
  return categoryPath.split('/')[1] ?? null
}

interface ResolvedDiscount {
  percentage: number
  warnings: string[]
}

/**
 * Only 107 of ~370 discounted products carry a structured `percentageDiscount`;
 * the rest state it only in the label, and a few state no percentage at all.
 * An unquantified reduction is published as `0` with a warning rather than
 * dropped, since the price itself is still correct.
 */
function resolveDiscount(discount: RawDiscount, productName: string): ResolvedDiscount {
  const label = typeof discount.discountText === 'string' ? discount.discountText.trim() : ''
  const warnings: string[] = []

  // "27% безплатно" gives more product for the same money rather than cutting
  // the price, so its percentage is not comparable to a price reduction.
  if (QUANTITY_PROMOTION_PATTERN.test(label)) {
    warnings.push(`Discount label "${label}" describes a quantity promotion rather than a price reduction, for "${productName}"`)
  }

  if (typeof discount.percentageDiscount === 'number' && Number.isFinite(discount.percentageDiscount)) {
    return { percentage: discount.percentageDiscount, warnings }
  }

  const match = label.match(PERCENTAGE_PATTERN)
  if (match) {
    return { percentage: Number.parseInt(match[1]!, 10), warnings }
  }

  warnings.push(`Discount label "${label}" states no percentage, so the reduction could not be quantified for "${productName}"`)
  return { percentage: 0, warnings }
}

function hasDiscountIndication(discount: RawDiscount | null | undefined): discount is RawDiscount {
  if (!discount) return false
  if (typeof discount.percentageDiscount === 'number') return true
  return typeof discount.discountText === 'string' && discount.discountText.trim() !== ''
}

/**
 * Constructs the offer without an `imageCrop` key at all — this source
 * publishes product photographs as their own images, and `deal-catalog`
 * requires the unused image form to be structurally absent, not null.
 */
function mapOffer(product: RawProduct, validFrom: string, validUntil: string, scrapedAt: string): Offer {
  const price = product.price!
  const name = product.fullTitle!.trim()
  const unitText = typeof price.packaging?.text === 'string' ? price.packaging.text.trim() : ''
  const { percentage, warnings } = resolveDiscount(price.discount!, name)

  if (Array.isArray(product.lidlPlus) && product.lidlPlus.length > 0) {
    warnings.push(`Product "${name}" also carries a Lidl Plus price, which is not ingested`)
  }

  // `ians` are Lidl's internal article numbers (3–7 digits), not EAN-13
  // barcodes; publishing one as `ean` would establish cross-retailer identity
  // on a number that means nothing outside Lidl.
  const productKey = computeProductKey({ retailer: 'lidl', name, unitText, ean: null })

  return {
    offerKey: computeOfferKey(productKey, validFrom),
    productKey,
    retailer: 'lidl',
    brand: typeof product.brand?.name === 'string' ? product.brand.name.trim() : null,
    name,
    unitText,
    category: typeof product.keyfacts?.wonCategoryPrimary === 'string' ? product.keyfacts.wonCategoryPrimary : '',
    campaign: null,
    discountPercentage: percentage,
    priceEurCents: toCents(price.price!),
    priceBgnCents: typeof price.priceSecond === 'number' ? toCents(price.priceSecond) : null,
    // `oldPrice: 0` means "no previous price published", never "previously free".
    originalPriceEurCents: typeof price.oldPrice === 'number' && price.oldPrice > 0 ? toCents(price.oldPrice) : null,
    loyaltyTier: 'none',
    mechanic: 'standard',
    purchaseLimit: null,
    ean: null,
    imageUrl: typeof product.image === 'string' && product.image !== '' ? product.image : null,
    scope: 'national',
    store: null,
    validFrom,
    validUntil,
    sourceUrl: `${LIDL_SITE_SOURCE_URL_PREFIX}${product.canonicalPath}`,
    scrapedAt,
    warnings,
  }
}

/** Exported separately so fixture-based tests never need the network or a frozen clock. */
export function parseLidlSiteResponse(
  pages: LidlSiteSearchPage[],
  now: Date,
  deps: ParseLidlSiteDeps = {},
): Offer[] {
  const logWarning = deps.logWarning ?? ((message: string) => console.warn(message))
  const scrapedAt = now.toISOString()
  const nowSeconds = Math.floor(now.getTime() / 1000)

  const items = pages.flatMap((page) => {
    if (!Array.isArray(page.items)) {
      throw new LidlSiteIngestionError('Lidl site search response has no items array')
    }
    return page.items
  })

  const offers: Offer[] = []
  const seen = new Set<string>()

  for (const item of items) {
    // Entries without a gridbox are non-product results (advisors, teasers).
    const product = item?.gridbox?.data
    if (!product) continue

    const erpNumber = product.erpNumber
    if (typeof erpNumber !== 'string' || erpNumber === '') continue
    if (seen.has(erpNumber)) continue
    seen.add(erpNumber)

    if (typeof product.fullTitle !== 'string' || product.fullTitle.trim() === '') continue
    if (typeof product.canonicalPath !== 'string' || product.canonicalPath === '') continue

    // Validity comes from the structured timestamps, never from the badge's
    // display text or its undocumented `type` enum.
    const badge = product.stockAvailability?.badgeInfoV2?.[0]
    if (typeof badge?.validFrom !== 'number' || typeof badge?.validUntil !== 'number') continue
    if (badge.validFrom > nowSeconds || badge.validUntil < nowSeconds) continue

    const categoryPath = product.keyfacts?.wonCategoryPrimaryPath
    if (typeof categoryPath !== 'string') continue
    const department = departmentId(categoryPath)
    if (!department || !FOOD_DEPARTMENT_IDS.has(department)) continue

    if (typeof product.price?.price !== 'number' || !Number.isFinite(product.price.price)) continue
    if (!hasDiscountIndication(product.price.discount)) continue

    offers.push(mapOffer(product, toDateOnly(badge.validFrom), toDateOnly(badge.validUntil), scrapedAt))
  }

  // A category-id re-issue or a schema change shows up as this count collapsing,
  // rather than as silently wrong data.
  logWarning(`Lidl site ingestion: ${offers.length} live discounted food offer(s) from ${items.length} listing entries`)

  return offers
}

/** Distinguishes this source's offers from the XLSX-based Lidl source, both of which share `retailer: 'lidl'`. */
export function isLidlSiteOffer(offer: Offer): boolean {
  return offer.retailer === 'lidl' && offer.sourceUrl.startsWith(`${LIDL_SITE_SOURCE_URL_PREFIX}/p/`)
}

export interface FetchLidlSiteOffersDeps {
  logWarning?: (message: string) => void
  now?: () => Date
}

export async function fetchLidlSiteOffers(deps: FetchLidlSiteOffersDeps = {}): Promise<Offer[]> {
  const now = deps.now ?? (() => new Date())

  const pages: LidlSiteSearchPage[] = []
  let offset = 0
  let numFound = Number.POSITIVE_INFINITY

  for (let request = 0; request < MAX_PAGES; request += 1) {
    let page: LidlSiteSearchPage
    try {
      page = await ofetch<LidlSiteSearchPage>(LIDL_SITE_SEARCH_URL, {
        query: {
          assortment: 'BG',
          locale: 'bg_BG',
          version: 'v2.0.0',
          fetchsize: PAGE_SIZE,
          offset,
        },
        headers: { 'User-Agent': LIDL_SITE_USER_AGENT },
      })
    } catch (error) {
      throw new LidlSiteIngestionError(`Failed to fetch the Lidl site product listing at offset ${offset}`, {
        cause: error,
      })
    }

    if (!Array.isArray(page.items)) {
      throw new LidlSiteIngestionError(`Lidl site product listing at offset ${offset} had no items array`)
    }

    pages.push(page)

    if (typeof page.numFound === 'number') numFound = page.numFound

    // Advance by what was actually returned, never by what was requested — the
    // server caps the page size below the request and does not say so.
    if (page.items.length === 0) break
    offset += page.items.length
    if (offset >= numFound) break
  }

  return parseLidlSiteResponse(pages, now(), { logWarning: deps.logWarning })
}
