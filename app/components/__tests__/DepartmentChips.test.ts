import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import DepartmentChips from '../comparison/DepartmentChips.vue'

describe('DepartmentChips', () => {
  it('renders represented departments in display order with their counts', async () => {
    const wrapper = await mountSuspended(DepartmentChips, {
      props: { counts: { 'dairy-eggs': 3, 'fruit-veg': 1 }, total: 4, selected: null },
    })

    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels[0]).toContain('Всички (4)')
    // `fruit-veg` precedes `dairy-eggs` in DEPARTMENT_ORDER, not in the props.
    expect(labels[1]).toContain('Плодове и зеленчуци (1)')
    expect(labels[2]).toContain('Мляко, млечни и яйца (3)')
  })

  it('omits a department with no matching groups rather than offering a dead end', async () => {
    const wrapper = await mountSuspended(DepartmentChips, {
      props: { counts: { 'dairy-eggs': 3, frozen: 0 }, total: 3, selected: null },
    })

    expect(wrapper.text()).not.toContain('Замразени')
  })

  it('marks the selected chip as pressed', async () => {
    const wrapper = await mountSuspended(DepartmentChips, {
      props: { counts: { 'dairy-eggs': 3, meat: 2 }, total: 5, selected: 'meat' },
    })

    const meat = wrapper.findAll('button').find((button) => button.text().includes('Месо'))!
    expect(meat.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('button')[0]!.attributes('aria-pressed')).toBe('false')
  })

  it('emits the department it was asked to select, and null for the leading chip', async () => {
    const wrapper = await mountSuspended(DepartmentChips, {
      props: { counts: { meat: 2 }, total: 2, selected: null },
    })

    await wrapper.findAll('button')[1]!.trigger('click')
    await wrapper.findAll('button')[0]!.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['meat'], [null]])
  })

  it('renders nothing when only the catch-all is represented', async () => {
    const wrapper = await mountSuspended(DepartmentChips, {
      props: { counts: { other: 7 }, total: 7, selected: null },
    })

    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
