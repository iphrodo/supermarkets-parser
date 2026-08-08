import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DealsPage from '../deals.vue'
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

    const wrapper = await mountSuspended(DealsPage)

    expect(wrapper.text()).toContain('Няма оферти по тези филтри.')
    expect(wrapper.findAll('article')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Зареждане')
    expect(wrapper.text()).not.toContain("Това е краят на списъка.")
  })
})
