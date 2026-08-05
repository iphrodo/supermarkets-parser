import type { Meta, StoryObj } from '@storybook/vue3-vite'
import PriceComparisonCard from '../app/components/PriceComparisonCard.vue'
import type { ComparisonGroup } from '../shared/types/comparison'
import type { Offer } from '../shared/types/offer'

const baseOffer: Offer = {
  offerKey: 'ean:8606018614950:2026-07-27',
  productKey: 'ean:8606018614950',
  retailer: 'kaufland',
  brand: 'BULMEAT',
  name: 'Пилешко филе, охладено',
  unitText: '500 г',
  category: 'Месо',
  campaign: null,
  discountPercentage: 20,
  priceEurCents: 500,
  priceBgnCents: 978,
  originalPriceEurCents: 625,
  loyaltyTier: 'none',
  mechanic: 'standard',
  purchaseLimit: null,
  ean: '8606018614950',
  scope: 'national',
  store: null,
  validFrom: '2026-07-27',
  validUntil: '2026-08-02',
  sourceUrl: 'https://www.kaufland.bg/aktualni-predlozheniya/oferti.html',
  scrapedAt: '2026-08-01T06:00:00.000Z',
  warnings: [],
  imageUrl: null,
}

const lidlOffer: Offer = {
  ...baseOffer,
  offerKey: 'lidl-1',
  productKey: 'lidl-1',
  retailer: 'lidl',
  brand: null,
  name: 'Пилешки гърди',
  unitText: '450 г',
  priceEurCents: 360,
  ean: null,
  sourceUrl: 'https://www.lidl.bg/explore/assets/webPriceData/bg/ExportSecondList.xlsx',
}

const billaOffer: Offer = {
  ...baseOffer,
  offerKey: 'billa-1',
  productKey: 'billa-1',
  retailer: 'billa',
  brand: null,
  name: 'Пилешко филе',
  unitText: '600 г',
  priceEurCents: 720,
  ean: null,
  sourceUrl: 'https://www.billa.bg',
}

const group: ComparisonGroup = {
  groupKey: 'chicken-breast',
  labelBg: 'Пилешко филе',
  unitBase: 'kg',
  savingsPercentage: 0.2,
  warnings: [],
  entries: [
    { offerKey: baseOffer.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
    { offerKey: lidlOffer.offerKey, retailer: 'lidl', priceEurCents: 360, unitPriceEurCents: 800, isCheapest: true },
    { offerKey: billaOffer.offerKey, retailer: 'billa', priceEurCents: 720, unitPriceEurCents: 1200, isCheapest: false },
  ],
}

const meta: Meta<typeof PriceComparisonCard> = {
  title: 'Deals/PriceComparisonCard',
  component: PriceComparisonCard,
}

export default meta
type Story = StoryObj<typeof PriceComparisonCard>

export const Default: Story = {
  args: { group, offers: [baseOffer, lidlOffer, billaOffer] },
}

export const TwoRetailers: Story = {
  args: {
    group: { ...group, entries: group.entries.filter((entry) => entry.retailer !== 'billa') },
    offers: [baseOffer, lidlOffer],
  },
}

export const NoSavings: Story = {
  args: {
    group: { ...group, savingsPercentage: 0 },
    offers: [baseOffer, lidlOffer, billaOffer],
  },
}
