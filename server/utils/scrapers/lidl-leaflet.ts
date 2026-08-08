import * as cheerio from 'cheerio'
import { Type } from '@google/genai'
import { ofetch } from 'ofetch'
import type { BoundingBox2d, LeafletPage, Offer, OfferImageCrop } from '../../../shared/types/offer'
import { readLastLidlLeafletSlug, readSnapshot, writeLastLidlLeafletSlug } from '../kv'
import { computeOfferKey, computeProductKey } from '../normalize'
import { rejectOverlappingBoxes, sanitizeBox } from './bounding-box'
import {
  extractStructuredDataFromImage,
  fetchPageImages,
  mapWithConcurrency,
  selectPagesByPrefix,
  type PageDisplayImage,
  type PageImageRef,
} from './vision-extraction'

export const LIDL_LEAFLET_LISTING_URL = 'https://www.lidl.bg/c/broshura/s10020060'
export const FLYER_API_URL = 'https://endpoints.leaflets.schwarz/v4/flyer'
/** The weekly leaflet's validity period spans exactly this many days (Monday–Sunday). */
export const WEEKLY_WINDOW_DAYS = 7
export const LIDL_LEAFLET_SOURCE_URL_PREFIX = 'https://www.lidl.bg/l/bg/broshura/'
export const LIDL_LEAFLET_PAGE_ID_PREFIX = 'lidl-leaflet:'
export const VISION_CONCURRENCY = 4

const VISION_MODEL = 'gemini-3.5-flash-lite'
const SLUG_PATTERN = /\/l\/bg\/broshura\/([^/]+)\/ar\/0/
const MS_PER_DAY = 24 * 60 * 60 * 1000

export class LidlLeafletIngestionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'LidlLeafletIngestionError'
  }
}

interface LidlFlyerPage {
  number: number
  /** The largest signed variant; submitted for vision extraction. */
  zoom: string
  /** A smaller signed variant; recorded for client-side crops. Unlisted sizes cannot be forged (see design.md). */
  image: string
  /** Original page dimensions — only their ratio is used, so no rescaling to the `image` variant is needed. */
  width: number
  height: number
}

interface LidlFlyer {
  title: string
  startDate: string
  endDate: string
  offerStartDate: string
  offerEndDate: string
  pages: LidlFlyerPage[]
}

/** Exported separately so fixture-based tests never need to hit the network. */
export function discoverLeafletSlugs(html: string): string[] {
  const $ = cheerio.load(html)
  const slugs = new Set<string>()

  $('a.flyer[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const match = href.match(SLUG_PATTERN)
    if (match) slugs.add(match[1]!)
  })

  return Array.from(slugs)
}

async function fetchFlyer(slug: string): Promise<LidlFlyer> {
  let response: { flyer: LidlFlyer }
  try {
    response = await ofetch<{ flyer: LidlFlyer }>(FLYER_API_URL, { params: { flyer_identifier: slug } })
  } catch (error) {
    throw new LidlLeafletIngestionError(`Failed to fetch flyer metadata for slug "${slug}"`, { cause: error })
  }
  return response.flyer
}

/**
 * Fetches every candidate leaflet's metadata in parallel and picks the one
 * whose validity window is exactly `WEEKLY_WINDOW_DAYS` days long, which
 * reliably distinguishes the weekly leaflet from longer-running campaign
 * leaflets also listed on the page (see design.md).
 */
export async function selectWeeklyFlyer(
  slugs: string[],
  fetchFlyerFn: (slug: string) => Promise<LidlFlyer> = fetchFlyer,
): Promise<{ slug: string; flyer: LidlFlyer }> {
  const candidates = await Promise.all(slugs.map(async (slug) => ({ slug, flyer: await fetchFlyerFn(slug) })))

  const weekly = candidates.filter(({ flyer }) => {
    const days = (new Date(flyer.offerEndDate).getTime() - new Date(flyer.offerStartDate).getTime()) / MS_PER_DAY
    return days === WEEKLY_WINDOW_DAYS - 1
  })

  if (weekly.length !== 1) {
    throw new LidlLeafletIngestionError(
      weekly.length === 0
        ? `No weekly leaflet (${WEEKLY_WINDOW_DAYS}-day validity window) found among Lidl leaflet candidates`
        : `Ambiguous weekly leaflet: found ${weekly.length} candidates with a ${WEEKLY_WINDOW_DAYS}-day validity window`,
    )
  }

  return weekly[0]!
}

