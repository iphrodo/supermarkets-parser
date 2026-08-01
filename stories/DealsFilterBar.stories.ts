import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DealsFilterBar, { type DealsFilterValue } from '../app/components/DealsFilterBar.vue'

const meta: Meta<typeof DealsFilterBar> = {
  title: 'Deals/DealsFilterBar',
  component: DealsFilterBar,
}

export default meta
type Story = StoryObj<typeof DealsFilterBar>

const categories = ['Плодове и зеленчуци', 'Млечни продукти', 'Замразени продукти']

export const Default: Story = {
  args: {
    modelValue: { retailer: 'all', category: 'all', maxPriceEurCents: null } satisfies DealsFilterValue,
    categories,
  },
}

export const RetailerSelected: Story = {
  args: {
    modelValue: { retailer: 'lidl', category: 'all', maxPriceEurCents: null } satisfies DealsFilterValue,
    categories,
  },
}

export const AllFiltersApplied: Story = {
  args: {
    modelValue: { retailer: 'kaufland', category: categories[0]!, maxPriceEurCents: 500 } satisfies DealsFilterValue,
    categories,
  },
}

export const NoCategoriesAvailable: Story = {
  args: {
    modelValue: { retailer: 'all', category: 'all', maxPriceEurCents: null } satisfies DealsFilterValue,
    categories: [],
  },
}
