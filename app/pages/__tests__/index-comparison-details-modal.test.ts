import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import IndexPage from '../index.vue'
import { MockIntersectionObserver, makeComparisonGroup, makeOffer, makeSnapshot } from './fixtures'

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('comparison landing page: details view', () => {
  it('opens from a details URL and carries the per-entry detail the card sheds', async () => {
    const kaufland = makeOffer(0, 'kaufland')
    kaufland.name = 'Пилешко филе охладено'
    kaufland.ean = '1234567890123'
    kaufland.sourceUrl = 'https://kaufland.example/offer'
    kaufland.originalPriceEurCents = 700

    const lidl = makeOffer(1, 'lidl')
    lidl.name = 'Пилешко филе'
    lidl.ean = null
    lidl.sourceUrl = 'https://lidl.example/offer'
    lidl.originalPriceEurCents = null
    // The Lidl listing writes these for a discount label it could not quantify.
    lidl.warnings = ['Discount label "Акция" states no percentage']

    const group = makeComparisonGroup({
      groupKey: 'chicken-breast',
      labelBg: 'Пилешко филе',
      warnings: ['Excluded billa-1 (billa): unit price is more than 10x the group median'],
      entries: [
        { offerKey: lidl.offerKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
        { offerKey: kaufland.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
      ],
    })
    registerEndpoint('/api/deals', () => makeSnapshot([kaufland, lidl], [group]))

    // Opened directly, not by clicking a card: the modal must render once the
    // snapshot resolves rather than erroring on an unpopulated lookup.
    const wrapper = await mountSuspended(IndexPage, { route: '/?g=chicken-breast' })
    await wrapper.vm.$nextTick()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()

    const text = dialog!.textContent ?? ''
    expect(text).toContain('Пилешко филе охладено')
    expect(text).toContain('EAN 1234567890123')
    expect(text).toContain('Валидна')
    expect(text).toContain('Най-евтино')
    // The group's warnings, produced by the pipeline and shown nowhere before.
    expect(text).toContain('more than 10x the group median')
    // And the offer's own.
    expect(text).toContain('Discount label "Акция" states no percentage')

    const links = Array.from(dialog!.querySelectorAll('a'))
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://lidl.example/offer',
      'https://kaufland.example/offer',
    ])
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener')
    }

    // Exactly one struck-through price: Kaufland has an original price, Lidl does not.
    expect(dialog!.querySelectorAll('.line-through')).toHaveLength(1)
  })
})