interface LidlPageImageRef extends PageImageRef {
  display: PageDisplayImage | null
}

function toPageImageRefs(flyer: LidlFlyer): LidlPageImageRef[] {
  return [...flyer.pages]
    .sort((a, b) => a.number - b.number)
    .map((page) => ({
      pageNumber: page.number,
      imageUrl: page.zoom,
      display: page.image && page.width && page.height
        ? { imageUrl: page.image, width: page.width, height: page.height }
        : null,
    }))
}

export interface LidlLeafletExtractedItem {
  /**
   * `[ymin, xmin, ymax, xmax]` normalized to 0–1000. snake_case deliberately,
   * against the surrounding convention: it is the identifier Gemini models are
   * trained on for detection, and renaming it costs accuracy for cosmetics.
   */
  box_2d: number[] | null
  /** Whether the box tightly encloses exactly one product's photo; required for gating. */
  boxConfident: boolean
  name: string
  brand: string | null
  unitText: string | null
  category: string | null
  priceEurCents: number | null
  originalPriceEurCents: number | null
  discountPercentage: number | null
  /** Whether the model is confident in `priceEurCents`; required for gating. */
  priceConfident: boolean
  /** Names of non-critical fields (brand, unitText, category) extracted with lower confidence. */
  uncertainFields: string[]
}

export interface LidlLeafletExtractedPage {
  pageNumber: number
  items: LidlLeafletExtractedItem[]
  /** Absent when the page's display variant or its dimensions were unavailable; then no crops are emitted for it. */
  display?: PageDisplayImage | null
}

const EXTRACTION_PROMPT = `You are reading one page of a Bulgarian supermarket (LIDL) weekly promotional leaflet.

Identify every distinct product offer shown on this page. For each one, extract:
- box_2d: the bounding box of the product's PHOTOGRAPH on this page, as [ymin, xmin, ymax, xmax] normalized to 0-1000. Box the photo of the product itself — not its price bubble, discount badge, or text block, and not the whole promotional tile. Use null if this offer has no photograph of its own.
- boxConfident: true only if box_2d tightly encloses exactly one product's photograph. A box belongs to exactly one offer: if two offers share a single photograph, set box_2d to null for both of them rather than giving the same region to each.
- name: the product name, in Bulgarian as printed
- brand: the brand name if shown separately from the product name, else null
- unitText: the pack size / net quantity text (e.g. "500 г", "1 л"), else null
- category: a short category label if inferable from the page layout (e.g. "Месо", "Млечни"), else null
- priceEurCents: the current/discounted price in EUR, as an integer number of cents (e.g. 2.49 EUR -> 249). If only BGN is shown, convert using 1 EUR = 1.95583 BGN.
- originalPriceEurCents: the crossed-out original price in EUR cents, if shown, else null
- discountPercentage: the discount percentage if printed (e.g. on a badge), else 0
- priceConfident: true only if you can clearly and unambiguously read the price
- uncertainFields: list any of "brand", "unitText", "category" that you extracted but are not confident about

Do not extract validity dates — this leaflet's validity period is tracked separately and does not need to be read from the page.
Do not guess a price you cannot clearly read — set priceConfident to false instead.
If the page has no product offers (e.g. a cover, index, or legal/terms page), return an empty items array.`

const EXTRACTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          // No minItems/maxItems: they are string-typed in @google/genai, so the
          // length is validated in `sanitizeBox` instead.
          box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER }, nullable: true },
          boxConfident: { type: Type.BOOLEAN },
          name: { type: Type.STRING },
          brand: { type: Type.STRING, nullable: true },
          unitText: { type: Type.STRING, nullable: true },
          category: { type: Type.STRING, nullable: true },
          priceEurCents: { type: Type.INTEGER, nullable: true },
          originalPriceEurCents: { type: Type.INTEGER, nullable: true },
          discountPercentage: { type: Type.NUMBER, nullable: true },
          priceConfident: { type: Type.BOOLEAN },
          uncertainFields: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        // Localize before describing: with constrained decoding, describe-then-localize
        // measurably degrades box quality.
        propertyOrdering: [
          'box_2d',
          'boxConfident',
          'name',
          'brand',
          'unitText',
          'category',
          'priceEurCents',
          'originalPriceEurCents',
          'discountPercentage',
          'priceConfident',
          'uncertainFields',
        ],
        required: ['name', 'priceConfident', 'boxConfident', 'uncertainFields'],
      },
    },
  },
  required: ['items'],
} as const

