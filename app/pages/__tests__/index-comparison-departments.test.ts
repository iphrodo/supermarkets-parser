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

describe('comparison landing page: department chips', () => {
  it('renders a chip per represented department, hides the rest, and narrows the grid on selection', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl'), makeOffer(2, 'kaufland'), makeOffer(3, 'lidl')]
    const chicken = makeComparisonGroup({
      groupKey: 'chicken-breast',
      labelBg: 'Пилешко филе',
      department: 'meat',
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      ],
    })
    const yogurt = makeComparisonGroup({
      groupKey: 'yogurt',
      labelBg: 'Кисело мляко',
      department: 'dairy-eggs',
      entries: [
        { offerKey: offers[2]!.offerKey, retailer: 'kaufland', priceEurCents: 200, unitPriceEurCents: 400, isCheapest: false },
        { offerKey: offers[3]!.offerKey, retailer: 'lidl', priceEurCents: 150, unitPriceEurCents: 300, isCheapest: true },
      ],
    })
    registerEndpoint('/api/deals', () => makeSnapshot(offers, [chicken, yogurt]))

    const wrapper = await mountSuspended(IndexPage)

    const chipText = wrapper.text()
    expect(chipText).toContain('Всички (2)')
    expect(chipText).toContain('Месо (1)')
    expect(chipText).toContain('Мляко, млечни и яйца (1)')
    // A department no group belongs to is not offered as a dead end.
    expect(chipText).not.toContain('Замразени')
    expect(chipText).not.toContain('Други')

    const dairyChip = wrapper.findAll('button').find((button) => button.text().includes('Мляко, млечни и яйца'))!
    await dairyChip.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('article')).toHaveLength(1)
    expect(wrapper.text()).toContain('Кисело мляко')
    expect(wrapper.text()).not.toContain('Пилешко филе')

    // Selecting the active department clears the filter.
    await dairyChip.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('article')).toHaveLength(2)
  })
})
