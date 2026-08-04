import { describe, expect, it, vi } from 'vitest'
import type { DealsSnapshot, Offer } from '../../../shared/types/offer'
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

const silentLog = () => {}

describe('runDailySync', () => {
  it('publishes a fresh snapshot when all four sources succeed', async () => {
    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => [makeOffer('kaufland')],
      fetchLidlOffers: async () => [makeOffer('lidl')],
      fetchLidlLeafletOffers: async () => [makeLidlLeafletOffer()],
      fetchBillaOffers: async () => [makeOffer('billa')],
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
      fetchLidlOffers: async () => [makeOffer('lidl', { offerKey: 'fresh-lidl' })],
      fetchLidlLeafletOffers: async () => [makeLidlLeafletOffer({ offerKey: 'fresh-lidl-leaflet' })],
      fetchBillaOffers: async () => [makeOffer('billa', { offerKey: 'fresh-billa' })],
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
      fetchBillaOffers: async () => [makeOffer('billa', { offerKey: 'fresh-billa' })],
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
      fetchKauflandOffers: async () => [makeOffer('kaufland')],
      fetchLidlOffers: async () => {
        throw new Error('lidl xlsx fetch failed')
      },
      fetchLidlLeafletOffers: async () => [makeLidlLeafletOffer({ offerKey: 'fresh-lidl-leaflet' })],
      fetchBillaOffers: async () => [makeOffer('billa')],
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
})
