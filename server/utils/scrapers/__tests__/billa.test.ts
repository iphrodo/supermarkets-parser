import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BillaIngestionError, discoverPublicationUrl, parseBillaExtraction, type BillaExtractedPage } from '../billa'

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
    box_2d: [100, 100, 300, 300],
    boxConfident: true,
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

const DISPLAY = { imageUrl: 'https://view.publitas.com/p/at800/page-3.jpg', width: 676, height: 947 }

function makePage(items: BillaExtractedPage['items'], overrides: Partial<BillaExtractedPage> = {}): BillaExtractedPage {
  return { pageNumber: 3, display: DISPLAY, items, ...overrides }
}

describe('parseBillaExtraction', () => {
  const publicationUrl = 'https://view.publitas.com/billa-bulgaria/bg_weekly_digital_leaflet_30-07-05-08-2026_cw31_web/'
  const slug = 'bg_weekly_digital_leaflet_30-07-05-08-2026_cw31_web'

  it('emits an offer for a high-confidence extraction', () => {
    const { offers } = parseBillaExtraction([makePage([makeItem()])], publicationUrl, slug)

    expect(offers).toHaveLength(1)
    expect(offers[0]!.retailer).toBe('billa')
    expect(offers[0]!.priceEurCents).toBe(179)
    expect(offers[0]!.sourceUrl).toBe(publicationUrl)
    expect(offers[0]!.scope).toBe('national')
    expect(offers[0]!.store).toBeNull()
  })

  it('drops an item whose price was not confidently extracted', () => {
    const pages = [makePage([makeItem({ priceConfident: false })])]
    expect(parseBillaExtraction(pages, publicationUrl, slug).offers).toHaveLength(0)
  })

  it('drops an item whose validity dates were not confidently extracted', () => {
    const pages = [makePage([makeItem({ validityConfident: false })])]
    expect(parseBillaExtraction(pages, publicationUrl, slug).offers).toHaveLength(0)
  })

  it('drops an item missing a price or validity date even if flagged confident', () => {
    const pages = [makePage([makeItem({ priceEurCents: null })])]
    expect(parseBillaExtraction(pages, publicationUrl, slug).offers).toHaveLength(0)
  })

  it('attaches a warning for offers with lower-confidence non-critical fields instead of dropping them', () => {
    const { offers } = parseBillaExtraction([makePage([makeItem({ uncertainFields: ['brand'] })])], publicationUrl, slug)

    expect(offers).toHaveLength(1)
    expect(offers[0]!.warnings).toHaveLength(1)
    expect(offers[0]!.warnings[0]).toContain('brand')
  })

  it('populates imageCrop from a good box and registers the page it references', () => {
    const { offers, leafletPages } = parseBillaExtraction([makePage([makeItem()])], publicationUrl, slug)

    const pageId = `billa:${slug}:3`
    expect(offers[0]!.imageCrop).toEqual({ pageId, box: [92, 92, 308, 308] })
    expect(Object.keys(leafletPages)).toEqual([pageId])
    expect(leafletPages[pageId]).toEqual({ ...DISPLAY, pageNumber: 3, sourceUrl: publicationUrl })
  })

  it('keeps the offer but drops the crop when the box is flagged unconfident', () => {
    const { offers, leafletPages } = parseBillaExtraction(
      [makePage([makeItem({ boxConfident: false })])],
      publicationUrl,
      slug,
    )

    expect(offers).toHaveLength(1)
    expect(offers[0]!.imageCrop).toBeNull()
    expect(leafletPages).toEqual({})
  })

  it('keeps the offer but drops the crop when the box fails sanity checks', () => {
    const { offers } = parseBillaExtraction(
      [makePage([makeItem({ box_2d: [300, 100, 100, 300] })])],
      publicationUrl,
      slug,
    )

    expect(offers).toHaveLength(1)
    expect(offers[0]!.imageCrop).toBeNull()
  })

  it('drops the crop from both items of an overlapping pair, keeping both offers', () => {
    const { offers, leafletPages } = parseBillaExtraction(
      [
        makePage([
          makeItem({ name: 'Мляко', box_2d: [100, 100, 300, 300] }),
          makeItem({ name: 'Сирене', box_2d: [110, 110, 310, 310] }),
        ]),
      ],
      publicationUrl,
      slug,
    )

    expect(offers).toHaveLength(2)
    expect(offers.every((offer) => offer.imageCrop === null)).toBe(true)
    expect(leafletPages).toEqual({})
  })

  it('emits no crop for a page whose display image is unavailable', () => {
    const { offers, leafletPages } = parseBillaExtraction(
      [makePage([makeItem()], { display: null })],
      publicationUrl,
      slug,
    )

    expect(offers).toHaveLength(1)
    expect(offers[0]!.imageCrop).toBeNull()
    expect(leafletPages).toEqual({})
  })

  it('reports dropped boxes as one aggregate line rather than per-offer warnings', () => {
    const messages: string[] = []
    const { offers } = parseBillaExtraction(
      [makePage([makeItem(), makeItem({ name: 'Сирене', boxConfident: false })])],
      publicationUrl,
      slug,
      { logWarning: (message) => messages.push(message) },
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('dropped 1 of 2 product image boxes')
    expect(offers.flatMap((offer) => offer.warnings)).toEqual([])
  })
})
