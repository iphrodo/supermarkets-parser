import { ofetch } from 'ofetch'
import type { Offer } from '../../../shared/types/offer'
import { computeOfferKey, computeProductKey } from '../normalize'

export const BULMAG_API_BASE = 'https://api.bulmag.org/api/main/products'
export const BULMAG_PRODUCT_URL_PREFIX = 'https://bulmag.org/product'
/** `"АКЦИЯ-БРОШУРА"` — the tag distinguishing the weekly-brochure subset from BulMag's full always-on discount catalog. */
export const BULMAG_BROCHURE_TAG_ID = 1973

const BULMAG_ORIGIN = 'https://bulmag.org'
const BULMAG_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** The endpoint caps a page at ~60 regardless of what is requested, so pagination always advances by what was actually returned. */
const REQUESTED_PAGE_SIZE = 100
const MAX_PAGES = 20
const DATE_PROBE_SAMPLE_SIZE = 5

const MAX_RETRY_ATTEMPTS = 4
const RETRY_BASE_DELAY_MS = 500
/** Small pacing gap between successive requests; this is the first source making more than ~2 requests/run. */
const REQUEST_PACING_MS = 300
const RETRYABLE_STATUS_CODES = new Set([403, 429, 500, 502, 503, 504])

const BULMAG_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/

const WEIGHT_VOLUME_UNIT_ALTERNATION = 'г|гр|кг|мл|л|бр|броя|брой'
const MULTIPACK_NAME_PATTERN = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*[xх×]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${WEIGHT_VOLUME_UNIT_ALTERNATION})(?![a-zа-я])`,
  'gi',
)
const SIMPLE_NAME_PATTERN = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${WEIGHT_VOLUME_UNIT_ALTERNATION})(?![a-zа-я])`, 'gi')

export class BulmagIngestionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'BulmagIngestionError'
  }
}

interface RawBulmagSpecialTag {
  id?: number | null
  name?: string | null
  image?: string | null
}

/**
 * Only the fields this source reads, all optional: the payload is an
 * undocumented storefront interface, so every field is validated at the
 * boundary rather than trusted.
 */
interface RawBulmagListItem {
  price?: number | null
  priceBgn?: number | null
  promoPrice?: number | null
  promoPriceBgn?: number | null
  discount?: number | null
  brand?: string | null
  name?: string | null
  slug?: string | null
  productTypeName?: string | null
  measure?: string | null
  imageThumbnail?: string | null
  specialTags?: { topLeft?: RawBulmagSpecialTag[] | null; topRight?: RawBulmagSpecialTag[] | null } | null
}

interface BulmagListData {
  data?: RawBulmagListItem[] | null
  totalItems?: number | null
}

export interface BulmagListResponse {
  data?: BulmagListData | null
}

interface RawBulmagDetail {
  promotionFrom?: string | null
  promotionTo?: string | null
}

export interface BulmagDetailResponse {
  data?: RawBulmagDetail | null
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

/** `DD.MM.YYYY` → `YYYY-MM-DD`, the calendar-date form every other source publishes. */
function parseBulmagDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const match = value.match(BULMAG_DATE_PATTERN)
  if (!match) return null
  const [, day, month, year] = match
  return `${year}-${month}-${day}`
}

function lastMatch(pattern: RegExp, text: string): RegExpMatchArray | null {
  const matches = [...text.matchAll(pattern)]
  return matches.length > 0 ? matches[matches.length - 1]! : null
}

/** BulMag has no quantity field; the pack size, when stated, trails the product name (e.g. "...400гр", "...4х85гр"). */
function deriveUnitTextFromName(name: string): string | null {
  const multipack = lastMatch(MULTIPACK_NAME_PATTERN, name)
  if (multipack) {
    return `${multipack[1]} х ${multipack[2]} ${multipack[3]}`
  }

  const simple = lastMatch(SIMPLE_NAME_PATTERN, name)
  if (simple) {
    return `${simple[1]} ${simple[2]}`
  }

  return null
}

