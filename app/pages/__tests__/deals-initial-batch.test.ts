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

describe('deals page infinite scroll: initial load', () => {
  it('renders only the first batch on load', async () => {
    registerEndpoint('/api/deals', () => makeSnapshot(Array.from({ length: 60 }, (_, i) => makeOffer(i))))

    const wrapper = await mountSuspended(DealsPage)

    expect(wrapper.findAll('article')).toHaveLength(BATCH_SIZE)
    expect(wrapper.text()).toContain('Зареждане')
  })
})
