import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import DealsFilterBar from '../DealsFilterBar.vue'

describe('DealsFilterBar', () => {
  it('renders the Bulgarian label and icon for a department option, not a raw id', async () => {
    const wrapper = await mountSuspended(DealsFilterBar, {
      props: {
        modelValue: { retailer: 'all', category: 'all', maxPriceEurCents: null },
        categories: ['meat'],
      },
    })

    const categorySelect = wrapper.findAll('select')[1]!
    const option = categorySelect.findAll('option').find((o) => o.attributes('value') === 'meat')!

    expect(option.text()).toContain('Месо')
    expect(option.text()).toContain('🥩')
    expect(option.text()).not.toContain('meat')
  })
})
