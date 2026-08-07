import { describe, expect, it, vi } from 'vitest'
import type { DealsSnapshot, LeafletPage, Offer } from '../../../shared/types/offer'
import { runDailySync } from '../sync'

const LIDL_XLSX_URL = 'https://www.lidl.bg/explore/assets/webPriceData/bg/ExportSecondList.xlsx'
const LIDL_LEAFLET_URL = 'https://www.lidl.bg/l/bg/broshura/lidl-bg-kw32-2026-08-03/ar/0'

function makeOffer(retailer: 'kaufland' | 'lidl' | 'billa', overrides: Partial<Offer> = {}): Offer {
  const defaultSourceUrl = retailer === 'lidl' ? LIDL_XLSX_URL : 'https://example.com'

  return {
    offerKey: `${retailer}:key`,
    productKey: `${retailer}:product`,
    retailer,
    brand: null,
    name: 'Test product',
    unitText: '1 бр.',
    category: 'Тест',
    campaign: null,
    discountPercentage: 10,
    priceEurCents: 100,
    priceBgnCents: null,
    originalPriceEurCents: null,
    loyaltyTier: 'none',
    mechanic: 'standard',
    purchaseLimit: null,
    ean: null,
    scope: 'national',
    store: null,
    validFrom: '2026-07-27',
    validUntil: '2026-08-02',
    sourceUrl: defaultSourceUrl,
    scrapedAt: '2026-08-01T00:00:00.000Z',
    warnings: [],
    ...overrides,
  }
}

function makeLidlLeafletOffer(overrides: Partial<Offer> = {}): Offer {
  return makeOffer('lidl', { offerKey: 'lidl-leaflet:key', sourceUrl: LIDL_LEAFLET_URL, ...overrides })
}

const BILLA_PAGE_ID = 'billa:cw31:3'
const LIDL_LEAFLET_PAGE_ID = 'lidl-leaflet:kw32:1'

function makePage(pageNumber: number, sourceUrl: string): LeafletPage {
  return { imageUrl: `https://example.com/page-${pageNumber}.jpg`, width: 676, height: 947, pageNumber, sourceUrl }
}

function withCrop(offer: Offer, pageId: string): Offer {
  return { ...offer, imageCrop: { pageId, box: [100, 100, 300, 300] } }
}

const silentLog = () => {}

