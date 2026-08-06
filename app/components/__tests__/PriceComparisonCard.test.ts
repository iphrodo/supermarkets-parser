import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { makeComparisonGroup, makeOffer } from '../../pages/__tests__/fixtures'
import PriceComparisonCard from '../PriceComparisonCard.vue'

describe('PriceComparisonCard', () => {
  it('renders the type label, one row per retailer, and badges the cheapest one', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
    const group = makeComparisonGroup({
      labelBg: 'Пилешко филе',
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      ],
      savingsPercentage: 0.2,
    })

    const wrapper = await mountSuspended(PriceComparisonCard, { props: { group, offers } })

    expect(wrapper.text()).toContain('Пилешко филе')
    expect(wrapper.text()).toContain('Kaufland')
    expect(wrapper.text()).toContain('Lidl')
    expect(wrapper.text()).toContain('Cheapest')
    expect(wrapper.text()).toContain('Save up to 20%')
    expect(wrapper.text()).toContain('8.00 €')
  })

  it('shows the pack size and product name of the underlying offer', async () => {
    const offer = makeOffer(0, 'kaufland')
    offer.unitText = '500 г'
    const group = makeComparisonGroup({
      entries: [{ offerKey: offer.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: true }],
    })

    const wrapper = await mountSuspended(PriceComparisonCard, { props: { group, offers: [offer] } })

    expect(wrapper.text()).toContain(offer.name)
    expect(wrapper.text()).toContain('500 г')
  })

  it('links every row to its offer source in a new tab', async () => {
    const offers = [makeOffer(0, 'kaufland'), makeOffer(1, 'lidl')]
    offers[0]!.sourceUrl = 'https://kaufland.example/offer'
    offers[1]!.sourceUrl = 'https://lidl.example/offer'
    const group = makeComparisonGroup({
      entries: [
        { offerKey: offers[0]!.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: false },
        { offerKey: offers[1]!.offerKey, retailer: 'lidl', priceEurCents: 400, unitPriceEurCents: 800, isCheapest: true },
      ],
    })

    const wrapper = await mountSuspended(PriceComparisonCard, { props: { group, offers } })

    const links = wrapper.findAll('a')
    expect(links).toHaveLength(2)
    expect(links.map((link) => link.attributes('href'))).toEqual(['https://kaufland.example/offer', 'https://lidl.example/offer'])
    for (const link of links) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener')
    }
  })

  it('shows the EAN when the offer has one', async () => {
    const offer = makeOffer(0, 'kaufland')
    offer.ean = '1234567890123'
    const group = makeComparisonGroup({
      entries: [{ offerKey: offer.offerKey, retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: true }],
    })

    const wrapper = await mountSuspended(PriceComparisonCard, { props: { group, offers: [offer] } })

    expect(wrapper.text()).toContain('1234567890123')
  })

  it('shows no EAN or stray separator when the offer has none', async () => {
    const offer = makeOffer(0, 'lidl')
    offer.ean = null
    offer.name = 'Прясно мляко'
    offer.unitText = '1 л'
    const group = makeComparisonGroup({
      entries: [{ offerKey: offer.offerKey, retailer: 'lidl', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: true }],
    })

    const wrapper = await mountSuspended(PriceComparisonCard, { props: { group, offers: [offer] } })

    expect(wrapper.text()).toContain('Прясно мляко · 1 л')
    expect(wrapper.text()).not.toContain('Прясно мляко · 1 л ·')
  })

  it('skips an entry whose offer cannot be resolved from the snapshot', async () => {
    const group = makeComparisonGroup({
      entries: [{ offerKey: 'missing-offer', retailer: 'kaufland', priceEurCents: 500, unitPriceEurCents: 1000, isCheapest: true }],
    })

    const wrapper = await mountSuspended(PriceComparisonCard, { props: { group, offers: [] } })

    expect(wrapper.text()).not.toContain('Kaufland')
  })
})
