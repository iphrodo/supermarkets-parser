import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProductThumb from '../app/components/ProductThumb.vue'
import type { LeafletPage, Offer } from '../shared/types/offer'

const baseOffer: Offer = {
  offerKey: 'ean:8606018614950:2026-07-27',
  productKey: 'ean:8606018614950',
  retailer: 'billa',
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
  sourceUrl: 'https://view.publitas.com/billa-bulgaria/bg_weekly_digital_leaflet_cw31/',
  scrapedAt: '2026-08-01T06:00:00.000Z',
  warnings: [],
}

/** A stand-in leaflet page: a 4x4 grid, so a crop's geometry is obvious at a glance. */
const GRID_PAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560">
  <rect width="400" height="560" fill="#fdf4e3"/>
  ${[0, 1, 2, 3]
    .flatMap((row) =>
      [0, 1, 2, 3].map(
        (col) =>
          `<rect x="${col * 100 + 6}" y="${row * 140 + 6}" width="88" height="128" fill="${
            (row + col) % 2 === 0 ? '#e4572e' : '#2e8b57'
          }"/><text x="${col * 100 + 50}" y="${row * 140 + 78}" font-size="28" fill="#fff" text-anchor="middle">${
            row * 4 + col + 1
          }</text>`,
      ),
    )
    .join('')}
</svg>`

const page: LeafletPage = {
  imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(GRID_PAGE_SVG)}`,
  width: 400,
  height: 560,
  pageNumber: 3,
  sourceUrl: baseOffer.sourceUrl,
}

const meta: Meta<typeof ProductThumb> = {
  title: 'Deals/ProductThumb',
  component: ProductThumb,
  decorators: [() => ({ template: '<div style="width: 220px"><story /></div>' })],
}

export default meta
type Story = StoryObj<typeof ProductThumb>

/** Crops tile 6 (second row, second column) out of the page. */
export const LeafletCrop: Story = {
  args: {
    offer: { ...baseOffer, imageCrop: { pageId: 'billa:cw31:3', box: [250, 250, 480, 500] } },
    page,
  },
}

export const DirectImageUrl: Story = {
  args: {
    offer: {
      ...baseOffer,
      retailer: 'kaufland',
      imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#2e8b57"/></svg>',
      )}`,
    },
  },
}

/** A Lidl price-list offer: no image of either kind exists for it. */
export const NoImage: Story = {
  args: { offer: { ...baseOffer, retailer: 'lidl', sourceUrl: 'https://www.lidl.bg/…/ExportSecondList.xlsx' } },
}

/** A crop whose page is missing from the snapshot falls back the same way. */
export const UnresolvedCropPage: Story = {
  args: { offer: { ...baseOffer, imageCrop: { pageId: 'billa:cw31:99', box: [250, 250, 480, 500] } }, page: null },
}

export const BrokenImageUrl: Story = {
  args: { offer: { ...baseOffer, retailer: 'kaufland', imageUrl: 'https://example.invalid/broken.jpg' } },
}

export const SmallSize: Story = {
  args: {
    offer: { ...baseOffer, imageCrop: { pageId: 'billa:cw31:3', box: [250, 250, 480, 500] } },
    page,
    size: 'sm',
  },
}
