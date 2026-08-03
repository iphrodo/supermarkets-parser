import * as cheerio from 'cheerio'
import { GoogleGenAI, Type } from '@google/genai'
import { ofetch } from 'ofetch'
import type { Offer } from '../../../shared/types/offer'
import { readLastBillaPublicationSlug, readSnapshot, writeLastBillaPublicationSlug } from '../kv'
import { computeOfferKey, computeProductKey } from '../normalize'

export const BILLA_LEAFLET_PAGE_URL = 'https://www.billa.bg/promocii/sedmichna-broshura'

const PUBLITAS_VIEW_BASE = 'https://view.publitas.com'
/** Distinguishes the weekly leaflet from other Publitas publications on the page (T&Cs, game rules, ...). */
const WEEKLY_LEAFLET_PATTERN = /weekly_digital_leaflet/i
const SLUG_PATTERN = /\/billa-bulgaria\/([^/]+)\/?/
/** Balances image legibility for the vision model against request payload size. */
const PAGE_IMAGE_SIZE = 'at1600'
const VISION_MODEL = 'gemini-3.5-flash'
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

export interface PageImageRef {
  pageNumber: number
  imageUrl: string
}

/**
 * `spreads.json` is a public, unsigned manifest of every page's resize-proxy
 * image URLs at several sizes — reverse-engineered from the reader's own
 * network traffic (see design.md). No headless browser is needed.
 */
async function fetchPageImageRefs(publicationUrl: string): Promise<PageImageRef[]> {
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
    return { pageNumber: page.number, imageUrl: `${PUBLITAS_VIEW_BASE}${path}` }
  })
}

interface FetchedPage extends PageImageRef {
  imageBuffer: ArrayBuffer
}

/** Fetches every page image, tolerating individual failures per the spec's partial-fetch requirement. */
export async function fetchPageImages(refs: PageImageRef[]): Promise<{ pages: FetchedPage[]; skippedPages: number[] }> {
  const results = await Promise.all(
    refs.map(async (ref): Promise<FetchedPage | null> => {
      try {
        const imageBuffer = await ofetch<ArrayBuffer>(ref.imageUrl, { responseType: 'arrayBuffer' })
        return { ...ref, imageBuffer }
      } catch {
        return null
      }
    }),
  )

  const pages: FetchedPage[] = []
  const skippedPages: number[] = []
  results.forEach((result, index) => {
    if (result) pages.push(result)
    else skippedPages.push(refs[index]!.pageNumber)
  })

  return { pages, skippedPages }
}

export interface BillaExtractedItem {
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
}

const EXTRACTION_PROMPT = `You are reading one page of a Bulgarian supermarket (BILLA) weekly promotional leaflet.

Identify every distinct product offer shown on this page. For each one, extract:
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
        required: ['name', 'priceConfident', 'validityConfident', 'uncertainFields'],
      },
    },
  },
  required: ['items'],
} as const

let visionClient: GoogleGenAI | null = null

function getVisionClient(): GoogleGenAI {
  if (visionClient) return visionClient

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new BillaIngestionError('GEMINI_API_KEY is not configured')
  }

  visionClient = new GoogleGenAI({ apiKey })
  return visionClient
}

/** Exported separately so it can be swapped out in tests. */
export async function extractOffersFromPageImage(imageBuffer: ArrayBuffer): Promise<BillaExtractedItem[]> {
  const client = getVisionClient()
  const base64Image = Buffer.from(imageBuffer).toString('base64')

  let response: Awaited<ReturnType<typeof client.models.generateContent>>
  try {
    response = await client.models.generateContent({
      model: VISION_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: EXTRACTION_PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: base64Image } }],
        },
      ],
      config: { responseMimeType: 'application/json', responseSchema: EXTRACTION_RESPONSE_SCHEMA },
    })
  } catch (error) {
    throw new BillaIngestionError('Vision extraction request failed', { cause: error })
  }

  const text = response.text
  if (!text) {
    throw new BillaIngestionError('Vision extraction returned an empty response')
  }

  let parsed: { items?: BillaExtractedItem[] }
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new BillaIngestionError('Vision extraction returned invalid JSON', { cause: error })
  }

  return parsed.items ?? []
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const NON_CRITICAL_FIELDS = new Set(['brand', 'unitText', 'category'])

function mapExtractedItem(item: BillaExtractedItem, sourceUrl: string, scrapedAt: string): Offer | null {
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
    scope: 'national',
    store: null,
    validFrom: item.validFrom,
    validUntil: item.validUntil,
    sourceUrl,
    scrapedAt,
    warnings,
  }
}

/**
 * Maps already-extracted, per-page structured data into `Offer[]`, applying
 * confidence gating (drop unless price and validity are both confident).
 * Exported separately so tests can feed fixture extraction output without
 * calling the vision API.
 */
export function parseBillaExtraction(pages: BillaExtractedPage[], publicationUrl: string): Offer[] {
  const scrapedAt = new Date().toISOString()
  const offers: Offer[] = []

  for (const page of pages) {
    for (const item of page.items) {
      const offer = mapExtractedItem(item, publicationUrl, scrapedAt)
      if (offer) offers.push(offer)
    }
  }

  return offers
}

export interface FetchBillaOffersDeps {
  logWarning?: (message: string) => void
}

export async function fetchBillaOffers(deps: FetchBillaOffersDeps = {}): Promise<Offer[]> {
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
    return previous?.offers.filter((offer) => offer.retailer === 'billa') ?? []
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

  const extractionResults = await mapWithConcurrency(fetchedPages, VISION_CONCURRENCY, async (page) => {
    try {
      return { pageNumber: page.pageNumber, items: await extractOffersFromPageImage(page.imageBuffer) }
    } catch (error) {
      return { pageNumber: page.pageNumber, items: null, error }
    }
  })

  const extractedPages = extractionResults.filter(
    (result): result is BillaExtractedPage => result.items !== null,
  )
  const failedExtractionPages = extractionResults.filter((result) => result.items === null)

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

  const offers = parseBillaExtraction(extractedPages, publicationUrl)

  await writeLastBillaPublicationSlug(slug)

  return offers
}
