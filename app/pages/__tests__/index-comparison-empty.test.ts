import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import IndexPage from '../index.vue'
import { MockIntersectionObserver, makeSnapshot } from './fixtures'

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('comparison landing page: empty state', () => {
  it('shows an explicit empty state when no comparison groups are available', async () => {
    registerEndpoint('/api/deals', () => makeSnapshot([], []))

    const wrapper = await mountSuspended(IndexPage)

    expect(wrapper.text()).toContain('В момента няма продукт с оферта в два или повече магазина.')
    expect(wrapper.findAll('article')).toHaveLength(0)
  })
})
