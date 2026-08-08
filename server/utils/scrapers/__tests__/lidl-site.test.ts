import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Offer } from '../../../../shared/types/offer'
import { computeProductKey } from '../../normalize'
import { isLidlXlsxOffer, LIDL_EXPORT_URL } from '../lidl'
import {
  isLidlSiteOffer,
  LidlSiteIngestionError,
  LIDL_SITE_SOURCE_URL_PREFIX,
  parseLidlSiteResponse,
  type LidlSiteSearchPage,
} from '../lidl-site'

function loadFixture(name: string): LidlSiteSearchPage {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'test/fixtures', name), 'utf8'))
}

const PAGE_1 = loadFixture('lidl-site-search.json')
const PAGE_2 = loadFixture('lidl-site-search-page2.json')

/**
 * Every fixture product's promotional window is 2026-08-03..2026-08-09 in Sofia
 * time, except the deliberately future and deliberately past entries, so one
 * injected instant mid-window exercises all three branches at once.
 */
const DURING_WINDOW = new Date('2026-08-06T09:00:00.000Z')

const silent = { logWarning: () => {} }

function parse(pages: LidlSiteSearchPage[] = [PAGE_1], now: Date = DURING_WINDOW): Offer[] {
  return parseLidlSiteResponse(pages, now, silent)
}

function byName(offers: Offer[], name: string): Offer {
  const offer = offers.find((candidate) => candidate.name === name)
  if (!offer) throw new Error(`no offer named "${name}" — got ${offers.map((o) => o.name).join(', ')}`)
  return offer
}

