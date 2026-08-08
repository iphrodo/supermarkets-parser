import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import type { LeafletPage } from '../../../shared/types/offer'
import { makeComparisonGroup, makeOffer, withOffers } from '../../pages/__tests__/fixtures'
import PriceComparisonCard from '../PriceComparisonCard.vue'

const PAGE_ID = 'billa:cw31:3'
const page: LeafletPage = {
  imageUrl: 'https://example.com/leaflet/page-3.jpg',
  width: 1000,
  height: 1400,
  pageNumber: 3,
  sourceUrl: 'https://example.com/leaflet/',
}

function twoEntryGroup(kauflandKey: string, lidlKey: string) {
  return makeComparisonGroup({
    labelBg: 'Пилешко филе',
    entries: [
      { offerKey: lidlKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      { offerKey: kauflandKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
    ],
    savingsPercentage: 0.2,
  })
}

describe('PriceComparisonCard', () => {
  it('renders the type label, every retailer, and the cheapest per-unit price as the dominant figure', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
    const group = twoEntryGroup(offers[0]!.offerKey, offers[1]!.offerKey)

    const wrapper = await mountSuspended(PriceComparisonCard, {
      props: { group, leafletPages: {} },
      global: withOffers(offers),
    })

    expect(wrapper.text()).toContain('Пилешко филе')
    expect(wrapper.text()).toContain('Kaufland')
    expect(wrapper.text()).toContain('Lidl')
    expect(wrapper.text()).toContain('8.00 €/кг')
  })

  it('states the saving as both a percentage and an absolute per-unit amount', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
    const group = twoEntryGroup(offers[0]!.offerKey, offers[1]!.offerKey)

    const wrapper = await mountSuspended(PriceComparisonCard, {
      props: { group, leafletPages: {} },
      global: withOffers(offers),
    })

    // 10.00 €/кг against 8.00 €/кг: 20% and 2.00 €/кг.
    expect(wrapper.text()).toContain('Спести 20%')
    expect(wrapper.text()).toContain('2.00 €/кг')
  })

  it('leads with the cheapest entry and lists the others after it', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
    const group = twoEntryGroup(offers[0]!.offerKey, offers[1]!.offerKey)

    const wrapper = await mountSuspended(PriceComparisonCard, {
      props: { group, leafletPages: {} },
      global: withOffers(offers),
    })

    const rows = wrapper.findAll('li')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Kaufland')
    expect(wrapper.text().indexOf('8.00 €/кг')).toBeLessThan(wrapper.text().indexOf('10.00 €/кг'))
  })

  it('shows the pack price and pack size beneath the per-unit price', async () => {
    const offer = makeOffer(0, 'kaufland')
    offer.unitText = '500 г'
    const group = makeComparisonGroup({
      entries: [
        { offerKey: offer.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: true },
      ],
    })

    const wrapper = await mountSuspended(PriceComparisonCard, {
      props: { group, leafletPages: {} },
      global: withOffers([offer]),
    })

    expect(wrapper.text()).toContain('5.00 €')
    expect(wrapper.text()).toContain('500 г')
  })

  it('carries no source link or EAN — both moved to the details view', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
    offers[0]!.ean = '1234567890123'
    const group = twoEntryGroup(offers[0]!.offerKey, offers[1]!.offerKey)

    const wrapper = await mountSuspended(PriceComparisonCard, {
      props: { group, leafletPages: {} },
      global: withOffers(offers),
    })

    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('1234567890123')
  })

  it('asks to open the details view when activated', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
    const group = twoEntryGroup(offers[0]!.offerKey, offers[1]!.offerKey)

    const wrapper = await mountSuspended(PriceComparisonCard, {
      props: { group, leafletPages: {} },
      global: withOffers(offers),
    })

    await wrapper.find('article').trigger('click')

    expect(wrapper.emitted('open')?.[0]).toEqual([group.groupKey])
  })

  it('skips an entry whose offer cannot be resolved from the snapshot', async () => {
    const group = makeComparisonGroup({
      entries: [
        { offerKey: 'missing-offer', retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: true },
      ],
    })

    const wrapper = await mountSuspended(PriceComparisonCard, {
      props: { group, leafletPages: {} },
      global: withOffers([]),
    })

    expect(wrapper.text()).not.toContain('Kaufland')
  })

  describe('hero image', () => {
    it('prefers the cheapest entry’s direct image URL', async () => {
      const kaufland = makeOffer(0, 'kaufland')
      kaufland.imageUrl = 'https://example.com/kaufland.jpg'
      const lidl = makeOffer(1, 'lidl')
      lidl.imageUrl = 'https://example.com/lidl.jpg'
      const group = twoEntryGroup(kaufland.offerKey, lidl.offerKey)

      const wrapper = await mountSuspended(PriceComparisonCard, {
        props: { group, leafletPages: {} },
        global: withOffers([kaufland, lidl]),
      })

      expect(wrapper.find('img').attributes('src')).toBe('https://example.com/lidl.jpg')
    })

    it('falls back to a crop when no entry has a direct image URL', async () => {
      const kaufland = makeOffer(0, 'kaufland')
      const lidl = makeOffer(1, 'lidl')
      lidl.imageCrop = { pageId: PAGE_ID, box: [100, 100, 300, 300] }
      const group = twoEntryGroup(kaufland.offerKey, lidl.offerKey)

      const wrapper = await mountSuspended(PriceComparisonCard, {
        props: { group, leafletPages: { [PAGE_ID]: page } },
        global: withOffers([kaufland, lidl]),
      })

      expect(wrapper.find('img').attributes('src')).toBe(page.imageUrl)
    })

    it('shows a placeholder tile — never a gap — when no entry has usable imagery', async () => {
      const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
      const group = twoEntryGroup(offers[0]!.offerKey, offers[1]!.offerKey)

      const wrapper = await mountSuspended(PriceComparisonCard, {
        props: { group, leafletPages: {} },
        global: withOffers(offers),
      })

      expect(wrapper.find('img').exists()).toBe(false)
      expect(wrapper.find('svg').exists()).toBe(true)
    })
  })
})
