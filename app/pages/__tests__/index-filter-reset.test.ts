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

describe('deals page infinite scroll: filter reset', () => {
  it('resets the visible batch when a filter changes', async () => {
    const offers = [
      ...Array.from({ length: 40 }, (_, i) => makeOffer(i, 'kaufland')),
      ...Array.from({ length: 5 }, (_, i) => makeOffer(100 + i, 'lidl')),
    ]
    registerEndpoint('/api/deals', () => makeSnapshot(offers))

    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.findAll('article')).toHaveLength(BATCH_SIZE)

    MockIntersectionObserver.instances[0]!.trigger(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('article')).toHaveLength(45)

    await wrapper.find('select').setValue('lidl')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('article')).toHaveLength(5)
    expect(wrapper.text()).toContain("You've reached the end of the list.")
  })
})
