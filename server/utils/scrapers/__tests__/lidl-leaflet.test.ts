import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Offer } from '../../../../shared/types/offer'
import {
  discoverLeafletSlugs,
  isLidlLeafletOffer,
  LidlLeafletIngestionError,
  parseLidlLeafletExtraction,
  selectWeeklyFlyer,
  type LidlLeafletExtractedItem,
  type LidlLeafletExtractedPage,
} from '../lidl-leaflet'

function readFixture(name: string): string {
  const url = new URL(`../../../../test/fixtures/${name}`, import.meta.url)
  return readFileSync(fileURLToPath(url), 'utf-8')
}

const listingHtml = readFixture('lidl-broshura-listing.html')
const weeklyFlyer = JSON.parse(readFixture('lidl-flyer-weekly.json')).flyer
const campaignFlyer = JSON.parse(readFixture('lidl-flyer-campaign.json')).flyer

describe('discoverLeafletSlugs', () => {
  it('extracts every leaflet slug listed on the page', () => {
    const slugs = discoverLeafletSlugs(listingHtml)

    expect(slugs).toEqual(
      expect.arrayContaining(['lidl-bg-kw32-2026-08-03', 'lidl-bg-tehnika-kampania', 'lidl-bg-godishnina-227-dni']),
    )
    expect(slugs).toHaveLength(3)
  })

  it('returns an empty array when no leaflet links are present', () => {
    expect(discoverLeafletSlugs('<html><body>No leaflets here</body></html>')).toEqual([])
  })
})

describe('selectWeeklyFlyer', () => {
  it('picks the candidate with a 7-day validity window', async () => {
    const fetchFlyerFn = async (slug: string) => (slug === 'weekly' ? weeklyFlyer : campaignFlyer)

    const result = await selectWeeklyFlyer(['weekly', 'campaign'], fetchFlyerFn)

    expect(result.slug).toBe('weekly')
    expect(result.flyer).toBe(weeklyFlyer)
  })

  it('throws when no candidate has a 7-day validity window', async () => {
    const fetchFlyerFn = async () => campaignFlyer

    await expect(selectWeeklyFlyer(['a', 'b'], fetchFlyerFn)).rejects.toThrow(LidlLeafletIngestionError)
  })

  it('throws when more than one candidate has a 7-day validity window', async () => {
    const fetchFlyerFn = async () => weeklyFlyer

    await expect(selectWeeklyFlyer(['a', 'b'], fetchFlyerFn)).rejects.toThrow(LidlLeafletIngestionError)
  })
})

function makeItem(overrides: Partial<LidlLeafletExtractedItem> = {}): LidlLeafletExtractedItem {
  return {
    box_2d: [100, 100, 300, 300],
    boxConfident: true,
    name: 'Кисело мляко 3.6%',
    brand: 'Милрам',
    unitText: '400 г',
    category: 'Млечни',
    priceEurCents: 129,
    originalPriceEurCents: 149,
    discountPercentage: 13,
    priceConfident: true,
    uncertainFields: [],
    ...overrides,
  }
}

/** Mirrors the live flyer payload's per-page `image`/`width`/`height` fields. */
const DISPLAY = { imageUrl: weeklyFlyer.pages[0].image, width: 1398, height: 2400 }

function makePage(
  items: LidlLeafletExtractedItem[],
  overrides: Partial<LidlLeafletExtractedPage> = {},
): LidlLeafletExtractedPage {
  return { pageNumber: 1, display: DISPLAY, items, ...overrides }
}

