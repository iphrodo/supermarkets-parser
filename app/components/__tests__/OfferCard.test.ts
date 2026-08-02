import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { makeOffer } from '../../pages/__tests__/fixtures'
import OfferCard from '../OfferCard.vue'

describe('OfferCard', () => {
  it('renders the formatted end date', async () => {
    const offer = makeOffer(1)
    offer.validUntil = '2026-08-31'

    const wrapper = await mountSuspended(OfferCard, { props: { offer } })

    expect(wrapper.text()).toContain('31.08.2026')
  })
})