describe('parseLidlSiteResponse', () => {
  describe('pagination and dedupe', () => {
    it('concatenates the products of every page', () => {
      const oneNames = parse([PAGE_1]).map((offer) => offer.name)
      const bothNames = parse([PAGE_1, PAGE_2]).map((offer) => offer.name)

      expect(bothNames).toEqual(expect.arrayContaining(oneNames))
      expect(bothNames).toContain('POP UP Суши')
      expect(bothNames).toContain('AMSTEL Бира')
    })

    it('emits one offer for a product repeated across pages', () => {
      const repeated = parse([PAGE_1, PAGE_2]).filter((offer) => offer.name === 'Мини поничка')
      expect(repeated).toHaveLength(1)
    })

    it('skips entries that carry no gridbox', () => {
      // The fixture's last page-1 item is an advisor result with no product.
      expect(PAGE_1.items!.some((item) => !item.gridbox)).toBe(true)
      expect(parse()).not.toHaveLength(0)
    })
  })

  describe('filtering', () => {
    it('excludes a product whose promotion has not started yet', () => {
      const names = parse().map((offer) => offer.name)
      expect(names).not.toContain('ORLANDO Пауч за кучета')
    })

    it('includes a not-yet-started product once its window has opened', () => {
      const names = parse([PAGE_1], new Date('2026-08-12T09:00:00.000Z')).map((offer) => offer.name)
      expect(names).toContain('ORLANDO Пауч за кучета')
    })

    it('excludes a product whose promotion has already ended', () => {
      const names = parse().map((offer) => offer.name)
      expect(names).not.toContain('ORLANDO Дентални пръчици за кучета')
    })

    it('excludes a product whose availability is stated only as prose', () => {
      const names = parse().map((offer) => offer.name)
      expect(names).not.toContain('AMADORI Филе от пуешки гърди')
    })

    it('excludes a non-food product', () => {
      const names = parse().map((offer) => offer.name)
      expect(names).not.toContain('ESMARA Рокля')
    })

    it('includes drinks, which sit under a different top-level department than food', () => {
      const names = parse().map((offer) => offer.name)
      expect(names).toContain('РОДНА СТРЯХА Гроздова ракия XXL')
    })

    it('excludes a product carrying no price', () => {
      const names = parse().map((offer) => offer.name)
      expect(names).not.toContain('DIAMANT Захар')
    })

    it('excludes a priced product with no discount indication', () => {
      const names = parse().map((offer) => offer.name)
      expect(names).not.toContain('VITASIA Скариди')
    })
  })

  describe('discount resolution', () => {
    it('prefers the structured percentage and publishes the previous price', () => {
      const offer = byName(parse(), 'Пълнозърнест хляб с квас')
      expect(offer.discountPercentage).toBe(51)
      expect(offer.priceEurCents).toBe(65)
      expect(offer.priceBgnCents).toBe(127)
      expect(offer.originalPriceEurCents).toBe(135)
      expect(offer.warnings).toEqual([])
    })

    it('reads the percentage from the label when no structured value is published', () => {
      const offer = byName(parse(), 'MILBONA Кашкавал')
      expect(offer.discountPercentage).toBe(34)
    })

    it('maps an absent previous price to null rather than zero', () => {
      const offer = byName(parse(), 'MILBONA Кашкавал')
      expect(offer.originalPriceEurCents).toBeNull()
    })

    it('publishes an unquantifiable reduction as zero, with a warning naming the label', () => {
      const offer = byName(parse(), 'MEAT REVOLUTION Свински ребра Spare ribs')
      expect(offer.discountPercentage).toBe(0)
      expect(offer.warnings).toHaveLength(1)
      expect(offer.warnings[0]).toContain('Акция')
    })

    it('warns that a quantity promotion is not a price reduction', () => {
      const offer = byName(parse(), 'СЛЪНЧО Пшеничени пръчици XXL')
      expect(offer.warnings.some((warning) => warning.includes('quantity promotion'))).toBe(true)
    })

    it('warns that a product’s Lidl Plus price is not ingested', () => {
      const offer = byName(parse(), 'Пура')
      expect(offer.warnings.some((warning) => warning.includes('Lidl Plus'))).toBe(true)
    })
  })

  describe('imagery', () => {
    it('publishes the image URL exactly as the listing states it', () => {
      const offer = byName(parse(), 'Пълнозърнест хляб с квас')
      const published = PAGE_1.items!.find((item) => item.gridbox?.data?.erpNumber === '10060682')!.gridbox!.data!.image
      expect(offer.imageUrl).toBe(published)
      expect(offer.imageUrl).toContain('imgproxy-retcat.assets.schwarz')
    })

    it('publishes a product with no photograph, with a null image URL', () => {
      const offer = byName(parse(), 'Брецел')
      expect(offer.imageUrl).toBeNull()
    })

    it('never carries an imageCrop key, not even a null one', () => {
      for (const offer of parse()) {
        expect('imageCrop' in offer).toBe(false)
      }
    })
  })

  describe('identity', () => {
    it('leaves ean null even though the listing publishes an article number', () => {
      const raw = PAGE_1.items!.find((item) => item.gridbox?.data?.erpNumber === '10060682')!.gridbox!.data!
      expect(raw.ians).not.toHaveLength(0)
      expect(byName(parse(), 'Пълнозърнест хляб с квас').ean).toBeNull()
    })

    it('falls back to the retailer-scoped name+unit hash for the product key', () => {
      const offer = byName(parse(), 'Пълнозърнест хляб с квас')
      expect(offer.productKey).toBe(
        computeProductKey({ retailer: 'lidl', name: 'Пълнозърнест хляб с квас', unitText: '500 g/бр.', ean: null }),
      )
      expect(offer.productKey.startsWith('name:')).toBe(true)
      expect(offer.offerKey).toBe(`${offer.productKey}:2026-08-03`)
    })
  })

  describe('provenance and shared fields', () => {
    it('points sourceUrl at the product’s own page', () => {
      const offer = byName(parse(), 'MILBONA Кашкавал')
      expect(offer.sourceUrl).toBe(`${LIDL_SITE_SOURCE_URL_PREFIX}/p/milbona-kaskaval/p10060798`)
    })

    it('publishes the Sofia calendar dates the promotional window spans', () => {
      const offer = byName(parse(), 'MILBONA Кашкавал')
      expect(offer.validFrom).toBe('2026-08-03')
      expect(offer.validUntil).toBe('2026-08-09')
    })

    it('tags every offer as national Lidl with the run’s timestamp', () => {
      for (const offer of parse()) {
        expect(offer.retailer).toBe('lidl')
        expect(offer.scope).toBe('national')
        expect(offer.store).toBeNull()
        expect(offer.loyaltyTier).toBe('none')
        expect(offer.mechanic).toBe('standard')
        expect(offer.scrapedAt).toBe(DURING_WINDOW.toISOString())
      }
    })

    it('carries the listing’s own category label and brand', () => {
      const offer = byName(parse(), 'MILBONA Кашкавал')
      expect(offer.brand).toBe('MILBONA')
      expect(offer.category).toContain('Храна и близки до нея храни')
      expect(offer.unitText).toBe('1.5 кg/опаковка')
    })
  })

  describe('distinguishing this source from the Lidl price list', () => {
    it('claims its own offers and disclaims the XLSX source’s', () => {
      const siteOffer = byName(parse(), 'MILBONA Кашкавал')
      const xlsxOffer: Offer = { ...siteOffer, sourceUrl: LIDL_EXPORT_URL }

      expect(isLidlSiteOffer(siteOffer)).toBe(true)
      expect(isLidlXlsxOffer(siteOffer)).toBe(false)
      expect(isLidlSiteOffer(xlsxOffer)).toBe(false)
      expect(isLidlXlsxOffer(xlsxOffer)).toBe(true)
    })
  })

  describe('failure', () => {
    it('throws rather than returning an empty array when the payload has no items', () => {
      expect(() => parse([{ numFound: 639 } as LidlSiteSearchPage])).toThrow(LidlSiteIngestionError)
    })

    it('throws when one page of a multi-page read is malformed', () => {
      expect(() => parse([PAGE_1, { items: null } as LidlSiteSearchPage])).toThrow(LidlSiteIngestionError)
    })
  })

  it('reports the post-filter offer count so a collapse is visible', () => {
    const messages: string[] = []
    const offers = parseLidlSiteResponse([PAGE_1], DURING_WINDOW, { logWarning: (m) => messages.push(m) })

    expect(messages.some((message) => message.includes(`${offers.length} live discounted food offer`))).toBe(true)
  })
})
