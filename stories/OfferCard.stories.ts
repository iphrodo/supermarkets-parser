import type { Meta, StoryObj } from '@storybook/vue3-vite'
import OfferCard from '../app/components/OfferCard.vue'
import type { Offer } from '../shared/types/offer'

const baseOffer: Offer = {
  offerKey: 'ean:8606018614950:2026-07-27',
  productKey: 'ean:8606018614950',
  retailer: 'kaufland',
  brand: 'ALOMA',
  name: 'Сладолед XXL различни вкусове',
  unitText: '3 л/ 1455 г',
  category: 'Замразени продукти',
  campaign: null,
  discountPercentage: 66,
  priceEurCents: 510,
  priceBgnCents: 997,
  originalPriceEurCents: 1533,
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
}

const meta: Meta<typeof OfferCard> = {
  title: 'Deals/OfferCard',
  component: OfferCard,
}

export default meta
type Story = StoryObj<typeof OfferCard>

export const Default: Story = {
  args: { offer: baseOffer },
}

export const NoOldPrice: Story = {
  args: { offer: { ...baseOffer, originalPriceEurCents: null, discountPercentage: 0 } },
}

export const NoLoyaltyTier: Story = {
  args: { offer: { ...baseOffer, loyaltyTier: 'none' } },
}

export const KauflandCardXtra: Story = {
  args: {
    offer: {
      ...baseOffer,
      brand: 'SUHINDOL',
      name: 'Червено, Бяло вино или Розе',
      unitText: '3 л BIB',
      loyaltyTier: 'kaufland_card_xtra',
      priceEurCents: 429,
      originalPriceEurCents: 892,
      priceBgnCents: 839,
      ean: null,
    },
  },
}

export const NoEan: Story = {
  args: { offer: { ...baseOffer, ean: null, brand: null, name: 'Картофи, Клас: I', unitText: 'кг' } },
}

export const NoBgnPrice: Story = {
  args: { offer: { ...baseOffer, priceBgnCents: null } },
}

export const BuyOneGetOneFree: Story = {
  args: { offer: { ...baseOffer, mechanic: 'buy_1_get_1_free', purchaseLimit: 'до 5 кг на покупка' } },
}

export const LidlOffer: Story = {
  args: {
    offer: {
      ...baseOffer,
      retailer: 'lidl',
      brand: null,
      name: 'Железница Кашкавал от краве мляко',
      unitText: '1.00000',
      category: '11',
      priceEurCents: 775,
      originalPriceEurCents: 971,
      priceBgnCents: null,
      discountPercentage: 20.19,
      ean: null,
      sourceUrl: 'https://www.lidl.bg/explore/assets/webPriceData/bg/ExportSecondList.xlsx',
    },
  },
}
