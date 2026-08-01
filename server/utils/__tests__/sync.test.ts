import { describe, expect, it, vi } from 'vitest'
import type { DealsSnapshot, Offer } from '../../../shared/types/offer'
import { runDailySync } from '../sync'

function makeOffer(retailer: 'kaufland' | 'lidl', overrides: Partial<Offer> = {}): Offer {
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
    sourceUrl: 'https://example.com',
    scrapedAt: '2026-08-01T00:00:00.000Z',
    warnings: [],
    ...overrides,
  }
}

const silentLog = () => {}

describe('runDailySync', () => {
  it('publishes a fresh snapshot when both sources succeed', async () => {
    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => [makeOffer('kaufland')],
      fetchLidlOffers: async () => [makeOffer('lidl')],
      readSnapshot: async () => null,
      writeSnapshot,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('success')
    expect(result.snapshot!.offers).toHaveLength(2)
    expect(writeSnapshot).toHaveBeenCalledTimes(1)
  })

  it('carries forward the failed source’s last known-good offers on partial failure', async () => {
    const previous: DealsSnapshot = {
      offers: [makeOffer('kaufland', { offerKey: 'stale-kaufland', scrapedAt: '2026-07-31T00:00:00.000Z' })],
      generatedAt: '2026-07-31T00:00:00.000Z',
      sources: {
        kaufland: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
        lidl: { ok: true, scrapedAt: '2026-07-31T00:00:00.000Z' },
      },
    }

    const writeSnapshot = vi.fn()
    const result = await runDailySync({
      fetchKauflandOffers: async () => {
        throw new Error('kaufland fetch failed')
      },
      fetchLidlOffers: async () => [makeOffer('lidl', { offerKey: 'fresh-lidl' })],
      readSnapshot: async () => previous,
      writeSnapshot,
      logError: silentLog,
    })

    expect(result.published).toBe(true)
    expect(result.reason).toBe('partial')
    const offerKeys = result.snapshot!.offers.map((o) => o.offerKey)
    expect(offerKeys).toContain('stale-kaufland')
    expect(offerKeys).toContain('fresh-lidl')
    expect(result.snapshot!.sources.kaufland.ok).toBe(false)
    expect(result.snapshot!.sources.kaufland.scrapedAt).toBe('2026-07-31T00:00:00.000Z')
  })

  it('leaves the previous snapshot untouched and does not publish when both sources fail', async () => {
    const writeSnapshot = vi.fn()
    const readSnapshot = vi.fn(async () => null)

    const result = await runDailySync({
      fetchKauflandOffers: async () => {
        throw new Error('kaufland down')
      },
      fetchLidlOffers: async () => {
        throw new Error('lidl down')
      },
      readSnapshot,
      writeSnapshot,
      logError: silentLog,
    })

    expect(result.published).toBe(false)
    expect(result.reason).toBe('total-failure')
    expect(writeSnapshot).not.toHaveBeenCalled()
  })
})
