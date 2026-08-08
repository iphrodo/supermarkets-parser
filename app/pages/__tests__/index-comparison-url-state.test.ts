import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import IndexPage from '../index.vue'
import { MockIntersectionObserver, makeComparisonGroup, makeOffer, makeSnapshot } from './fixtures'

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('comparison landing page: URL state', () => {
  it('restores narrowing from the URL after hydration, reflects changes back, and keeps defaults out', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl'), makeOffer(2, 'kaufland'), makeOffer(3, 'billa')]
    const meat = makeComparisonGroup({
      groupKey: 'chicken-breast',
      labelBg: 'Пилешко филе',
      department: 'meat',
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      ],
    })
    const dairy = makeComparisonGroup({
      groupKey: 'yogurt',
      labelBg: 'Кисело мляко',
      department: 'dairy-eggs',
      entries: [
        { offerKey: offers[2]!.offerKey, retailer: 'kaufland', priceEurCents: 200, unitPriceEurCents: 400, isCheapest: false },
        { offerKey: offers[3]!.offerKey, retailer: 'billa', priceEurCents: 150, unitPriceEurCents: 300, isCheapest: true },
      ],
    })
    registerEndpoint('/api/deals', () => makeSnapshot(offers, [meat, dairy]))

    // A shared link: the state is applied on the client, after mount.
    const wrapper = await mountSuspended(IndexPage, { route: '/?d=dairy-eggs' })
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('article')).toHaveLength(1)
    expect(wrapper.text()).toContain('Кисело мляко')

    // The app's router instance, reachable through the mounted page.
    const router = wrapper.vm.$router

    const billaChip = wrapper.findAll('button').find((button) => button.text() === 'Billa')!
    await billaChip.trigger('click')
    await flushPromises()

    await vi.waitFor(() => expect(router.currentRoute.value.query.r).toBe('billa'))
    expect(router.currentRoute.value.query.d).toBe('dairy-eggs')
    // The default sort never reaches the address bar.
    expect(router.currentRoute.value.query.s).toBeUndefined()

    const clearAll = wrapper.findAll('button').find((button) => button.text() === 'Изчисти всички')!
    await clearAll.trigger('click')
    await flushPromises()

    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({}))
    expect(wrapper.findAll('article')).toHaveLength(2)
  })
})
