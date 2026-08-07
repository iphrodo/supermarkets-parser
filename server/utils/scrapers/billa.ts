import * as cheerio from 'cheerio'
import { Type } from '@google/genai'
import { ofetch } from 'ofetch'
import type { BoundingBox2d, LeafletPage, Offer, OfferImageCrop } from '../../../shared/types/offer'
import { readLastBillaPublicationSlug, readSnapshot, writeLastBillaPublicationSlug } from '../kv'
import { computeOfferKey, computeProductKey } from '../normalize'
import { rejectOverlappingBoxes, sanitizeBox } from './bounding-box'
import {
  extractStructuredDataFromImage,
  fetchPageImages as fetchPageImagesShared,
  mapWithConcurrency,
  selectPagesByPrefix,
  type PageDisplayImage,
  type PageImageRef,
} from './vision-extraction'

export const BILLA_LEAFLET_PAGE_URL = 'https://www.billa.bg/promocii/sedmichna-broshura'

const PUBLITAS_VIEW_BASE = 'https://view.publitas.com'
/** Distinguishes the weekly leaflet from other Publitas publications on the page (T&Cs, game rules, ...). */
const WEEKLY_LEAFLET_PATTERN = /weekly_digital_leaflet/i
const SLUG_PATTERN = /\/billa-bulgaria\/([^/]+)\/?/
/** Balances image legibility for the vision model against request payload size. */
const PAGE_IMAGE_SIZE = 'at1600'
/** Served to the browser for CSS crops — a crop needs far less resolution than OCR does. */
const CLIENT_PAGE_IMAGE_SIZE = 'at800'
/** Publitas page objects carry no dimensions; the resize proxy states them in the path. */
const FIT_IN_DIMENSIONS_PATTERN = /fit-in\/(\d+)x(\d+)\//
const VISION_MODEL = 'gemini-3.5-flash-lite'
const VISION_CONCURRENCY = 4

export class BillaIngestionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'BillaIngestionError'
  }
}

/** Exported separately so fixture-based tests never need to hit the network. */
export function discoverPublicationUrl(html: string): string {
  const $ = cheerio.load(html)
  const candidates = new Set<string>()

  $('[data-publication]').each((_, el) => {
    const url = $(el).attr('data-publication')
    if (url) candidates.add(url)
  })

  const matches = Array.from(candidates).filter((url) => WEEKLY_LEAFLET_PATTERN.test(url))

  if (matches.length !== 1) {
    throw new BillaIngestionError(
      matches.length === 0
        ? 'No weekly-leaflet Publitas publication found on the Billa promotions page'
        : `Ambiguous weekly-leaflet Publitas publication: found ${matches.length} candidates`,
    )
  }

  const url = matches[0]!
  return url.endsWith('/') ? url : `${url}/`
}

function extractPublicationSlug(publicationUrl: string): string {
  const match = publicationUrl.match(SLUG_PATTERN)
  if (!match) {
    throw new BillaIngestionError(`Could not extract publication slug from URL: ${publicationUrl}`)
  }
  return match[1]!
}

interface PublitasSpreadPage {
  number: number
  images: Record<string, string>
}

interface PublitasSpread {
  pages: PublitasSpreadPage[]
}

export interface BillaPageImageRef extends PageImageRef {
  /** Absent when the manifest's client-size path did not state its dimensions. */
  display: PageDisplayImage | null
}

/**
 * `spreads.json` is a public, unsigned manifest of every page's resize-proxy
 * image URLs at several sizes — reverse-engineered from the reader's own
 * network traffic (see design.md). No headless browser is needed.
 */
async function fetchPageImageRefs(publicationUrl: string): Promise<BillaPageImageRef[]> {
  let spreads: PublitasSpread[]
  try {
    spreads = await ofetch<PublitasSpread[]>(`${publicationUrl}spreads.json`)
  } catch (error) {
    throw new BillaIngestionError('Failed to fetch Publitas spreads manifest', { cause: error })
  }

  const pages = spreads.flatMap((spread) => spread.pages).sort((a, b) => a.number - b.number)
  if (pages.length === 0) {
    throw new BillaIngestionError('Publitas spreads manifest contained no pages')
  }

  return pages.map((page) => {
    const path = page.images[PAGE_IMAGE_SIZE]
    if (!path) {
      throw new BillaIngestionError(`Publitas page ${page.number} manifest had no "${PAGE_IMAGE_SIZE}" image`)
    }
    return {
      pageNumber: page.number,
      imageUrl: `${PUBLITAS_VIEW_BASE}${path}`,
      display: toDisplayImage(page.images[CLIENT_PAGE_IMAGE_SIZE]),
    }
  })
}

/**
 * The display image is best-effort: without its pixel dimensions a crop has no
 * aspect ratio to reserve space with, so the page is simply not recorded and
 * its offers fall back to placeholder tiles.
 */