describe('parseLidlLeafletExtraction', () => {
  const sourceUrl = 'https://www.lidl.bg/l/bg/broshura/lidl-bg-kw32-2026-08-03/ar/0'
  const slug = 'lidl-bg-kw32-2026-08-03'

  it('takes validity dates from the flyer metadata, not the extracted item', () => {
    const { offers } = parseLidlLeafletExtraction([makePage([makeItem()])], weeklyFlyer, sourceUrl, slug)

    expect(offers).toHaveLength(1)
    expect(offers[0]!.validFrom).toBe(weeklyFlyer.offerStartDate)
    expect(offers[0]!.validUntil).toBe(weeklyFlyer.offerEndDate)
    expect(offers[0]!.retailer).toBe('lidl')
    expect(offers[0]!.sourceUrl).toBe(sourceUrl)
    expect(offers[0]!.scope).toBe('national')
    expect(offers[0]!.store).toBeNull()
  })

  it('drops an item whose price was not confidently extracted', () => {
    const pages = [makePage([makeItem({ priceConfident: false })])]
    expect(parseLidlLeafletExtraction(pages, weeklyFlyer, sourceUrl, slug).offers).toHaveLength(0)
  })

  it('drops an item missing a price even if flagged confident', () => {
    const pages = [makePage([makeItem({ priceEurCents: null })])]
    expect(parseLidlLeafletExtraction(pages, weeklyFlyer, sourceUrl, slug).offers).toHaveLength(0)
  })

  it('attaches a warning for offers with lower-confidence non-critical fields instead of dropping them', () => {
    const pages = [makePage([makeItem({ uncertainFields: ['brand'] })])]
    const { offers } = parseLidlLeafletExtraction(pages, weeklyFlyer, sourceUrl, slug)

    expect(offers).toHaveLength(1)
    expect(offers[0]!.warnings).toHaveLength(1)
    expect(offers[0]!.warnings[0]).toContain('brand')
  })

  it('populates imageCrop from a good box and registers the page it references', () => {
    const { offers, leafletPages } = parseLidlLeafletExtraction([makePage([makeItem()])], weeklyFlyer, sourceUrl, slug)

    const pageId = `lidl-leaflet:${slug}:1`
    expect(offers[0]!.imageCrop).toEqual({ pageId, box: [92, 92, 308, 308] })
    expect(Object.keys(leafletPages)).toEqual([pageId])
    expect(leafletPages[pageId]).toEqual({ ...DISPLAY, pageNumber: 1, sourceUrl })
  })

  it('keeps the offer but drops the crop when the box is flagged unconfident', () => {
    const pages = [makePage([makeItem({ boxConfident: false })])]
    const { offers, leafletPages } = parseLidlLeafletExtraction(pages, weeklyFlyer, sourceUrl, slug)

    expect(offers).toHaveLength(1)
    expect(offers[0]!.imageCrop).toBeNull()
    expect(leafletPages).toEqual({})
  })

  it('keeps the offer but drops the crop when the box fails sanity checks', () => {
    const pages = [makePage([makeItem({ box_2d: [100, 100, 900, 900] })])]
    const { offers } = parseLidlLeafletExtraction(pages, weeklyFlyer, sourceUrl, slug)

    expect(offers).toHaveLength(1)
    expect(offers[0]!.imageCrop).toBeNull()
  })

  it('drops the crop from both items of an overlapping pair, keeping both offers', () => {
    const pages = [
      makePage([
        makeItem({ name: 'Мляко', box_2d: [100, 100, 300, 300] }),
        makeItem({ name: 'Сирене', box_2d: [110, 110, 310, 310] }),
      ]),
    ]
    const { offers, leafletPages } = parseLidlLeafletExtraction(pages, weeklyFlyer, sourceUrl, slug)

    expect(offers).toHaveLength(2)
    expect(offers.every((offer) => offer.imageCrop === null)).toBe(true)
    expect(leafletPages).toEqual({})
  })

  it('reports dropped boxes as one aggregate line rather than per-offer warnings', () => {
    const messages: string[] = []
    const pages = [makePage([makeItem(), makeItem({ name: 'Сирене', boxConfident: false })])]
    const { offers } = parseLidlLeafletExtraction(pages, weeklyFlyer, sourceUrl, slug, {
      logWarning: (message) => messages.push(message),
    })

    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('dropped 1 of 2 product image boxes')
    expect(offers.flatMap((offer) => offer.warnings)).toEqual([])
  })
})

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    offerKey: 'name:abc:2026-08-03',
    productKey: 'name:abc',
    retailer: 'lidl',
    brand: null,
    name: 'Test product',
    unitText: '1 бр.',
    category: 'Тест',
    campaign: null,
    discountPercentage: 0,
    priceEurCents: 100,
    priceBgnCents: null,
    originalPriceEurCents: null,
    loyaltyTier: 'none',
    mechanic: 'standard',
    purchaseLimit: null,
    ean: null,
    scope: 'national',
    store: null,
    validFrom: '2026-08-03',
    validUntil: '2026-08-09',
    sourceUrl: 'https://www.lidl.bg/l/bg/broshura/lidl-bg-kw32-2026-08-03/ar/0',
    scrapedAt: '2026-08-03T00:00:00.000Z',
    warnings: [],
    ...overrides,
  }
}

describe('isLidlLeafletOffer', () => {
  it('returns true for an offer sourced from the leaflet', () => {
    expect(isLidlLeafletOffer(makeOffer())).toBe(true)
  })

  it('returns false for the sibling XLSX-source offer', () => {
    const xlsxOffer = makeOffer({
      sourceUrl: 'https://www.lidl.bg/explore/assets/webPriceData/bg/ExportSecondList.xlsx',
    })
    expect(isLidlLeafletOffer(xlsxOffer)).toBe(false)
  })

  it('returns false for an offer from a different retailer', () => {
    expect(isLidlLeafletOffer(makeOffer({ retailer: 'billa' }))).toBe(false)
  })
})
