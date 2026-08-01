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

describe('deals page infinite scroll: empty results', () => {
  it('shows the empty-results state with no batch or scroll indicators', async () => {
    registerEndpoint('/api/deals', () => makeSnapshot([]))

    const wrapper = await mountSuspended(IndexPage)

    expect(wrapper.text()).toContain('No offers match these filters yet.')
    expect(wrapper.findAll('article')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Loading more offers')
    expect(wrapper.text()).not.toContain("You've reached the end of the list.")
  })
})