function toDisplayImage(path: string | undefined): PageDisplayImage | null {
  if (!path) return null

  const match = path.match(FIT_IN_DIMENSIONS_PATTERN)
  if (!match) return null

  return { imageUrl: `${PUBLITAS_VIEW_BASE}${path}`, width: Number(match[1]), height: Number(match[2]) }
}

/** Re-exported so existing imports (e.g. `billa.test.ts`) keep working. */
export const fetchPageImages = fetchPageImagesShared

export interface BillaExtractedItem {
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
  /** ISO date (YYYY-MM-DD) */
  validFrom: string | null
  /** ISO date (YYYY-MM-DD) */
  validUntil: string | null
  /** Whether the model is confident in `priceEurCents`; required for gating. */
  priceConfident: boolean
  /** Whether the model is confident in `validFrom`/`validUntil`; required for gating. */
  validityConfident: boolean
  /** Names of non-critical fields (brand, unitText, category) extracted with lower confidence. */
  uncertainFields: string[]
}

export interface BillaExtractedPage {
  pageNumber: number
  items: BillaExtractedItem[]
  /** Absent when the page's display variant or its dimensions were unavailable; then no crops are emitted for it. */
  display?: PageDisplayImage | null
}

const EXTRACTION_PROMPT = `You are reading one page of a Bulgarian supermarket (BILLA) weekly promotional leaflet.

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
- validFrom / validUntil: the offer's validity period as ISO dates (YYYY-MM-DD). Leaflets usually print one validity period for the whole page or section (e.g. "в сила от 30.07 до 05.08.2026") — apply it to every item it covers.
- priceConfident: true only if you can clearly and unambiguously read the price
- validityConfident: true only if you can clearly and unambiguously determine both validity dates
- uncertainFields: list any of "brand", "unitText", "category" that you extracted but are not confident about

Do not guess a price or date you cannot clearly read — set the corresponding confident flag to false instead.
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
          validFrom: { type: Type.STRING, nullable: true },
          validUntil: { type: Type.STRING, nullable: true },
          priceConfident: { type: Type.BOOLEAN },
          validityConfident: { type: Type.BOOLEAN },
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
          'validFrom',
          'validUntil',
          'priceConfident',
          'validityConfident',
          'uncertainFields',
        ],
        required: ['name', 'priceConfident', 'validityConfident', 'boxConfident', 'uncertainFields'],
      },
    },
  },
  required: ['items'],
} as const

/** Exported separately so it can be swapped out in tests. */
export async function extractOffersFromPageImage(imageBuffer: ArrayBuffer): Promise<BillaExtractedItem[]> {
  const parsed = await extractStructuredDataFromImage<{ items?: BillaExtractedItem[] }>(
    imageBuffer,
    EXTRACTION_PROMPT,
    EXTRACTION_RESPONSE_SCHEMA,
    VISION_MODEL,
  )
  return parsed.items ?? []
}

const NON_CRITICAL_FIELDS = new Set(['brand', 'unitText', 'category'])

function mapExtractedItem(
  item: BillaExtractedItem,
  sourceUrl: string,
  scrapedAt: string,
  imageCrop: OfferImageCrop | null,
): Offer | null {
  if (!item.priceConfident || !item.validityConfident) return null
  if (item.priceEurCents == null || !item.validFrom || !item.validUntil) return null

  const name = item.name.trim()
  const unitText = item.unitText?.trim() ?? ''
  const brand = item.brand?.trim() || null

  const productKey = computeProductKey({ retailer: 'billa', name, unitText, ean: null })
  const offerKey = computeOfferKey(productKey, item.validFrom)

  const warnings = item.uncertainFields
    .filter((field) => NON_CRITICAL_FIELDS.has(field))
    .map((field) => `Field "${field}" was extracted with lower confidence for "${name}"`)

  return {
    offerKey,
    productKey,
    retailer: 'billa',
    brand,
    name,
    unitText,
    category: item.category?.trim() || '',
    campaign: null,
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
    validFrom: item.validFrom,
    validUntil: item.validUntil,
    sourceUrl,
    scrapedAt,
    warnings,
  }
}

export function billaPageId(slug: string, pageNumber: number): string {
  return `billa:${slug}:${pageNumber}`
}

/**
 * Validates one page's proposed boxes and returns the survivors by item index.
 * Runs before offers are built because overlap rejection is a page-wide
 * judgement: two items claiming one photograph both lose it.
 */
function resolvePageBoxes(items: BillaExtractedItem[]): Map<number, BoundingBox2d> {
  const candidates: { index: number; box: BoundingBox2d }[] = []

  items.forEach((item, index) => {
    if (!item.boxConfident) return
    const box = sanitizeBox(item.box_2d)
    if (box) candidates.push({ index, box })
  })

  return new Map(rejectOverlappingBoxes(candidates).map(({ index, box }) => [index, box]))
}

export interface ParseBillaExtractionResult {
  offers: Offer[]
  leafletPages: Record<string, LeafletPage>
}

export interface ParseBillaExtractionDeps {
  logWarning?: (message: string) => void
}

/**
 * Maps already-extracted, per-page structured data into offers plus the
 * registry of leaflet pages their crops reference, applying confidence gating
 * (drop unless price and validity are both confident). A rejected bounding box
 * never drops the offer — it only leaves it without an image.
 * Exported separately so tests can feed fixture extraction output without
 * calling the vision API.
 */
export function parseBillaExtraction(
  pages: BillaExtractedPage[],
  publicationUrl: string,
  slug: string,
  deps: ParseBillaExtractionDeps = {},
): ParseBillaExtractionResult {
  const scrapedAt = new Date().toISOString()
  const offers: Offer[] = []
  const leafletPages: Record<string, LeafletPage> = {}

  let proposedBoxes = 0
  let keptBoxes = 0

  for (const page of pages) {
    const boxes = resolvePageBoxes(page.items)
    const pageId = billaPageId(slug, page.pageNumber)

    page.items.forEach((item, index) => {
      if (item.box_2d != null) proposedBoxes++

      const box = page.display ? boxes.get(index) : undefined
      const offer = mapExtractedItem(item, publicationUrl, scrapedAt, box ? { pageId, box } : null)
      if (!offer) return

      offers.push(offer)

      if (offer.imageCrop && page.display) {
        keptBoxes++
        leafletPages[pageId] ??= { ...page.display, pageNumber: page.pageNumber, sourceUrl: publicationUrl }
      }
    })
  }

  const droppedBoxes = proposedBoxes - keptBoxes
  if (droppedBoxes > 0 && deps.logWarning) {
    deps.logWarning(
      `Billa ingestion: dropped ${droppedBoxes} of ${proposedBoxes} product image boxes (low confidence / failed sanity checks)`,
    )
  }

  return { offers, leafletPages }
}

export interface FetchBillaOffersDeps {
  logWarning?: (message: string) => void
}

export const BILLA_PAGE_ID_PREFIX = 'billa:'

export async function fetchBillaOffers(deps: FetchBillaOffersDeps = {}): Promise<ParseBillaExtractionResult> {
  const logWarning = deps.logWarning ?? ((message: string) => console.warn(message))

  let promoHtml: string
  try {
    promoHtml = await ofetch<string>(BILLA_LEAFLET_PAGE_URL)
  } catch (error) {
    throw new BillaIngestionError('Failed to fetch Billa promotions page', { cause: error })
  }

  const publicationUrl = discoverPublicationUrl(promoHtml)
  const slug = extractPublicationSlug(publicationUrl)

  const lastSlug = await readLastBillaPublicationSlug()
  if (lastSlug === slug) {
    const previous = await readSnapshot()
    if (!previous) return { offers: [], leafletPages: {} }
    return {
      offers: previous.offers.filter((offer) => offer.retailer === 'billa'),
      leafletPages: selectPagesByPrefix(previous.leafletPages, BILLA_PAGE_ID_PREFIX),
    }
  }

  const pageRefs = await fetchPageImageRefs(publicationUrl)
  const { pages: fetchedPages, skippedPages } = await fetchPageImages(pageRefs)

  if (fetchedPages.length === 0) {
    throw new BillaIngestionError('Failed to fetch any leaflet page images')
  }

  if (skippedPages.length > 0) {
    logWarning(
      `Billa ingestion: skipped ${skippedPages.length} unfetchable leaflet page(s): ${skippedPages.join(', ')}`,
    )
  }

  const displayByPage = new Map(pageRefs.map((ref) => [ref.pageNumber, ref.display]))

  type FailedPageExtraction = { pageNumber: number; items: null; error: unknown }
  type PageExtraction = BillaExtractedPage | FailedPageExtraction

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
    (result): result is BillaExtractedPage => result.items !== null,
  )
  const failedExtractionPages = extractionResults.filter(
    (result): result is FailedPageExtraction => result.items === null,
  )

  if (extractedPages.length === 0) {
    throw new BillaIngestionError('Vision extraction failed for every fetched leaflet page', {
      cause: failedExtractionPages[0]?.error,
    })
  }

  if (failedExtractionPages.length > 0) {
    logWarning(
      `Billa ingestion: vision extraction failed for ${failedExtractionPages.length} leaflet page(s): ${failedExtractionPages.map((p) => p.pageNumber).join(', ')}`,
    )
  }

  const result = parseBillaExtraction(extractedPages, publicationUrl, slug, { logWarning })

  await writeLastBillaPublicationSlug(slug)

  return result
}
