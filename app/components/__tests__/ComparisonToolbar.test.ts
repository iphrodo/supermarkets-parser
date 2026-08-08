import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import ComparisonToolbar from '../comparison/ComparisonToolbar.vue'

const base = {
  search: '',
  sortKey: 'savings' as const,
  retailers: [],
  minSavings: 0,
  department: null,
  shown: 24,
  total: 120,
}

describe('ComparisonToolbar', () => {
  it('reports how many groups are shown out of how many exist', async () => {
    const wrapper = await mountSuspended(ComparisonToolbar, { props: base })

    expect(wrapper.text()).toContain('Показани 24 от 120 продукта')
  })

  it('uses the Bulgarian singular for a single product', async () => {
    const wrapper = await mountSuspended(ComparisonToolbar, { props: { ...base, shown: 1, total: 1 } })

    expect(wrapper.text()).toContain('Показани 1 от 1 продукт')
    expect(wrapper.text()).not.toContain('продукта')
  })

  it('shows no applied-filters overview while nothing is narrowed', async () => {
    const wrapper = await mountSuspended(ComparisonToolbar, { props: base })

    expect(wrapper.text()).not.toContain('Изчисти всички')
  })

  it('shows one removable chip per active narrowing, plus a clear-all', async () => {
    const wrapper = await mountSuspended(ComparisonToolbar, {
      props: { ...base, search: 'мляко', department: 'dairy-eggs' as const, retailers: ['lidl' as const], minSavings: 0.2 },
    })

    const text = wrapper.text()
    expect(text).toContain('„мляко“')
    expect(text).toContain('Мляко, млечни и яйца')
    expect(text).toContain('Lidl')
    expect(text).toContain('Отстъпка 20% +')
    expect(text).toContain('Изчисти всички')
  })

  it('clears an individual filter from its chip', async () => {
    const wrapper = await mountSuspended(ComparisonToolbar, {
      props: { ...base, department: 'dairy-eggs' as const },
    })

    const chip = wrapper.findAll('button').find((button) => button.text().includes('Мляко, млечни и яйца'))!
    await chip.trigger('click')

    expect(wrapper.emitted('selectDepartment')).toEqual([[null]])
  })

  it('emits the search text as it is typed, without waiting', async () => {
    const wrapper = await mountSuspended(ComparisonToolbar, { props: base })

    await wrapper.find('input[type="search"]').setValue('кашкавал')

    expect(wrapper.emitted('update:search')?.[0]).toEqual(['кашкавал'])
  })

  it('offers the three sort orders', async () => {
    const wrapper = await mountSuspended(ComparisonToolbar, { props: base })

    const options = wrapper.findAll('option').map((option) => option.text())
    expect(options).toContain('Най-голяма отстъпка')
    expect(options).toContain('Най-ниска цена за единица')
    expect(options).toContain('По име')
  })

  it('emits a retailer toggle and a savings threshold', async () => {
    const wrapper = await mountSuspended(ComparisonToolbar, { props: base })

    await wrapper.findAll('button').find((button) => button.text() === 'Kaufland')!.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === '30% +')!.trigger('click')

    expect(wrapper.emitted('toggleRetailer')).toEqual([['kaufland']])
    expect(wrapper.emitted('setMinSavings')).toEqual([[0.3]])
  })
})
