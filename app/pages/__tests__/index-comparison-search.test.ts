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

describe('comparison landing page: search', () => {
  it('filters groups by the search box', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl'), makeOffer(2, 'kaufland'), makeOffer(3, 'lidl')]
    const chicken = makeComparisonGroup({
      groupKey: 'chicken-breast',
      labelBg: 'Пилешко филе',
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      ],
    })
    const yogurt = makeComparisonGroup({
      groupKey: 'yogurt',
      labelBg: 'Кисело мляко',
      entries: [
        { offerKey: offers[2]!.offerKey, retailer: 'kaufland', priceEurCents: 200, unitPriceEurCents: 400, isCheapest: false },
        { offerKey: offers[3]!.offerKey, retailer: 'lidl', priceEurCents: 150, unitPriceEurCents: 300, isCheapest: true },
      ],
    })
    registerEndpoint('/api/deals', () => makeSnapshot(offers, [chicken, yogurt]))

    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.findAll('article')).toHaveLength(2)

    await wrapper.find('input[type="search"]').setValue('мляко')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('article')).toHaveLength(1)
    expect(wrapper.text()).toContain('Кисело мляко')
  })
})
