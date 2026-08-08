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

describe('comparison landing page: minimum saving', () => {
  it('keeps only groups whose saving meets the threshold, and shows why the list is short', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl'), makeOffer(2, 'kaufland'), makeOffer(3, 'lidl')]
    const marginal = makeComparisonGroup({
      groupKey: 'chicken-breast',
      labelBg: 'Пилешко филе',
      savingsPercentage: 0.05,
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 480, unitPriceEurCents: 950, isCheapest: true },
      ],
    })
    const worthwhile = makeComparisonGroup({
      groupKey: 'yogurt',
      labelBg: 'Кисело мляко',
      savingsPercentage: 0.4,
      entries: [
        { offerKey: offers[2]!.offerKey, retailer: 'kaufland', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: false },
        { offerKey: offers[3]!.offerKey, retailer: 'lidl', priceEurCents: 240, unitPriceEurCents: 480, isCheapest: true },
      ],
    })
    registerEndpoint('/api/deals', () => makeSnapshot(offers, [marginal, worthwhile]))

    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.findAll('article')).toHaveLength(2)

    const twentyChip = wrapper.findAll('button').find((button) => button.text() === '20% +')!
    await twentyChip.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('article')).toHaveLength(1)
    expect(wrapper.text()).toContain('Кисело мляко')
    // The applied-filters overview is what stops a short list from looking broken.
    expect(wrapper.text()).toContain('Отстъпка 20% +')
    // The count is matching-out-of-published, not batch-out-of-matching: it is
    // there to explain the narrowing, not the incremental rendering.
    expect(wrapper.text()).toContain('Показани 1 от 2 продукта')
  })
})