interface UnitTextResult {
  unitText: string
  warning: string | null
}

/**
 * (1) a quantity embedded in the name, (2) `measure === 'БР'` implies a
 * single-piece default even with no stated size, (3) anything else (loose-weight
 * items sold per kg with no fixed pack size) is published with an empty
 * `unitText` and a warning rather than a guessed quantity.
 */
function deriveUnitText(item: RawBulmagListItem, name: string): UnitTextResult {
  const fromName = deriveUnitTextFromName(name)
  if (fromName) return { unitText: fromName, warning: null }

  if (item.measure === 'БР') {
    return { unitText: '1 бр', warning: null }
  }

  return {
    unitText: '',
    warning: `Could not derive a confident unit quantity for "${name}"; excluded from unit-price comparison`,
  }
}

/** `price: 0` or `price === promoPrice` means "no distinct previous price", never "previously free". */
function deriveOriginalPriceEurCents(item: RawBulmagListItem): number | null {
  const price = item.price
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null
  if (typeof item.promoPrice === 'number' && price === item.promoPrice) return null
  return toCents(price)
}

function specialTagLabel(tag: RawBulmagSpecialTag): string {
  return tag.name || tag.image || `id:${tag.id ?? 'unknown'}`
}

/** Diagnostic only: surfaces any badge vocabulary (e.g. a BOGO-style tag) this mapping does not yet interpret. */
function collectSpecialTagLabels(items: RawBulmagListItem[]): string[] {
  const labels = new Set<string>()
  for (const item of items) {
    const entries = [...(item.specialTags?.topLeft ?? []), ...(item.specialTags?.topRight ?? [])]
    for (const entry of entries) {
      if (entry) labels.add(specialTagLabel(entry))
    }
  }
  return [...labels].sort()
}

function mapOffer(item: RawBulmagListItem, validFrom: string, validUntil: string, scrapedAt: string): Offer | null {
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  const slug = typeof item.slug === 'string' ? item.slug.trim() : ''
  if (!name || !slug) return null
  if (typeof item.promoPrice !== 'number' || !Number.isFinite(item.promoPrice)) return null

  const { unitText, warning } = deriveUnitText(item, name)

  // No EAN/barcode anywhere in BulMag's API — only internal `number`/`id`
  // codes, which are BulMag-specific and would falsely assert cross-retailer
  // identity if published as `ean`.
  const productKey = computeProductKey({ retailer: 'bulmag', name, unitText, ean: null })

  return {
    offerKey: computeOfferKey(productKey, validFrom),
    productKey,
    retailer: 'bulmag',
    brand: typeof item.brand === 'string' && item.brand.trim() !== '' ? item.brand.trim() : null,
    name,
    unitText,
    category: typeof item.productTypeName === 'string' ? item.productTypeName : '',
    campaign: null,
    discountPercentage: typeof item.discount === 'number' ? item.discount : 0,
    priceEurCents: toCents(item.promoPrice),
    priceBgnCents: typeof item.promoPriceBgn === 'number' ? toCents(item.promoPriceBgn) : null,
    originalPriceEurCents: deriveOriginalPriceEurCents(item),
    loyaltyTier: 'none',
    mechanic: 'standard',
    purchaseLimit: null,
    ean: null,
    imageUrl: typeof item.imageThumbnail === 'string' && item.imageThumbnail !== '' ? item.imageThumbnail : null,
    scope: 'national',
    store: null,
    validFrom,
    validUntil,
    sourceUrl: `${BULMAG_PRODUCT_URL_PREFIX}/${slug}`,
    scrapedAt,
    warnings: warning ? [warning] : [],
  }
}

export interface BulmagValidityWindow {
  validFrom: string
  validUntil: string
}

export interface ParseBulmagOffersDeps {
  logWarning?: (message: string) => void
}

