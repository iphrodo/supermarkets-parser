import * as cheerio from 'cheerio'
import { Type } from '@google/genai'
import { ofetch } from 'ofetch'
import type { Offer } from '../../../shared/types/offer'
import { readLastLidlLeafletSlug, readSnapshot, writeLastLidlLeafletSlug } from '../kv'
import { computeOfferKey, computeProductKey } from '../normalize'
import { extractStructuredDataFromImage, fetchPageImages, mapWithConcurrency, type PageImageRef } from './vision-extraction'

export const LIDL_LEAFLET_LISTING_URL = 'https://www.lidl.bg/c/broshura/s10020060'
export const FLYER_API_URL = 'https://endpoints.leaflets.schwarz/v4/flyer'
/** The weekly leaflet's validity period spans exactly this many days (Monday–Sunday). */
export const WEEKLY_WINDOW_DAYS = 7
export const LIDL_LEAFLET_SOURCE_URL_PREFIX = 'https://www.lidl.bg/l/bg/broshura/'
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
  zoom: string
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

function toPageImageRefs(flyer: LidlFlyer): PageImageRef[] {
  return [...flyer.pages]
    .sort((a, b) => a.number - b.number)
    .map((page) => ({ pageNumber: page.number, imageUrl: page.zoom }))
}

export interface LidlLeafletExtractedItem {
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
}

const EXTRACTION_PROMPT = `You are reading one page of a Bulgarian supermarket (LIDL) weekly promotional leaflet.

Identify every distinct product offer shown on this page. For each one, extract:
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
        required: ['name', 'priceConfident', 'uncertainFields'],
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
    scope: 'national',
    store: null,
    validFrom: flyer.offerStartDate,
    validUntil: flyer.offerEndDate,
    sourceUrl,
    scrapedAt,
    warnings,
  }
}

/**
 * Maps already-extracted, per-page structured data into `Offer[]`, applying
 * confidence gating (drop unless price is confident) and taking validity
 * dates from the leaflet's own metadata rather than the extracted item.
 * Exported separately so tests can feed fixture extraction output without
 * calling the vision API.
 */
export function parseLidlLeafletExtraction(pages: LidlLeafletExtractedPage[], flyer: LidlFlyer, sourceUrl: string): Offer[] {
  const scrapedAt = new Date().toISOString()
  const offers: Offer[] = []

  for (const page of pages) {
    for (const item of page.items) {
      const offer = mapExtractedItem(item, flyer, sourceUrl, scrapedAt)
      if (offer) offers.push(offer)
    }
  }

  return offers
}

/** Distinguishes this source's offers from the XLSX-based Lidl source, both of which share `retailer: 'lidl'`. */
export function isLidlLeafletOffer(offer: Offer): boolean {
  return offer.retailer === 'lidl' && offer.sourceUrl.startsWith(LIDL_LEAFLET_SOURCE_URL_PREFIX)
}

export interface FetchLidlLeafletOffersDeps {
  logWarning?: (message: string) => void
}

export async function fetchLidlLeafletOffers(deps: FetchLidlLeafletOffersDeps = {}): Promise<Offer[]> {
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
    return previous?.offers.filter(isLidlLeafletOffer) ?? []
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

  const extractionResults = await mapWithConcurrency(fetchedPages, VISION_CONCURRENCY, async (page) => {
    try {
      return { pageNumber: page.pageNumber, items: await extractOffersFromPageImage(page.imageBuffer) }
    } catch (error) {
      return { pageNumber: page.pageNumber, items: null, error }
    }
  })

  const extractedPages = extractionResults.filter(
    (result): result is LidlLeafletExtractedPage => result.items !== null,
  )
  const failedExtractionPages = extractionResults.filter((result) => result.items === null)

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

  const offers = parseLidlLeafletExtraction(extractedPages, flyer, sourceUrl)

  await writeLastLidlLeafletSlug(slug)

  return offers
}
