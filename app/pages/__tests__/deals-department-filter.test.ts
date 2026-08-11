import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DealsPage from '../deals.vue'
import { MockIntersectionObserver, makeOffer, makeSnapshot } from './fixtures'

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deals page department filter', () => {
  it('lists only present departments in canonical order, filters by department, and treats a missing department as the catch-all', async () => {
    const offers = [
      makeOffer(0, 'kaufland', { department: 'meat' }),
      makeOffer(1, 'lidl', { department: 'fruit-veg' }),
      makeOffer(2, 'billa', { department: 'meat' }),
      makeOffer(3, 'bulmag', { department: undefined }),
    ]
    registerEndpoint('/api/deals', () => makeSnapshot(offers))

    const wrapper = await mountSuspended(DealsPage)
    expect(wrapper.findAll('article')).toHaveLength(4)

    const categorySelect = wrapper.findAll('select')[1]!
    const optionValues = categorySelect.findAll('option').map((option) => option.attributes('value'))
    // Canonical order is fruit-veg, ..., meat, ..., other — 'all' is first, the
    // undeclared-department offer surfaces under the catch-all rather than
    // being omitted.
    expect(optionValues).toEqual(['all', 'fruit-veg', 'meat', 'other'])

    await categorySelect.setValue('meat')
    expect(wrapper.findAll('article')).toHaveLength(2)

    await categorySelect.setValue('other')
    expect(wrapper.findAll('article')).toHaveLength(1)
  })
})
