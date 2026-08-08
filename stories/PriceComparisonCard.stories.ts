import type { Meta, StoryObj } from '@storybook/vue3-vite'
import PriceComparisonCard from '../app/components/PriceComparisonCard.vue'
import { billaOffer, chickenGroup, kauflandOffer, lidlOffer, withOffers } from './fixtures'

const allOffers = [kauflandOffer, lidlOffer, billaOffer]

const meta: Meta<typeof PriceComparisonCard> = {
  title: 'Deals/PriceComparisonCard',
  component: PriceComparisonCard,
  decorators: [withOffers(allOffers)],
}

export default meta
type Story = StoryObj<typeof PriceComparisonCard>

export const Default: Story = {
  args: { group: chickenGroup, leafletPages: {} },
}

export const TwoRetailers: Story = {
  args: {
    group: { ...chickenGroup, entries: chickenGroup.entries.filter((entry) => entry.retailer !== 'billa') },
    leafletPages: {},
  },
}

export const NoSavings: Story = {
  args: {
    group: { ...chickenGroup, savingsPercentage: 0 },
    leafletPages: {},
  },
}

/**
 * Every entry from the Lidl price list — the one source publishing no imagery
 * at all now that Kaufland and the Lidl listing carry `imageUrl` and Billa
 * carries crops. This is the only route to the placeholder tile.
 */
export const NoImage: Story = {
  decorators: [withOffers(allOffers.map((offer) => ({ ...offer, imageUrl: null, imageCrop: null })))],
  args: { group: chickenGroup, leafletPages: {} },
}

/** A long type label has to clamp rather than push the price out of the card. */
export const LongLabel: Story = {
  args: {
    group: { ...chickenGroup, labelBg: 'Пилешко филе, охладено, без кост и без кожа, от свободно отглеждани птици' },
    leafletPages: {},
  },
}
