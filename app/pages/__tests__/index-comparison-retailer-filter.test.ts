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

describe('comparison landing page: retailer filter', () => {
  it('uses OR semantics across a group’s entries', async () => {
    const offers = [
      makeOffer(0, 'kaufland'),
      makeOffer(1, 'lidl'),
      makeOffer(2, 'kaufland'),
      makeOffer(3, 'billa'),
    ]
    const withLidl = makeComparisonGroup({
      groupKey: 'chicken-breast',
      labelBg: 'Пилешко филе',
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      ],
    })
    const withoutLidl = makeComparisonGroup({
      groupKey: 'yogurt',
      labelBg: 'Кисело мляко',
      entries: [
        { offerKey: offers[2]!.offerKey, retailer: 'kaufland', priceEurCents: 200, unitPriceEurCents: 400, isCheapest: false },
        { offerKey: offers[3]!.offerKey, retailer: 'billa', priceEurCents: 150, unitPriceEurCents: 300, isCheapest: true },
      ],
    })
    registerEndpoint('/api/deals', () => makeSnapshot(offers, [withLidl, withoutLidl]))

    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.findAll('article')).toHaveLength(2)

    const lidlChip = wrapper.findAll('button').find((button) => button.text() === 'Lidl')!
    await lidlChip.trigger('click')
    await wrapper.vm.$nextTick()

    // Only the group with a Lidl entry survives, even though both have Kaufland.
    expect(wrapper.findAll('article')).toHaveLength(1)
    expect(wrapper.text()).toContain('Пилешко филе')

    const billaChip = wrapper.findAll('button').find((button) => button.text() === 'Billa')!
    await billaChip.trigger('click')
    await wrapper.vm.$nextTick()

    // Lidl OR Billa now matches both.
    expect(wrapper.findAll('article')).toHaveLength(2)
  })
})
