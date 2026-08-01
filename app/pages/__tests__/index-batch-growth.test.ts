import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import IndexPage from '../index.vue'
import { BATCH_SIZE, MockIntersectionObserver, makeOffer, makeSnapshot } from './fixtures'

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deals page infinite scroll: batch growth', () => {
  it('appends the next batch when the sentinel intersects', async () => {
    registerEndpoint('/api/deals', () => makeSnapshot(Array.from({ length: 60 }, (_, i) => makeOffer(i))))

    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.findAll('article')).toHaveLength(BATCH_SIZE)

    MockIntersectionObserver.instances[0]!.trigger(true)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('article')).toHaveLength(BATCH_SIZE * 2)
  })
})
