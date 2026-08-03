import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ofetch } from 'ofetch'
import { describe, expect, it, vi } from 'vitest'
import {
  BillaIngestionError,
  discoverPublicationUrl,
  fetchPageImages,
  parseBillaExtraction,
  type BillaExtractedPage,
} from '../billa'

vi.mock('ofetch', () => ({ ofetch: vi.fn() }))

const fixtureUrl = new URL('../../../../test/fixtures/billa-promocii.html', import.meta.url)
const fixtureHtml = readFileSync(fileURLToPath(fixtureUrl), 'utf-8')

describe('discoverPublicationUrl', () => {
  it('finds the weekly-leaflet publication among other Publitas embeds on the page', () => {
    const url = discoverPublicationUrl(fixtureHtml)
    expect(url).toBe('https://view.publitas.com/billa-bulgaria/bg_weekly_digital_leaflet_30-07-05-08-2026_cw31_web/')
  })

  it('throws BillaIngestionError when no weekly-leaflet publication is present', () => {
    const html = `<div data-publication="https://view.publitas.com/billa-bulgaria/billa-bulgaria-terms-and-conditions/"></div>`
    expect(() => discoverPublicationUrl(html)).toThrow(BillaIngestionError)
  })

  it('throws BillaIngestionError when the weekly-leaflet publication is ambiguous', () => {
    const html = `
      <div data-publication="https://view.publitas.com/billa-bulgaria/bg_weekly_digital_leaflet_cw31/"></div>
      <div data-publication="https://view.publitas.com/billa-bulgaria/bg_weekly_digital_leaflet_cw30_stale/"></div>
    `
    expect(() => discoverPublicationUrl(html)).toThrow(BillaIngestionError)
  })
})

function makeItem(overrides: Partial<BillaExtractedPage['items'][number]> = {}): BillaExtractedPage['items'][number] {
  return {
    name: 'Прясно мляко 3.6%',
    brand: 'Верея',
    unitText: '1 л',
    category: 'Млечни',
    priceEurCents: 179,
    originalPriceEurCents: 219,
    discountPercentage: 18,
    validFrom: '2026-07-30',
    validUntil: '2026-08-05',
    priceConfident: true,
    validityConfident: true,
    uncertainFields: [],
    ...overrides,
  }
}

describe('parseBillaExtraction', () => {
  const publicationUrl = 'https://view.publitas.com/billa-bulgaria/bg_weekly_digital_leaflet_30-07-05-08-2026_cw31_web/'

  it('emits an offer for a high-confidence extraction', () => {
    const pages: BillaExtractedPage[] = [{ pageNumber: 3, items: [makeItem()] }]
    const offers = parseBillaExtraction(pages, publicationUrl)

    expect(offers).toHaveLength(1)
    expect(offers[0]!.retailer).toBe('billa')
    expect(offers[0]!.priceEurCents).toBe(179)
    expect(offers[0]!.sourceUrl).toBe(publicationUrl)
    expect(offers[0]!.scope).toBe('national')
    expect(offers[0]!.store).toBeNull()
  })

  it('drops an item whose price was not confidently extracted', () => {
    const pages: BillaExtractedPage[] = [{ pageNumber: 3, items: [makeItem({ priceConfident: false })] }]
    expect(parseBillaExtraction(pages, publicationUrl)).toHaveLength(0)
  })

  it('drops an item whose validity dates were not confidently extracted', () => {
    const pages: BillaExtractedPage[] = [{ pageNumber: 3, items: [makeItem({ validityConfident: false })] }]
    expect(parseBillaExtraction(pages, publicationUrl)).toHaveLength(0)
  })

  it('drops an item missing a price or validity date even if flagged confident', () => {
    const pages: BillaExtractedPage[] = [{ pageNumber: 3, items: [makeItem({ priceEurCents: null })] }]
    expect(parseBillaExtraction(pages, publicationUrl)).toHaveLength(0)
  })

  it('attaches a warning for offers with lower-confidence non-critical fields instead of dropping them', () => {
    const pages: BillaExtractedPage[] = [{ pageNumber: 3, items: [makeItem({ uncertainFields: ['brand'] })] }]
    const offers = parseBillaExtraction(pages, publicationUrl)

    expect(offers).toHaveLength(1)
    expect(offers[0]!.warnings).toHaveLength(1)
    expect(offers[0]!.warnings[0]).toContain('brand')
  })
})

describe('fetchPageImages', () => {
  it('returns successfully fetched pages and records the page numbers that failed to fetch', async () => {
    const mockedOfetch = vi.mocked(ofetch)
    mockedOfetch.mockImplementation((url: unknown) => {
      if (typeof url === 'string' && url.includes('page-2')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve(new ArrayBuffer(8))
    })

    const refs = [
      { pageNumber: 1, imageUrl: 'https://view.publitas.com/page-1.jpg' },
      { pageNumber: 2, imageUrl: 'https://view.publitas.com/page-2.jpg' },
      { pageNumber: 3, imageUrl: 'https://view.publitas.com/page-3.jpg' },
    ]

    const result = await fetchPageImages(refs)

    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 3])
    expect(result.skippedPages).toEqual([2])
  })
})
