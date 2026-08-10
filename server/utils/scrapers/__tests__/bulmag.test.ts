import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Offer } from '../../../../shared/types/offer'
import { computeProductKey } from '../../normalize'
import { parseQuantity } from '../../quantity'
import {
  BULMAG_API_BASE,
  BULMAG_PRODUCT_URL_PREFIX,
  BulmagIngestionError,
  fetchBulmagOffers,
  parseBulmagOffers,
  withRetry,
  type BulmagDetailResponse,
  type BulmagListResponse,
  type FetchBulmagOffersDeps,
  type ParseBulmagOffersDeps,
} from '../bulmag'

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'test/fixtures', name), 'utf8')) as T
}

/** Bypasses the generic `<T>` request signature, which a concrete stub can never structurally satisfy. */
function asRequest(fn: (url: string, query: Record<string, string | number>) => Promise<unknown>): NonNullable<FetchBulmagOffersDeps['request']> {
  return fn as unknown as NonNullable<FetchBulmagOffersDeps['request']>
}

function statusError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}

const LIST_ITEMS = loadFixture<unknown[]>('bulmag-list-items.json') as Parameters<typeof parseBulmagOffers>[0]
const NOW = new Date('2026-08-11T09:00:00.000Z')
const VALIDITY = { validFrom: '2026-08-10', validUntil: '2026-08-16' }
const silent: ParseBulmagOffersDeps = { logWarning: () => {} }

function byName(offers: Offer[], name: string): Offer {
  const offer = offers.find((candidate) => candidate.name === name)
  if (!offer) throw new Error(`no offer named "${name}" — got ${offers.map((o) => o.name).join(', ')}`)
  return offer
}

function parse(items = LIST_ITEMS, deps: ParseBulmagOffersDeps = silent): Offer[] {
  return parseBulmagOffers(items, VALIDITY, NOW, deps)
}

