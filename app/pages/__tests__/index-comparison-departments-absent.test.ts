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

describe('comparison landing page: departments absent from the data', () => {
  /**
   * Before `add-product-departments` is deployed every group is coerced to the
   * catch-all, and a bar holding one "Други" chip is not navigation. The bar has
   * to disappear rather than degrade into a single degenerate choice.
   */
  it('omits the chip bar entirely when only the catch-all is represented', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
    const group = makeComparisonGroup({
      groupKey: 'chicken-breast',
      labelBg: 'Пилешко филе',
      department: 'other',
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      ],
    })
    registerEndpoint('/api/deals', () => makeSnapshot(offers, [group]))

    const wrapper = await mountSuspended(IndexPage)

    expect(wrapper.text()).not.toContain('Всички (')
    expect(wrapper.text()).not.toContain('Други')
    // The list itself is untouched.
    expect(wrapper.findAll('article')).toHaveLength(1)
  })
})