/** Exported separately so fixture-based tests never need the network or a frozen clock. */
export function parseBulmagOffers(
  items: RawBulmagListItem[],
  validity: BulmagValidityWindow,
  now: Date,
  deps: ParseBulmagOffersDeps = {},
): Offer[] {
  const logWarning = deps.logWarning ?? ((message: string) => console.warn(message))
  const scrapedAt = now.toISOString()

  const offers: Offer[] = []
  const seenSlugs = new Set<string>()

  for (const item of items) {
    const slug = typeof item.slug === 'string' ? item.slug : ''
    if (slug && seenSlugs.has(slug)) continue

    const offer = mapOffer(item, validity.validFrom, validity.validUntil, scrapedAt)
    if (!offer) continue

    if (slug) seenSlugs.add(slug)
    offers.push(offer)
  }

  const specialTagLabels = collectSpecialTagLabels(items)
  if (specialTagLabels.length > 0) {
    logWarning(`Bulmag ingestion: distinct special tags observed — ${specialTagLabels.join(', ')}`)
  }

  logWarning(`Bulmag ingestion: ${offers.length} brochure offer(s) from ${items.length} listed item(s)`)

  return offers
}

function sampleSlugsForProbing(items: RawBulmagListItem[], sampleSize: number): string[] {
  const slugs = items.map((item) => item.slug).filter((slug): slug is string => typeof slug === 'string' && slug !== '')
  const distinct = [...new Set(slugs)]
  if (distinct.length <= sampleSize) return distinct

  const step = Math.floor(distinct.length / sampleSize)
  const sampled: string[] = []
  for (let i = 0; i < sampleSize; i++) {
    const slug = distinct[i * step]
    if (slug) sampled.push(slug)
  }
  return [...new Set(sampled)]
}

function statusCodeOf(error: unknown): number | undefined {
  const candidate = error as { statusCode?: number; status?: number } | null
  return candidate?.statusCode ?? candidate?.status
}

async function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Exported so retry/backoff behavior is directly testable (fails N times then
 * succeeds; exhausts retries and throws) without real network calls or timers.
 */
export async function withRetry<T>(fn: () => Promise<T>, deps: { sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const sleep = deps.sleep ?? defaultSleep
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const status = statusCodeOf(error)
      const isRetryable = typeof status === 'number' && RETRYABLE_STATUS_CODES.has(status)
      if (!isRetryable || attempt === MAX_RETRY_ATTEMPTS - 1) throw error
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt)
    }
  }

  throw lastError
}

export type BulmagRequest = <T>(url: string, query: Record<string, string | number>) => Promise<T>

async function defaultRequest<T>(url: string, query: Record<string, string | number>): Promise<T> {
  return ofetch<T>(url, {
    query,
    headers: {
      'User-Agent': BULMAG_USER_AGENT,
      // ofetch sends no Accept header by default; Bulmag's WAF 403s that
      // consistently (confirmed live), independent of the intermittent 403s
      // under load that the retry helper exists for.
      Accept: 'application/json, text/plain, */*',
      Origin: BULMAG_ORIGIN,
      Referer: `${BULMAG_ORIGIN}/`,
    },
  })
}

export interface FetchBulmagOffersDeps {
  request?: BulmagRequest
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  logWarning?: (message: string) => void
}