describe('parseBulmagOffers', () => {
  describe('pagination and dedupe', () => {
    it('emits one offer for a product repeated across pages', () => {
      const repeated = parse().filter((offer) => offer.name === 'Картофи мити II')
      expect(repeated).toHaveLength(1)
    })
  })

  describe('identity', () => {
    it('leaves ean null even though the listing publishes internal number/id codes', () => {
      expect(byName(parse(), 'Картофи мити II').ean).toBeNull()
    })

    it('derives the product key from name and unit text rather than a Bulmag-internal code', () => {
      const offer = byName(parse(), 'Питка земел кайзер Симид 60гр')
      expect(offer.productKey).toBe(
        computeProductKey({ retailer: 'bulmag', name: 'Питка земел кайзер Симид 60гр', unitText: '60 гр', ean: null }),
      )
      expect(offer.productKey.startsWith('name:')).toBe(true)
      expect(offer.offerKey).toBe(`${offer.productKey}:2026-08-10`)
    })
  })

  describe('brand', () => {
    it('maps a missing brand to null', () => {
      expect(byName(parse(), 'Картофи мити II').brand).toBeNull()
    })
  })

  describe('unitText derivation', () => {
    it('extracts a quantity embedded in the product name', () => {
      const offer = byName(parse(), 'Питка земел кайзер Симид 60гр')
      expect(offer.unitText).toBe('60 гр')
      expect(parseQuantity(offer.unitText)).not.toBeNull()
    })

    it('defaults to a single-piece quantity for a БР item with no size in the name', () => {
      const offer = byName(parse(), 'Свинска над. Наша Транжорна печена')
      expect(offer.unitText).toBe('1 бр')
      expect(parseQuantity(offer.unitText)).not.toBeNull()
    })

    it('omits unitText with a warning for a loose-weight item with no confident quantity', () => {
      const offer = byName(parse(), 'Картофи мити II')
      expect(offer.unitText).toBe('')
      expect(offer.warnings).toHaveLength(1)
      expect(offer.warnings[0]).toContain('Картофи мити II')
      expect(parseQuantity(offer.unitText)).toBeNull()
    })
  })

  describe('pricing', () => {
    it('maps price fields to integer cents', () => {
      const offer = byName(parse(), 'Картофи мити II')
      expect(offer.priceEurCents).toBe(69)
      expect(offer.priceBgnCents).toBe(135)
      expect(offer.originalPriceEurCents).toBe(86)
      expect(offer.discountPercentage).toBe(20)
    })

    it('maps a zero previous price to null rather than "previously free"', () => {
      expect(byName(parse(), 'Тест продукт без предишна цена 500гр').originalPriceEurCents).toBeNull()
    })

    it('maps a previous price equal to the promo price to null', () => {
      expect(byName(parse(), 'Тест продукт с равна цена 300гр').originalPriceEurCents).toBeNull()
    })
  })

  describe('imagery', () => {
    it('publishes the image URL from imageThumbnail', () => {
      expect(byName(parse(), 'Картофи мити II').imageUrl).toBe(
        'https://api.bulmag.org/thumbnails/8bc2c806943bd3094a082f8bf949ee09.jpeg',
      )
    })

    it('maps an empty imageThumbnail to a null image URL', () => {
      expect(byName(parse(), 'Тест продукт без снимка 200гр').imageUrl).toBeNull()
    })

    it('never carries an imageCrop key, not even a null one', () => {
      for (const offer of parse()) {
        expect('imageCrop' in offer).toBe(false)
      }
    })
  })

  describe('provenance and shared fields', () => {
    it('points sourceUrl at the product’s own page', () => {
      expect(byName(parse(), 'Картофи мити II').sourceUrl).toBe(`${BULMAG_PRODUCT_URL_PREFIX}/kartofi-miti-ii`)
    })

    it('tags every offer as national Bulmag with the given validity window and the run’s timestamp', () => {
      for (const offer of parse()) {
        expect(offer.retailer).toBe('bulmag')
        expect(offer.scope).toBe('national')
        expect(offer.store).toBeNull()
        expect(offer.loyaltyTier).toBe('none')
        expect(offer.mechanic).toBe('standard')
        expect(offer.campaign).toBeNull()
        expect(offer.purchaseLimit).toBeNull()
        expect(offer.validFrom).toBe('2026-08-10')
        expect(offer.validUntil).toBe('2026-08-16')
        expect(offer.scrapedAt).toBe(NOW.toISOString())
      }
    })
  })

  it('logs the distinct special tag labels observed, so a missed BOGO-style badge is visible', () => {
    const messages: string[] = []
    parse(LIST_ITEMS, { logWarning: (message) => messages.push(message) })

    const tagMessage = messages.find((message) => message.includes('special tags'))
    expect(tagMessage).toBeDefined()
    expect(tagMessage).toContain('Наша транжорна')
    expect(tagMessage).toContain('tag-frozen.png')
  })

  it('reports the post-mapping offer count so a collapse is visible', () => {
    const messages: string[] = []
    const offers = parseBulmagOffers(LIST_ITEMS, VALIDITY, NOW, { logWarning: (message) => messages.push(message) })

    expect(messages.some((message) => message.includes(`${offers.length} brochure offer`))).toBe(true)
  })
})

