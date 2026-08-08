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
})

describe('comparison landing page: ordering', () => {
  it('orders groups by saving, largest first', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl'), makeOffer(2, 'kaufland'), makeOffer(3, 'lidl')]
    const small = makeComparisonGroup({
      groupKey: 'chicken-breast',
      labelBg: 'Пилешко филе',
      savingsPercentage: 0.1,
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 450, unitPriceEurCents: 900, isCheapest: true },
      ],
    })
    const large = makeComparisonGroup({
      groupKey: 'yogurt',
      labelBg: 'Кисело мляко',
      savingsPercentage: 0.5,
      entries: [
        { offerKey: offers[2]!.offerKey, retailer: 'kaufland', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: false },
        { offerKey: offers[3]!.offerKey, retailer: 'lidl', priceEurCents: 200, unitPriceEurCents: 400, isCheapest: true },
      ],
    })
    registerEndpoint('/api/deals', () => makeSnapshot(offers, [small, large]))

    const wrapper = await mountSuspended(IndexPage)

    expect(wrapper.findAll('article h3').map((heading) => heading.text())).toEqual([
      'Кисело мляко',
      'Пилешко филе',
    ])
  })
})