describe('runDailySync', () => {
  it('publishes a fresh snapshot when all four sources succeed', async () => {
    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlLeafletOffers: async () => ({ offers: [makeLidlLeafletOffer()] }),
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa')] }),
      readSnapshot: async () => null,
      writeSnapshot,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('success')
    expect(result.snapshot!.offers).toHaveLength(4)
    expect(result.snapshot!.sources.lidlLeaflet.ok).toBe(true)
    expect(writeSnapshot).toHaveBeenCalledTimes(1)
  })

  it('carries forward a failed source’s last known-good offers when the others succeed', async () => {
    const previous: DealsSnapshot = {
      offers: [makeOffer('kaufland', { offerKey: 'stale-kaufland', scrapedAt: '2026-07-31T00:00:00.000Z' })],
      comparisons: [],
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: {
        kaufland: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidl: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidlLeaflet: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        billa: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
      },
    }

    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => {
        throw new Error('kaufland fetch failed')
      },
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl', { offerKey: 'fresh-lidl' })] }),
      fetchLidlLeafletOffers: async () => ({ offers: [makeLidlLeafletOffer({ offerKey: 'fresh-lidl-leaflet' })] }),
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa', { offerKey: 'fresh-billa' })] }),
      readSnapshot: async () => previous,
      writeSnapshot,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('partial')
    const offerKeys = result.snapshot!.offers.map((o) => o.offerKey)
    expect(offerKeys).toContain('stale-kaufland')
    expect(offerKeys).toContain('fresh-lidl')
    expect(offerKeys).toContain('fresh-lidl-leaflet')
    expect(offerKeys).toContain('fresh-billa')
    expect(result.snapshot!.sources.kaufland.ok).toBe(false)
    expect(result.snapshot!.sources.kaufland.scrapedAt).toBe('2026-07-31T00:00:00.000Z')
  })

  it('publishes with only Billa fresh when Kaufland, Lidl, and the Lidl leaflet all fail', async () => {
    const previous: DealsSnapshot = {
      offers: [makeOffer('kaufland', { offerKey: 'stale-kaufland' }), makeOffer('lidl', { offerKey: 'stale-lidl' })],
      comparisons: [],
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: {
        kaufland: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidl: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidlLeaflet: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        billa: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
      },
    }

    const result = await runDailySync({
      fetchKauflandOffers: async () => {
        throw new Error('kaufland down')
      },
      fetchLidlOffers: async () => {
        throw new Error('lidl down')
      },
      fetchLidlLeafletOffers: async () => {
        throw new Error('lidl leaflet down')
      },
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa', { offerKey: 'fresh-billa' })] }),
      readSnapshot: async () => previous,
      writeSnapshot: vi.fn(),
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('partial')
    const offerKeys = result.snapshot!.offers.map((o) => o.offerKey)
    expect(offerKeys).toEqual(expect.arrayContaining(['stale-kaufland', 'stale-lidl', 'fresh-billa']))
  })

  it('leaves the previous snapshot untouched and does not publish when all four sources fail', async () => {
    const writeSnapshot = vi.fn()
    const readSnapshot = vi.fn(async () => null)

    const result = await runDailySync({
      fetchKauflandOffers: async () => {
        throw new Error('kaufland down')
      },
      fetchLidlOffers: async () => {
        throw new Error('lidl down')
      },
      fetchLidlLeafletOffers: async () => {
        throw new Error('lidl leaflet down')
      },
      fetchBillaOffers: async () => {
        throw new Error('billa down')
      },
      readSnapshot,
      writeSnapshot,
      logError: silentLog,
    })

    expect(result.published).toBe(false)
    expect(result.reason).toBe('total-failure')
    expect(writeSnapshot).not.toHaveBeenCalled()
  })

  it('does not resurrect the still-succeeding Lidl leaflet source’s stale offers when only the XLSX source fails', async () => {
    const previous: DealsSnapshot = {
      offers: [
        makeOffer('lidl', { offerKey: 'stale-lidl-xlsx', sourceUrl: LIDL_XLSX_URL }),
        makeLidlLeafletOffer({ offerKey: 'stale-lidl-leaflet' }),
      ],
      comparisons: [],
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: {
        kaufland: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidl: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidlLeaflet: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        billa: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
      },
    }

    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => {
        throw new Error('lidl xlsx fetch failed')
      },
      fetchLidlLeafletOffers: async () => ({ offers: [makeLidlLeafletOffer({ offerKey: 'fresh-lidl-leaflet' })] }),
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa')] }),
      readSnapshot: async () => previous,
      writeSnapshot,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('partial')
    const offerKeys = result.snapshot!.offers.map((o) => o.offerKey)
    expect(offerKeys).toContain('stale-lidl-xlsx')
    expect(offerKeys).toContain('fresh-lidl-leaflet')
    expect(offerKeys).not.toContain('stale-lidl-leaflet')
  })

  it('publishes with the previous comparisons when comparison enrichment fails', async () => {
    const previousComparisons: DealsSnapshot['comparisons'] = [
      { groupKey: 'chicken-breast', labelBg: 'Пилешко филе', unitBase: 'kg', entries: [], savingsPercentage: 0.2, warnings: [] },
    ]
    const previous: DealsSnapshot = {
      offers: [],
      comparisons: previousComparisons,
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: {
        kaufland: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidl: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidlLeaflet: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        billa: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
      },
    }

    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlLeafletOffers: async () => ({ offers: [makeLidlLeafletOffer()] }),
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa')] }),
      readSnapshot: async () => previous,
      writeSnapshot,
      classifyOffers: async () => {
        throw new Error('classification service unavailable')
      },
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.snapshot!.comparisons).toEqual(previousComparisons)
  })

  it('merges both leaflet sources’ page registries into one snapshot', async () => {
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlLeafletOffers: async () => ({
        offers: [withCrop(makeLidlLeafletOffer(), LIDL_LEAFLET_PAGE_ID)],
        leafletPages: { [LIDL_LEAFLET_PAGE_ID]: makePage(1, LIDL_LEAFLET_URL) },
      }),
      fetchBillaOffers: async () => ({
        offers: [withCrop(makeOffer('billa'), BILLA_PAGE_ID)],
        leafletPages: { [BILLA_PAGE_ID]: makePage(3, 'https://view.publitas.com/billa/cw31/') },
      }),
      readSnapshot: async () => null,
      writeSnapshot: vi.fn(),
      logError: silentLog,
    })

    expect(Object.keys(result.snapshot!.leafletPages).sort()).toEqual([BILLA_PAGE_ID, LIDL_LEAFLET_PAGE_ID])
  })

  it('carries forward only the failed leaflet source’s pages, not the succeeding one’s superseded pages', async () => {
    const previous: DealsSnapshot = {
      offers: [
        withCrop(makeOffer('billa', { offerKey: 'stale-billa' }), BILLA_PAGE_ID),
        withCrop(makeLidlLeafletOffer({ offerKey: 'stale-lidl-leaflet' }), 'lidl-leaflet:kw31:1'),
      ],
      comparisons: [],
      leafletPages: {
        [BILLA_PAGE_ID]: makePage(3, 'https://view.publitas.com/billa/cw31/'),
        'lidl-leaflet:kw31:1': makePage(1, LIDL_LEAFLET_URL),
      },
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: {
        kaufland: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidl: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidlLeaflet: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        billa: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
      },
    }

    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlLeafletOffers: async () => ({
        offers: [withCrop(makeLidlLeafletOffer({ offerKey: 'fresh-lidl-leaflet' }), LIDL_LEAFLET_PAGE_ID)],
        leafletPages: { [LIDL_LEAFLET_PAGE_ID]: makePage(1, LIDL_LEAFLET_URL) },
      }),
      fetchBillaOffers: async () => {
        throw new Error('billa down')
      },
      readSnapshot: async () => previous,
      writeSnapshot: vi.fn(),
      logError: silentLog,
    })

    const pageIds = Object.keys(result.snapshot!.leafletPages).sort()
    expect(pageIds).toEqual([BILLA_PAGE_ID, LIDL_LEAFLET_PAGE_ID])
    expect(pageIds).not.toContain('lidl-leaflet:kw31:1')
  })

  it('prunes pages no surviving offer’s crop references', async () => {
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlLeafletOffers: async () => ({ offers: [] }),
      fetchBillaOffers: async () => ({
        offers: [withCrop(makeOffer('billa'), BILLA_PAGE_ID)],
        leafletPages: {
          [BILLA_PAGE_ID]: makePage(3, 'https://view.publitas.com/billa/cw31/'),
          'billa:cw31:4': makePage(4, 'https://view.publitas.com/billa/cw31/'),
        },
      }),
      readSnapshot: async () => null,
      writeSnapshot: vi.fn(),
      logError: silentLog,
    })

    expect(Object.keys(result.snapshot!.leafletPages)).toEqual([BILLA_PAGE_ID])
  })

  it('publishes comparisons derived from this run’s offers when classification succeeds', async () => {
    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({
        offers: [makeOffer('kaufland', { offerKey: 'k', productKey: 'k', priceEurCents: 500, unitText: '500 г' })],
      }),
      fetchLidlOffers: async () => ({
        offers: [makeOffer('lidl', { offerKey: 'l', productKey: 'l', priceEurCents: 400, unitText: '500 г' })],
      }),
      fetchLidlLeafletOffers: async () => ({ offers: [] }),
      fetchBillaOffers: async () => ({ offers: [] }),
      readSnapshot: async () => null,
      writeSnapshot,
      classifyOffers: async () => ({
        vocabulary: [{ id: 'chicken-breast', labelBg: 'Пилешко филе', labelEn: 'Chicken breast', unitBase: 'kg' }],
        assignments: { k: 'chicken-breast', l: 'chicken-breast' },
      }),
      logError: silentLog,
    })

    expect(result.snapshot!.comparisons).toHaveLength(1)
    expect(result.snapshot!.comparisons[0]!.groupKey).toBe('chicken-breast')
  })
})