describe('withRetry', () => {
  it('returns the result on first success without sleeping', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi.fn(async () => 'ok')

    await expect(withRetry(fn, { sleep })).resolves.toBe('ok')
    expect(sleep).not.toHaveBeenCalled()
  })

  it('retries a retryable failure with backoff and eventually succeeds', async () => {
    const sleep = vi.fn(async () => {})
    let attempts = 0
    const fn = vi.fn(async () => {
      attempts += 1
      if (attempts < 3) throw statusError(503, 'service unavailable')
      return 'ok'
    })

    await expect(withRetry(fn, { sleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on a non-retryable status without sleeping', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi.fn(async () => {
      throw statusError(400, 'bad request')
    })

    await expect(withRetry(fn, { sleep })).rejects.toThrow('bad request')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('exhausts retries and throws the last error', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi.fn(async () => {
      throw statusError(429, 'rate limited')
    })

    await expect(withRetry(fn, { sleep })).rejects.toThrow('rate limited')
    expect(fn.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('fetchBulmagOffers', () => {
  const sleep = async () => {}

  const LIST_PAGE1 = loadFixture<BulmagListResponse>('bulmag-list-tagged-page1.json')
  const LIST_PAGE2 = loadFixture<BulmagListResponse>('bulmag-list-tagged-page2.json')
  const UNTAGGED_PASS = loadFixture<BulmagListResponse>('bulmag-list-untagged-pass.json')
  const UNTAGGED_MISMATCH = loadFixture<BulmagListResponse>('bulmag-list-untagged-mismatch.json')
  const DETAIL_KARTOFI = loadFixture<BulmagDetailResponse>('bulmag-detail-kartofi-miti-ii.json')
  const DETAIL_PITKA = loadFixture<BulmagDetailResponse>('bulmag-detail-pitka-zemel-kayzer-simid-60gr.json')
  const DETAIL_IZVORNA = loadFixture<BulmagDetailResponse>('bulmag-detail-izvorna-voda-devin-11l.json')
  const DETAIL_DISAGREE = loadFixture<BulmagDetailResponse>('bulmag-detail-disagreeing-window.json')
  const DETAIL_MALFORMED = loadFixture<BulmagDetailResponse>('bulmag-detail-malformed-window.json')

  function detailFor(url: string): BulmagDetailResponse {
    if (url.endsWith('/kartofi-miti-ii')) return DETAIL_KARTOFI
    if (url.endsWith('/pitka-zemel-kayzer-simid-60gr')) return DETAIL_PITKA
    if (url.endsWith('/izvorna-voda-devin-11l')) return DETAIL_IZVORNA
    throw new Error(`unexpected detail request: ${url}`)
  }

  it('paginates the tagged listing, advancing by what is actually returned, and maps every listed item', async () => {
    const request = asRequest(async (url, query) => {
      if (url === BULMAG_API_BASE) {
        if (query.productTagIds) return query.page === 1 ? LIST_PAGE1 : LIST_PAGE2
        return UNTAGGED_PASS
      }
      return detailFor(url)
    })

    const offers = await fetchBulmagOffers({ request, sleep, now: () => NOW, logWarning: () => {} })

    expect(offers.map((offer) => offer.name).sort()).toEqual(
      ['Изворна вода Devin 11л', 'Картофи мити II', 'Питка земел кайзер Симид 60гр'].sort(),
    )
  })

  it('fails closed rather than falling back to the full catalog when the brochure tag stops filtering', async () => {
    const request = asRequest(async (url, query) => {
      if (url === BULMAG_API_BASE) return query.productTagIds ? LIST_PAGE1 : UNTAGGED_MISMATCH
      throw new Error(`unexpected request: ${url}`)
    })

    await expect(fetchBulmagOffers({ request, sleep, now: () => NOW, logWarning: () => {} })).rejects.toThrow(
      BulmagIngestionError,
    )
  })

  it('fails closed when sampled products disagree on the validity window', async () => {
    const request = asRequest(async (url, query) => {
      if (url === BULMAG_API_BASE) {
        if (query.productTagIds) return query.page === 1 ? LIST_PAGE1 : LIST_PAGE2
        return UNTAGGED_PASS
      }
      if (url.endsWith('/pitka-zemel-kayzer-simid-60gr')) return DETAIL_DISAGREE
      return detailFor(url)
    })

    await expect(fetchBulmagOffers({ request, sleep, now: () => NOW, logWarning: () => {} })).rejects.toThrow(
      BulmagIngestionError,
    )
  })

  it('fails closed when every date-window probe returns an unparseable date', async () => {
    const request = asRequest(async (url, query) => {
      if (url === BULMAG_API_BASE) {
        if (query.productTagIds) return query.page === 1 ? LIST_PAGE1 : LIST_PAGE2
        return UNTAGGED_PASS
      }
      return DETAIL_MALFORMED
    })

    await expect(fetchBulmagOffers({ request, sleep, now: () => NOW, logWarning: () => {} })).rejects.toThrow(
      BulmagIngestionError,
    )
  })

  it('retries a transient failure fetching the first listing page and still succeeds', async () => {
    let firstPageAttempts = 0
    const request = asRequest(async (url, query) => {
      if (url === BULMAG_API_BASE && query.productTagIds && query.page === 1) {
        firstPageAttempts += 1
        if (firstPageAttempts < 3) throw statusError(503, 'temporarily unavailable')
        return LIST_PAGE1
      }
      if (url === BULMAG_API_BASE) {
        if (query.productTagIds) return LIST_PAGE2
        return UNTAGGED_PASS
      }
      return detailFor(url)
    })

    const offers = await fetchBulmagOffers({ request, sleep, now: () => NOW, logWarning: () => {} })

    expect(offers).toHaveLength(3)
    expect(firstPageAttempts).toBe(3)
  })

  it('exhausts retries on a persistently failing listing page and fails the run', async () => {
    const request = asRequest(async (url, query) => {
      if (url === BULMAG_API_BASE && query.productTagIds && query.page === 1) {
        throw statusError(429, 'rate limited')
      }
      throw new Error(`unexpected request: ${url}`)
    })

    await expect(fetchBulmagOffers({ request, sleep, now: () => NOW, logWarning: () => {} })).rejects.toThrow(
      BulmagIngestionError,
    )
  })
})
