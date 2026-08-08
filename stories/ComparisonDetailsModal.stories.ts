import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ComparisonDetailsModal from '../app/components/comparison/ComparisonDetailsModal.vue'
import { billaOffer, chickenGroup, kauflandOffer, lidlOffer, withOffers } from './fixtures'

const meta: Meta<typeof ComparisonDetailsModal> = {
  title: 'Deals/ComparisonDetailsModal',
  component: ComparisonDetailsModal,
  decorators: [withOffers([kauflandOffer, lidlOffer, billaOffer])],
  parameters: { a11y: { test: 'error' } },
}

export default meta
type Story = StoryObj<typeof ComparisonDetailsModal>

export const Default: Story = {
  args: { group: chickenGroup, leafletPages: {} },
}

/**
 * Warnings at both levels: the comparison builder's, and the Lidl listing's own
 * on an offer whose discount label it could not quantify.
 */
export const WithGroupWarnings: Story = {
  args: {
    group: {
      ...chickenGroup,
      warnings: [
        'Excluded billa-1 (billa): unit price 12000.00 is more than 10x the group median 900.00',
      ],
    },
    leafletPages: {},
  },
}

/** Closed: the modal must render nothing rather than an empty overlay. */
export const Closed: Story = {
  args: { group: null, leafletPages: {} },
}
