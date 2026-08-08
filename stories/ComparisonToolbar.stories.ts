import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ComparisonToolbar from '../app/components/comparison/ComparisonToolbar.vue'

const meta: Meta<typeof ComparisonToolbar> = {
  title: 'Deals/ComparisonToolbar',
  component: ComparisonToolbar,
}

export default meta
type Story = StoryObj<typeof ComparisonToolbar>

export const Unfiltered: Story = {
  args: {
    search: '',
    sortKey: 'savings',
    retailers: [],
    minSavings: 0,
    department: null,
    shown: 24,
    total: 137,
  },
}

/** The applied-filters overview is what stops a short list from reading as broken. */
export const Narrowed: Story = {
  args: {
    search: 'кашкавал',
    sortKey: 'unit-price',
    retailers: ['lidl', 'billa'],
    minSavings: 0.2,
    department: 'dairy-eggs',
    shown: 3,
    total: 3,
  },
}

export const SingleResult: Story = {
  args: {
    search: 'айран',
    sortKey: 'savings',
    retailers: [],
    minSavings: 0,
    department: null,
    shown: 1,
    total: 1,
  },
}
