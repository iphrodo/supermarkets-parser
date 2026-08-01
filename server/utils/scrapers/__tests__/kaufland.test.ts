import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseKauflandHtml } from '../kaufland'

const fixtureUrl = new URL('../../../../test/fixtures/kaufland-oferti.html', import.meta.url)
const fixtureHtml = readFileSync(fileURLToPath(fixtureUrl), 'utf-8')

describe('parseKauflandHtml', () => {
  const offers = parseKauflandHtml(fixtureHtml)

  it('parses every offer in the fixture', () => {
    expect(offers).toHaveLength(10)
  })

  it('handles a tile without a crossed-out original price', () => {
    const offer = offers.find((o) => o.name.startsWith('Луканка'))
    expect(offer).toBeDefined()
    expect(offer!.originalPriceEurCents).toBeNull()
  })

  it('extracts EAN from the product image URL when present', () => {
    const aloma = offers.find((o) => o.brand === 'ALOMA')
    expect(aloma!.ean).toBe('8606018614950')
    expect(aloma!.imageUrl).toBe('https://kaufland.media.schwarz/is/image/schwarz/8606018614950_BG_P')
  })

  it('leaves EAN null when no barcode segment is present', () => {
    const potatoes = offers.find((o) => o.name === 'Клас: I')
    expect(potatoes!.ean).toBeNull()
  })

  it('populates imageUrl even when no barcode segment is present in the image URL', () => {
    const potatoes = offers.find((o) => o.name === 'Клас: I')
    expect(potatoes!.ean).toBeNull()
    expect(potatoes!.imageUrl).not.toBeNull()
  })

  it('sets both ean and imageUrl to null when the tile has no image URL at all', () => {
    const offer = offers.find((o) => o.brand === 'No Image Product')
    expect(offer).toBeDefined()
    expect(offer!.ean).toBeNull()
    expect(offer!.imageUrl).toBeNull()
  })

  it('sets loyaltyTier to kaufland_card_xtra for a Kaufland Card Xtra price tag', () => {
    const wine = offers.find((o) => o.brand === 'SUHINDOL')
    expect(wine!.loyaltyTier).toBe('kaufland_card_xtra')
    expect(wine!.priceEurCents).toBe(429)
  })

  it('sets loyaltyTier to kaufland_card for a plain Kaufland Card discount', () => {
    const beer = offers.find((o) => o.brand === 'Stella Artois')
    expect(beer!.loyaltyTier).toBe('kaufland_card')
  })

  it('sets loyaltyTier to none when no loyalty pricing is present', () => {
    const potatoes = offers.find((o) => o.name === 'Клас: I')
    expect(potatoes!.loyaltyTier).toBe('none')
  })

  it('detects buy-1-get-1 mechanic', () => {
    const nesquik = offers.find((o) => o.brand === 'NESQUIK')
    expect(nesquik!.mechanic).toBe('buy_1_get_1_free')
  })

  it('extracts purchase limit text when present', () => {
    const potatoes = offers.find((o) => o.name === 'Клас: I')
    expect(potatoes!.purchaseLimit).toBe('до 5 кг на покупка')
  })

  it('never populates a productUrl field', () => {
    for (const offer of offers) {
      expect('productUrl' in offer).toBe(false)
    }
  })

  it('carries base-week validity with campaign null', () => {
    const potatoes = offers.find((o) => o.name === 'Клас: I')
    expect(potatoes!.validFrom).toBe('2026-07-27')
    expect(potatoes!.validUntil).toBe('2026-08-02')
    expect(potatoes!.campaign).toBeNull()
  })

  it('carries a named sub-campaign validity window distinct from the base week', () => {
    const roses = offers.find((o) => o.name.startsWith('Букет'))
    expect(roses!.campaign).toBe('Супер уикенд')
    expect(roses!.validFrom).toBe('2026-07-29')
    expect(roses!.validUntil).toBe('2026-08-01')
  })

  it('populates provenance metadata on every offer', () => {
    for (const offer of offers) {
      expect(offer.sourceUrl).toBe('https://www.kaufland.bg/aktualni-predlozheniya/oferti.html')
      expect(offer.scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})
