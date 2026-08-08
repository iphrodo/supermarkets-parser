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

describe('comparison landing page: rendering', () => {
  it('renders comparison groups, leading each with its cheapest per-unit price and both savings figures', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
    const group = makeComparisonGroup({
      groupKey: 'chicken-breast',
      labelBg: 'Пилешко филе',
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      ],
      savingsPercentage: 0.2,
    })
    registerEndpoint('/api/deals', () => makeSnapshot(offers, [group]))

    const wrapper = await mountSuspended(IndexPage)

    expect(wrapper.findAll('article')).toHaveLength(1)
    expect(wrapper.text()).toContain('Пилешко филе')
    expect(wrapper.text()).toContain('8.00 €/кг')
    expect(wrapper.text()).toContain('Спести 20% · 2.00 €/кг')
  })
})