/** Exported separately so it can be swapped out in tests. */
export async function extractOffersFromPageImage(imageBuffer: ArrayBuffer): Promise<LidlLeafletExtractedItem[]> {
  const parsed = await extractStructuredDataFromImage<{ items?: LidlLeafletExtractedItem[] }>(
    imageBuffer,
    EXTRACTION_PROMPT,
    EXTRACTION_RESPONSE_SCHEMA,
    VISION_MODEL,
  )
  return parsed.items ?? []
}

const NON_CRITICAL_FIELDS = new Set(['brand', 'unitText', 'category'])

function mapExtractedItem(
  item: LidlLeafletExtractedItem,
  flyer: LidlFlyer,
  sourceUrl: string,
  scrapedAt: string,
  imageCrop: OfferImageCrop | null,
): Offer | null {
  if (!item.priceConfident || item.priceEurCents == null) return null

  const name = item.name.trim()
  const unitText = item.unitText?.trim() ?? ''
  const brand = item.brand?.trim() || null

  const productKey = computeProductKey({ retailer: 'lidl', name, unitText, ean: null })
  const offerKey = computeOfferKey(productKey, flyer.offerStartDate)

  const warnings = item.uncertainFields
    .filter((field) => NON_CRITICAL_FIELDS.has(field))
    .map((field) => `Field "${field}" was extracted with lower confidence for "${name}"`)

  return {
    offerKey,
    productKey,
    retailer: 'lidl',
    brand,
    name,
    unitText,
    category: item.category?.trim() || '',
    campaign: flyer.title?.trim() || null,
    discountPercentage: item.discountPercentage ?? 0,
    priceEurCents: item.priceEurCents,
    priceBgnCents: null,
    originalPriceEurCents: item.originalPriceEurCents ?? null,
    loyaltyTier: 'none',
    mechanic: 'standard',
    purchaseLimit: null,
    ean: null,
    imageCrop,
    scope: 'national',
    store: null,
    validFrom: flyer.offerStartDate,
    validUntil: flyer.offerEndDate,
    sourceUrl,
    scrapedAt,
    warnings,
  }
}

export function lidlLeafletPageId(slug: string, pageNumber: number): string {
  return `${LIDL_LEAFLET_PAGE_ID_PREFIX}${slug}:${pageNumber}`
}

/**
 * Validates one page's proposed boxes and returns the survivors by item index.
 * Runs before offers are built because overlap rejection is a page-wide
 * judgement: two items claiming one photograph both lose it.
 */
function resolvePageBoxes(items: LidlLeafletExtractedItem[]): Map<number, BoundingBox2d> {
  const candidates: { index: number; box: BoundingBox2d }[] = []

  items.forEach((item, index) => {
    if (!item.boxConfident) return
    const box = sanitizeBox(item.box_2d)
    if (box) candidates.push({ index, box })
  })

  return new Map(rejectOverlappingBoxes(candidates).map(({ index, box }) => [index, box]))
}

export interface ParseLidlLeafletExtractionResult {
  offers: Offer[]
  leafletPages: Record<string, LeafletPage>
}

export interface ParseLidlLeafletExtractionDeps {
  logWarning?: (message: string) => void
}

/**
 * Maps already-extracted, per-page structured data into offers plus the
 * registry of leaflet pages their crops reference, applying confidence gating
 * (drop unless price is confident) and taking validity dates from the leaflet's
 * own metadata rather than the extracted item. A rejected bounding box never
 * drops the offer — it only leaves it without an image.
 * Exported separately so tests can feed fixture extraction output without
 * calling the vision API.
 */
export function parseLidlLeafletExtraction(
  pages: LidlLeafletExtractedPage[],
  flyer: LidlFlyer,
  sourceUrl: string,
  slug: string,
  deps: ParseLidlLeafletExtractionDeps = {},
): ParseLidlLeafletExtractionResult {
  const scrapedAt = new Date().toISOString()
  const offers: Offer[] = []
  const leafletPages: Record<string, LeafletPage> = {}

  let proposedBoxes = 0
  let keptBoxes = 0

  for (const page of pages) {
    const boxes = resolvePageBoxes(page.items)
    const pageId = lidlLeafletPageId(slug, page.pageNumber)

    page.items.forEach((item, index) => {
      if (item.box_2d != null) proposedBoxes++

      const box = page.display ? boxes.get(index) : undefined
      const offer = mapExtractedItem(item, flyer, sourceUrl, scrapedAt, box ? { pageId, box } : null)
      if (!offer) return

      offers.push(offer)

      if (offer.imageCrop && page.display) {
        keptBoxes++
        leafletPages[pageId] ??= { ...page.display, pageNumber: page.pageNumber, sourceUrl }
      }
    })
  }

  const droppedBoxes = proposedBoxes - keptBoxes
  if (droppedBoxes > 0 && deps.logWarning) {
    deps.logWarning(
      `Lidl leaflet ingestion: dropped ${droppedBoxes} of ${proposedBoxes} product image boxes (low confidence / failed sanity checks)`,
    )
  }

  return { offers, leafletPages }
}