export async function fetchBulmagOffers(deps: FetchBulmagOffersDeps = {}): Promise<Offer[]> {
  const request = deps.request ?? defaultRequest
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? (() => new Date())
  const logWarning = deps.logWarning ?? ((message: string) => console.warn(message))

  function fetchListPage(page: number, tagged: boolean): Promise<BulmagListResponse> {
    const query: Record<string, string | number> = { isPromo: 1, page, itemsPerPage: REQUESTED_PAGE_SIZE }
    if (tagged) query.productTagIds = BULMAG_BROCHURE_TAG_ID
    return withRetry(() => request<BulmagListResponse>(BULMAG_API_BASE, query), { sleep })
  }

  // 1. Fetch the first brochure-tagged page and verify the tag genuinely
  // narrows the catalog before trusting it for the rest of the run — per the
  // "Brochure tag filter cannot be confirmed" requirement, a filter that
  // stops working must fail the run rather than silently ingest the full
  // always-on discount catalog in its place.
  let firstTaggedPage: BulmagListResponse
  try {
    firstTaggedPage = await fetchListPage(1, true)
  } catch (error) {
    throw new BulmagIngestionError('Failed to fetch the first page of the Bulmag brochure listing', { cause: error })
  }

  const taggedTotal = firstTaggedPage.data?.totalItems
  if (typeof taggedTotal !== 'number' || !Array.isArray(firstTaggedPage.data?.data)) {
    throw new BulmagIngestionError('Bulmag brochure listing response had an unexpected shape')
  }

  await sleep(REQUEST_PACING_MS)

  let untaggedTotal: number
  try {
    const untaggedPage = await fetchListPage(1, false)
    if (typeof untaggedPage.data?.totalItems !== 'number') {
      throw new BulmagIngestionError('Bulmag full catalog listing response had an unexpected shape')
    }
    untaggedTotal = untaggedPage.data.totalItems
  } catch (error) {
    if (error instanceof BulmagIngestionError) throw error
    throw new BulmagIngestionError('Failed to verify the brochure tag filter against the full Bulmag catalog', {
      cause: error,
    })
  }

  if (taggedTotal >= untaggedTotal) {
    throw new BulmagIngestionError(
      `Bulmag's brochure tag filter no longer appears to narrow the catalog (tagged: ${taggedTotal}, full: ${untaggedTotal}); refusing to fall back to the full always-on discount catalog`,
    )
  }

  // 2. Paginate the rest of the tagged listing, advancing by what's actually
  // returned rather than the requested page size.
  const items: RawBulmagListItem[] = [...firstTaggedPage.data.data]
  for (let page = 2; page <= MAX_PAGES && items.length < taggedTotal; page++) {
    await sleep(REQUEST_PACING_MS)
    let listPage: BulmagListResponse
    try {
      listPage = await fetchListPage(page, true)
    } catch (error) {
      throw new BulmagIngestionError(`Failed to fetch page ${page} of the Bulmag brochure listing`, { cause: error })
    }
    if (!Array.isArray(listPage.data?.data)) {
      throw new BulmagIngestionError(`Bulmag brochure listing page ${page} had no items array`)
    }
    if (listPage.data.data.length === 0) break
    items.push(...listPage.data.data)
  }

  // 3. Sample a handful of listed items to establish the shared validity
  // window rather than probing all ~300 — the listing itself never carries
  // `promotionFrom`/`promotionTo`.
  const sampleSlugs = sampleSlugsForProbing(items, DATE_PROBE_SAMPLE_SIZE)
  const probedWindows: BulmagValidityWindow[] = []

  for (const slug of sampleSlugs) {
    await sleep(REQUEST_PACING_MS)
    try {
      const detail = await withRetry(() => request<BulmagDetailResponse>(`${BULMAG_API_BASE}/${slug}`, {}), { sleep })
      const validFrom = parseBulmagDate(detail.data?.promotionFrom)
      const validUntil = parseBulmagDate(detail.data?.promotionTo)
      if (validFrom && validUntil) {
        probedWindows.push({ validFrom, validUntil })
      } else {
        logWarning(`Bulmag date-window probe for "${slug}" returned an unparseable promotion date`)
      }
    } catch (error) {
      logWarning(`Bulmag date-window probe for "${slug}" failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (probedWindows.length === 0) {
    throw new BulmagIngestionError('Could not determine the Bulmag brochure validity window from any sampled product')
  }

  const distinctWindows = new Set(probedWindows.map((window) => `${window.validFrom}:${window.validUntil}`))
  if (distinctWindows.size > 1) {
    throw new BulmagIngestionError(
      `Sampled Bulmag products disagree on the brochure validity window (${[...distinctWindows].join(', ')}); refusing to guess or average one`,
    )
  }

  return parseBulmagOffers(items, probedWindows[0]!, now(), { logWarning })
}
