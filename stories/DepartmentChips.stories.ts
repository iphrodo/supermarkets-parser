import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DepartmentChips from '../app/components/comparison/DepartmentChips.vue'

const meta: Meta<typeof DepartmentChips> = {
  title: 'Deals/DepartmentChips',
  component: DepartmentChips,
}

export default meta
type Story = StoryObj<typeof DepartmentChips>

export const Default: Story = {
  args: {
    counts: { 'fruit-veg': 12, meat: 8, 'dairy-eggs': 21, bakery: 4, drinks: 9, other: 3 },
    total: 57,
    selected: null,
  },
}

export const Selected: Story = {
  args: {
    counts: { 'fruit-veg': 12, meat: 8, 'dairy-eggs': 21, bakery: 4, drinks: 9, other: 3 },
    total: 57,
    selected: 'dairy-eggs',
  },
}

/** Many departments at a narrow viewport: the row scrolls horizontally rather than wrapping. */
export const Scrolling: Story = {
  args: {
    counts: {
      'fruit-veg': 12,
      meat: 8,
      fish: 3,
      deli: 6,
      'dairy-eggs': 21,
      bakery: 4,
      pantry: 30,
      'sweets-snacks': 17,
      frozen: 5,
      drinks: 9,
      alcohol: 7,
      household: 11,
      other: 3,
    },
    total: 136,
    selected: null,
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/** Only the catch-all is represented, so the bar renders nothing at all. */
export const CatchAllOnly: Story = {
  args: { counts: { other: 42 }, total: 42, selected: null },
}
