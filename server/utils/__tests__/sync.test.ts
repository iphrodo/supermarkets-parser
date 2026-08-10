import { describe, expect, it, vi } from 'vitest'
import type { DealsSnapshot, LeafletPage, Offer } from '../../../shared/types/offer'
import type { ProductTypeAssignments, ProductTypeVocabulary } from '../kv'
import { mergeDuplicateTypes } from '../product-type-merge'
import { runDailySync } from '../sync'

const LIDL_XLSX_URL = 'https://www.lidl.bg/explore/assets/webPriceData/bg/ExportSecondList.xlsx'
const LIDL_SITE_URL = 'https://www.lidl.bg/p/milbona-kashkaval/p10060798'
/** A leaflet source that no longer exists; its leftovers must not survive a run. */
const REMOVED_LIDL_LEAFLET_URL = 'https://www.lidl.bg/l/bg/broshura/lidl-bg-kw32-2026-08-03/ar/0'

function makeOffer(retailer: 'kaufland' | 'lidl' | 'billa' | 'bulmag', overrides: Partial<Offer> = {}): Offer {
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

function makeLidlSiteOffer(overrides: Partial<Offer> = {}): Offer {
  return makeOffer('lidl', { offerKey: 'lidl-site:key', sourceUrl: LIDL_SITE_URL, ...overrides })
}

const BILLA_PAGE_ID = 'billa:cw31:3'

function makePage(pageNumber: number, sourceUrl: string): LeafletPage {
  return { imageUrl: `https://example.com/page-${pageNumber}.jpg`, width: 676, height: 947, pageNumber, sourceUrl }
}

function withCrop(offer: Offer, pageId: string): Offer {
  return { ...offer, imageCrop: { pageId, box: [100, 100, 300, 300] } }
}

function makeSources(scrapedAt = '2026-07-31T00:00:00.000Z'): DealsSnapshot['sources'] {
  return {
    kaufland: { ok: true, scrapedAt },
    lidl: { ok: true, scrapedAt },
    lidlSite: { ok: true, scrapedAt },
    billa: { ok: true, scrapedAt },
    bulmag: { ok: true, scrapedAt },
  }
}

const silentLog = () => {}

/**
 * These tests exercise orchestration, not the backfill, and the real one calls
 * the model. Injected everywhere so no `runDailySync` test can reach the
 * network through it — the vocabulary passes straight through.
 */
const passthroughBackfill = async (vocabulary: ProductTypeVocabulary) => vocabulary

/** Same, for the duplicate-type merge: the real one writes to KV. */
const passthroughMerge = async (vocabulary: ProductTypeVocabulary, assignments: ProductTypeAssignments) => ({
  vocabulary,
  assignments,
})

describe('runDailySync', () => {
  it('publishes a fresh snapshot when all five sources succeed', async () => {
    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlSiteOffers: async () => ({ offers: [makeLidlSiteOffer()] }),
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa')] }),
      fetchBulmagOffers: async () => ({ offers: [makeOffer('bulmag')] }),
      readSnapshot: async () => null,
      writeSnapshot,
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('success')
    expect(result.snapshot!.offers).toHaveLength(5)
    expect(result.snapshot!.sources.lidlSite.ok).toBe(true)
    expect(result.snapshot!.sources.bulmag.ok).toBe(true)
    expect(writeSnapshot).toHaveBeenCalledTimes(1)
  })

  it('carries forward Bulmag’s own last known-good offers when only it fails', async () => {
    const previous: DealsSnapshot = {
      offers: [makeOffer('bulmag', { offerKey: 'stale-bulmag', scrapedAt: '2026-07-31T00:00:00.000Z' })],
      comparisons: [],
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: makeSources(),
    }

    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlSiteOffers: async () => ({ offers: [makeLidlSiteOffer()] }),
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa')] }),
      fetchBulmagOffers: async () => {
        throw new Error('bulmag fetch failed')
      },
      readSnapshot: async () => previous,
      writeSnapshot: vi.fn(),
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('partial')
    expect(result.snapshot!.offers.map((o) => o.offerKey)).toContain('stale-bulmag')
    expect(result.snapshot!.sources.bulmag.ok).toBe(false)
    expect(result.snapshot!.sources.bulmag.scrapedAt).toBe('2026-07-31T00:00:00.000Z')
  })

  it('carries forward a failed source’s last known-good offers when the others succeed', async () => {
    const previous: DealsSnapshot = {
      offers: [makeOffer('kaufland', { offerKey: 'stale-kaufland', scrapedAt: '2026-07-31T00:00:00.000Z' })],
      comparisons: [],
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: makeSources(),
    }

    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => {
        throw new Error('kaufland fetch failed')
      },
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl', { offerKey: 'fresh-lidl' })] }),
      fetchLidlSiteOffers: async () => ({ offers: [makeLidlSiteOffer({ offerKey: 'fresh-lidl-site' })] }),
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa', { offerKey: 'fresh-billa' })] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => previous,
      writeSnapshot,
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('partial')
    const offerKeys = result.snapshot!.offers.map((o) => o.offerKey)
    expect(offerKeys).toContain('stale-kaufland')
    expect(offerKeys).toContain('fresh-lidl')
    expect(offerKeys).toContain('fresh-lidl-site')
    expect(offerKeys).toContain('fresh-billa')
    expect(result.snapshot!.sources.kaufland.ok).toBe(false)
    expect(result.snapshot!.sources.kaufland.scrapedAt).toBe('2026-07-31T00:00:00.000Z')
  })

  it('carries forward the Lidl site source’s own last known-good offers when only it fails', async () => {
    const previous: DealsSnapshot = {
      offers: [
        makeLidlSiteOffer({ offerKey: 'stale-lidl-site', scrapedAt: '2026-07-31T00:00:00.000Z' }),
        makeOffer('lidl', { offerKey: 'stale-lidl-xlsx' }),
      ],
      comparisons: [],
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: makeSources(),
    }

    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl', { offerKey: 'fresh-lidl-xlsx' })] }),
      fetchLidlSiteOffers: async () => {
        throw new Error('lidl site down')
      },
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa')] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => previous,
      writeSnapshot: vi.fn(),
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    const offerKeys = result.snapshot!.offers.map((o) => o.offerKey)
    expect(offerKeys).toContain('stale-lidl-site')
    expect(offerKeys).toContain('fresh-lidl-xlsx')
    expect(offerKeys).not.toContain('stale-lidl-xlsx')
    expect(result.snapshot!.sources.lidlSite.ok).toBe(false)
    expect(result.snapshot!.sources.lidlSite.scrapedAt).toBe('2026-07-31T00:00:00.000Z')
  })

  it('treats a source the previous snapshot never knew about as having no last known-good data', async () => {
    // A snapshot written before `lidlLeaflet` was renamed to `lidlSite`: it
    // carries no status for the source this run knows about.
    const previous = {
      offers: [
        makeOffer('kaufland', { offerKey: 'stale-kaufland' }),
        makeOffer('lidl', { offerKey: 'stale-lidl-leaflet', sourceUrl: REMOVED_LIDL_LEAFLET_URL }),
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
    } as unknown as DealsSnapshot

    const result = await runDailySync({
      fetchKauflandOffers: async () => {
        throw new Error('kaufland down')
      },
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl', { offerKey: 'fresh-lidl' })] }),
      fetchLidlSiteOffers: async () => {
        throw new Error('lidl site down')
      },
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa')] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => previous,
      writeSnapshot: vi.fn(),
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.snapshot!.sources.lidlSite).toEqual({ ok: false, scrapedAt: null })
    // Carry-forward for the sources the snapshot does know about still works.
    expect(result.snapshot!.offers.map((o) => o.offerKey)).toContain('stale-kaufland')
    // The removed leaflet source's offers belong to no current source.
    expect(result.snapshot!.offers.map((o) => o.offerKey)).not.toContain('stale-lidl-leaflet')
  })

  it('publishes with only Billa fresh when Kaufland, Lidl, and the Lidl site source all fail', async () => {
    const previous: DealsSnapshot = {
      offers: [makeOffer('kaufland', { offerKey: 'stale-kaufland' }), makeOffer('lidl', { offerKey: 'stale-lidl' })],
      comparisons: [],
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: makeSources(),
    }

    const result = await runDailySync({
      fetchKauflandOffers: async () => {
        throw new Error('kaufland down')
      },
      fetchLidlOffers: async () => {
        throw new Error('lidl down')
      },
      fetchLidlSiteOffers: async () => {
        throw new Error('lidl site down')
      },
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa', { offerKey: 'fresh-billa' })] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => previous,
      writeSnapshot: vi.fn(),
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('partial')
    const offerKeys = result.snapshot!.offers.map((o) => o.offerKey)
    expect(offerKeys).toEqual(expect.arrayContaining(['stale-kaufland', 'stale-lidl', 'fresh-billa']))
  })

  it('leaves the previous snapshot untouched and does not publish when all five sources fail', async () => {
    const writeSnapshot = vi.fn()
    const readSnapshot = vi.fn(async () => null)

    const result = await runDailySync({
      fetchKauflandOffers: async () => {
        throw new Error('kaufland down')
      },
      fetchLidlOffers: async () => {
        throw new Error('lidl down')
      },
      fetchLidlSiteOffers: async () => {
        throw new Error('lidl site down')
      },
      fetchBillaOffers: async () => {
        throw new Error('billa down')
      },
      fetchBulmagOffers: async () => {
        throw new Error('bulmag down')
      },
      readSnapshot,
      writeSnapshot,
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(result.published).toBe(false)
    expect(result.reason).toBe('total-failure')
    expect(writeSnapshot).not.toHaveBeenCalled()
  })

  it('does not resurrect the still-succeeding Lidl site source’s stale offers when only the XLSX source fails', async () => {
    const previous: DealsSnapshot = {
      offers: [
        makeOffer('lidl', { offerKey: 'stale-lidl-xlsx', sourceUrl: LIDL_XLSX_URL }),
        makeLidlSiteOffer({ offerKey: 'stale-lidl-site' }),
      ],
      comparisons: [],
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: makeSources(),
    }

    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => {
        throw new Error('lidl xlsx fetch failed')
      },
      fetchLidlSiteOffers: async () => ({ offers: [makeLidlSiteOffer({ offerKey: 'fresh-lidl-site' })] }),
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa')] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => previous,
      writeSnapshot,
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('partial')
    const offerKeys = result.snapshot!.offers.map((o) => o.offerKey)
    expect(offerKeys).toContain('stale-lidl-xlsx')
    expect(offerKeys).toContain('fresh-lidl-site')
    expect(offerKeys).not.toContain('stale-lidl-site')
  })

  it('publishes with the previous comparisons when comparison enrichment fails', async () => {
    const previousComparisons: DealsSnapshot['comparisons'] = [
      {
        groupKey: 'chicken-breast',
        labelBg: 'Пилешко филе',
        unitBase: 'kg',
        department: 'meat',
        entries: [],
        savingsPercentage: 0.2,
        warnings: [],
      },
    ]
    const previous: DealsSnapshot = {
      offers: [],
      comparisons: previousComparisons,
      leafletPages: {},
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: makeSources(),
    }

    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlSiteOffers: async () => ({ offers: [makeLidlSiteOffer()] }),
      fetchBillaOffers: async () => ({ offers: [makeOffer('billa')] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => previous,
      writeSnapshot,
      classifyOffers: async () => {
        throw new Error('classification service unavailable')
      },
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.snapshot!.comparisons).toEqual(previousComparisons)
  })

  it('publishes Billa’s page registry alongside the page-free sources’ offers', async () => {
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlSiteOffers: async () => ({ offers: [makeLidlSiteOffer()] }),
      fetchBillaOffers: async () => ({
        offers: [withCrop(makeOffer('billa'), BILLA_PAGE_ID)],
        leafletPages: { [BILLA_PAGE_ID]: makePage(3, 'https://view.publitas.com/billa/cw31/') },
      }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => null,
      writeSnapshot: vi.fn(),
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(Object.keys(result.snapshot!.leafletPages)).toEqual([BILLA_PAGE_ID])
  })

  it('drops a removed source’s leftover offers and prunes the pages only they referenced', async () => {
    const previous: DealsSnapshot = {
      offers: [
        withCrop(makeOffer('billa', { offerKey: 'stale-billa' }), BILLA_PAGE_ID),
        withCrop(
          makeOffer('lidl', { offerKey: 'stale-lidl-leaflet', sourceUrl: REMOVED_LIDL_LEAFLET_URL }),
          'lidl-leaflet:kw31:1',
        ),
      ],
      comparisons: [],
      leafletPages: {
        [BILLA_PAGE_ID]: makePage(3, 'https://view.publitas.com/billa/cw31/'),
        'lidl-leaflet:kw31:1': makePage(1, REMOVED_LIDL_LEAFLET_URL),
      },
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: makeSources(),
    }

    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlSiteOffers: async () => ({ offers: [makeLidlSiteOffer()] }),
      fetchBillaOffers: async () => {
        throw new Error('billa down')
      },
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => previous,
      writeSnapshot: vi.fn(),
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    const offerKeys = result.snapshot!.offers.map((o) => o.offerKey)
    expect(offerKeys).toContain('stale-billa')
    expect(offerKeys).not.toContain('stale-lidl-leaflet')
    expect(Object.keys(result.snapshot!.leafletPages)).toEqual([BILLA_PAGE_ID])
  })

  it('prunes pages no surviving offer’s crop references', async () => {
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlSiteOffers: async () => ({ offers: [] }),
      fetchBillaOffers: async () => ({
        offers: [withCrop(makeOffer('billa'), BILLA_PAGE_ID)],
        leafletPages: {
          [BILLA_PAGE_ID]: makePage(3, 'https://view.publitas.com/billa/cw31/'),
          'billa:cw31:4': makePage(4, 'https://view.publitas.com/billa/cw31/'),
        },
      }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => null,
      writeSnapshot: vi.fn(),
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
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
      fetchLidlSiteOffers: async () => ({ offers: [] }),
      fetchBillaOffers: async () => ({ offers: [] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => null,
      writeSnapshot,
      classifyOffers: async () => ({
        vocabulary: [{ id: 'chicken-breast', labelBg: 'Пилешко филе', labelEn: 'Chicken breast', unitBase: 'kg' }],
        assignments: { k: 'chicken-breast', l: 'chicken-breast' },
      }),
      backfillDepartments: passthroughBackfill,
      mergeDuplicateTypes: passthroughMerge,
      logError: silentLog,
    })

    expect(result.snapshot!.comparisons).toHaveLength(1)
    expect(result.snapshot!.comparisons[0]!.groupKey).toBe('chicken-breast')
  })

  it('builds comparisons from the backfilled vocabulary, so a department reaches the snapshot on the run it is assigned', async () => {
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({
        offers: [makeOffer('kaufland', { offerKey: 'k', productKey: 'k', priceEurCents: 500, unitText: '500 г' })],
      }),
      fetchLidlOffers: async () => ({
        offers: [makeOffer('lidl', { offerKey: 'l', productKey: 'l', priceEurCents: 400, unitText: '500 г' })],
      }),
      fetchLidlSiteOffers: async () => ({ offers: [] }),
      fetchBillaOffers: async () => ({ offers: [] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => null,
      writeSnapshot: vi.fn(),
      classifyOffers: async () => ({
        // A vocabulary entry that predates departments.
        vocabulary: [{ id: 'chicken-breast', labelBg: 'Пилешко филе', labelEn: 'Chicken breast', unitBase: 'kg' }],
        assignments: { k: 'chicken-breast', l: 'chicken-breast' },
      }),
      backfillDepartments: async (vocabulary) => vocabulary.map((type) => ({ ...type, department: 'meat' as const })),
      logError: silentLog,
    })

    expect(result.snapshot!.comparisons[0]!.department).toBe('meat')
  })

  it('builds comparisons from the merged vocabulary and assignments', async () => {
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({
        offers: [makeOffer('kaufland', { offerKey: 'k', productKey: 'k', priceEurCents: 500, unitText: '500 г' })],
      }),
      fetchLidlOffers: async () => ({
        offers: [makeOffer('lidl', { offerKey: 'l', productKey: 'l', priceEurCents: 400, unitText: '500 г' })],
      }),
      fetchLidlSiteOffers: async () => ({ offers: [] }),
      fetchBillaOffers: async () => ({ offers: [] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => null,
      writeSnapshot: vi.fn(),
      // One product kind split across two duplicate types, one retailer each —
      // neither type alone clears the two-retailer bar.
      classifyOffers: async () => ({
        vocabulary: [
          { id: 'кисело-мляко', labelBg: 'кисело мляко', labelEn: 'Yogurt', unitBase: 'kg', department: 'dairy-eggs' },
          { id: 'кисело-мляко-2', labelBg: 'кисело мляко', labelEn: 'Yogurt', unitBase: 'kg', department: 'dairy-eggs' },
        ],
        assignments: { k: 'кисело-мляко', l: 'кисело-мляко-2' },
      }),
      mergeDuplicateTypes: async (vocabulary, assignments) =>
        mergeDuplicateTypes(vocabulary, assignments),
      backfillDepartments: passthroughBackfill,
      logError: silentLog,
    })

    // Merging them makes one group covering both retailers.
    expect(result.snapshot!.comparisons).toHaveLength(1)
    expect(result.snapshot!.comparisons[0]!.entries.map((e) => e.retailer).sort()).toEqual(['kaufland', 'lidl'])
  })

  it('still publishes when the duplicate-type merge fails', async () => {
    const logError = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({ offers: [makeOffer('kaufland')] }),
      fetchLidlOffers: async () => ({ offers: [makeOffer('lidl')] }),
      fetchLidlSiteOffers: async () => ({ offers: [] }),
      fetchBillaOffers: async () => ({ offers: [] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => null,
      writeSnapshot: vi.fn(),
      mergeDuplicateTypes: async () => {
        throw new Error('KV unavailable')
      },
      backfillDepartments: passthroughBackfill,
      logError,
    })

    expect(result.published).toBe(true)
    expect(logError).toHaveBeenCalledOnce()
  })

  it('still publishes when the department backfill fails', async () => {
    const logError = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => ({
        offers: [makeOffer('kaufland', { offerKey: 'k', productKey: 'k', priceEurCents: 500, unitText: '500 г' })],
      }),
      fetchLidlOffers: async () => ({
        offers: [makeOffer('lidl', { offerKey: 'l', productKey: 'l', priceEurCents: 400, unitText: '500 г' })],
      }),
      fetchLidlSiteOffers: async () => ({ offers: [] }),
      fetchBillaOffers: async () => ({ offers: [] }),
      fetchBulmagOffers: async () => ({ offers: [] }),
      readSnapshot: async () => null,
      writeSnapshot: vi.fn(),
      classifyOffers: async () => ({
        vocabulary: [{ id: 'chicken-breast', labelBg: 'Пилешко филе', labelEn: 'Chicken breast', unitBase: 'kg' }],
        assignments: { k: 'chicken-breast', l: 'chicken-breast' },
      }),
      backfillDepartments: async () => {
        throw new Error('model unavailable')
      },
      logError,
    })

    expect(result.published).toBe(true)
    expect(logError).toHaveBeenCalledOnce()
  })
})