/** Distinguishes this source's offers from the XLSX-based Lidl source, both of which share `retailer: 'lidl'`. */
export function isLidlLeafletOffer(offer: Offer): boolean {
  return offer.retailer === 'lidl' && offer.sourceUrl.startsWith(LIDL_LEAFLET_SOURCE_URL_PREFIX)
}

export interface FetchLidlLeafletOffersDeps {
  logWarning?: (message: string) => void
}

export async function fetchLidlLeafletOffers(
  deps: FetchLidlLeafletOffersDeps = {},
): Promise<ParseLidlLeafletExtractionResult> {
  const logWarning = deps.logWarning ?? ((message: string) => console.warn(message))

  let listingHtml: string
  try {
    listingHtml = await ofetch<string>(LIDL_LEAFLET_LISTING_URL)
  } catch (error) {
    throw new LidlLeafletIngestionError('Failed to fetch Lidl leaflet listing page', { cause: error })
  }

  const slugs = discoverLeafletSlugs(listingHtml)
  if (slugs.length === 0) {
    throw new LidlLeafletIngestionError('No leaflet candidates found on the Lidl leaflet listing page')
  }

  const { slug, flyer } = await selectWeeklyFlyer(slugs)
  const sourceUrl = `${LIDL_LEAFLET_SOURCE_URL_PREFIX}${slug}/ar/0`

  const lastSlug = await readLastLidlLeafletSlug()
  if (lastSlug === slug) {
    const previous = await readSnapshot()
    if (!previous) return { offers: [], leafletPages: {} }
    return {
      offers: previous.offers.filter(isLidlLeafletOffer),
      leafletPages: selectPagesByPrefix(previous.leafletPages, LIDL_LEAFLET_PAGE_ID_PREFIX),
    }
  }

  const pageRefs = toPageImageRefs(flyer)
  const { pages: fetchedPages, skippedPages } = await fetchPageImages(pageRefs)

  if (fetchedPages.length === 0) {
    throw new LidlLeafletIngestionError('Failed to fetch any leaflet page images')
  }

  if (skippedPages.length > 0) {
    logWarning(
      `Lidl leaflet ingestion: skipped ${skippedPages.length} unfetchable leaflet page(s): ${skippedPages.join(', ')}`,
    )
  }

  const displayByPage = new Map(pageRefs.map((ref) => [ref.pageNumber, ref.display]))

  type FailedPageExtraction = { pageNumber: number; items: null; error: unknown }
  type PageExtraction = LidlLeafletExtractedPage | FailedPageExtraction

  const extractionResults = await mapWithConcurrency<typeof fetchedPages[number], PageExtraction>(
    fetchedPages,
    VISION_CONCURRENCY,
    async (page) => {
      try {
        return {
          pageNumber: page.pageNumber,
          display: displayByPage.get(page.pageNumber) ?? null,
          items: await extractOffersFromPageImage(page.imageBuffer),
        }
      } catch (error) {
        return { pageNumber: page.pageNumber, items: null, error }
      }
    },
  )

  const extractedPages = extractionResults.filter(
    (result): result is LidlLeafletExtractedPage => result.items !== null,
  )
  const failedExtractionPages = extractionResults.filter(
    (result): result is FailedPageExtraction => result.items === null,
  )

  if (extractedPages.length === 0) {
    throw new LidlLeafletIngestionError('Vision extraction failed for every fetched leaflet page', {
      cause: failedExtractionPages[0]?.error,
    })
  }

  if (failedExtractionPages.length > 0) {
    logWarning(
      `Lidl leaflet ingestion: vision extraction failed for ${failedExtractionPages.length} leaflet page(s): ${failedExtractionPages.map((p) => p.pageNumber).join(', ')}`,
    )
  }

  const result = parseLidlLeafletExtraction(extractedPages, flyer, sourceUrl, slug, { logWarning })

  await writeLastLidlLeafletSlug(slug)

  return result
}
