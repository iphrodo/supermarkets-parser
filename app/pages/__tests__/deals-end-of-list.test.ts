import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DealsPage from '../deals.vue'
import { BATCH_SIZE, MockIntersectionObserver, makeOffer, makeSnapshot } from './fixtures'

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deals page infinite scroll: end of list', () => {
  it('shows an end-of-list state once every matching offer is rendered', async () => {
    registerEndpoint('/api/deals', () => makeSnapshot(Array.from({ length: BATCH_SIZE - 1 }, (_, i) => makeOffer(i))))

    const wrapper = await mountSuspended(DealsPage)

    expect(wrapper.findAll('article')).toHaveLength(BATCH_SIZE - 1)
    expect(wrapper.text()).toContain("You've reached the end of the list.")
    expect(wrapper.text()).not.toContain('Loading more offers')
  })
})
