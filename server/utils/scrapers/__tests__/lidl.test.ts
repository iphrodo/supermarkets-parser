import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseLidlWorkbook } from '../lidl'

const fixtureUrl = new URL('../../../../test/fixtures/lidl-export-second-list.xlsx', import.meta.url)
const fixtureBuffer = readFileSync(fileURLToPath(fixtureUrl))

describe('parseLidlWorkbook', () => {
  const offers = parseLidlWorkbook(fixtureBuffer)

  it('excludes rows without an active discount', () => {
    expect(offers.some((o) => o.name.startsWith('Vereya'))).toBe(false)
  })

  it('parses a normal discounted row using the file columns directly, not recomputed', () => {
    const kashkavcal = offers.find((o) => o.name.includes('Кашкавал'))
    expect(kashkavcal).toBeDefined()
    expect(kashkavcal!.priceEurCents).toBe(775)
    expect(kashkavcal!.originalPriceEurCents).toBe(971)
    expect(kashkavcal!.discountPercentage).toBeCloseTo(20.19)
    expect(kashkavcal!.validFrom).toBe('2026-07-06')
    expect(kashkavcal!.validUntil).toBe('2026-08-02')
  })

  it('deduplicates store rows into a single national offer per product/period', () => {
    const bananas = offers.filter((o) => o.name === 'Банани на кг')
    expect(bananas).toHaveLength(1)
    expect(bananas[0]!.scope).toBe('national')
  })

  it('flags a warning when store rows for the same product/period diverge on price', () => {
    const kashkavcal = offers.find((o) => o.name.includes('Кашкавал'))
    expect(kashkavcal!.warnings.length).toBeGreaterThan(0)
  })

  it('populates provenance metadata on every offer', () => {
    for (const offer of offers) {
      expect(offer.sourceUrl).toBe('https://www.lidl.bg/explore/assets/webPriceData/bg/ExportSecondList.xlsx')
      expect(offer.scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('never populates ean or loyalty pricing, which Lidl does not expose', () => {
    for (const offer of offers) {
      expect(offer.ean).toBeNull()
      expect(offer.loyaltyTier).toBe('none')
    }
  })
})
