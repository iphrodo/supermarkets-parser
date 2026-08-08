import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import type { LeafletPage } from '../../../shared/types/offer'
import { makeOffer } from '../../pages/__tests__/fixtures'
import ProductThumb from '../ProductThumb.vue'

const page: LeafletPage = {
  imageUrl: 'https://example.com/leaflet/page-3.jpg',
  width: 676,
  height: 947,
  pageNumber: 3,
  sourceUrl: 'https://example.com/leaflet/',
}

describe('ProductThumb', () => {
  it('scales and offsets the page image so only the cropped region shows', async () => {
    const offer = makeOffer(1)
    // 250/1000 of the page's width and 200/1000 of its height, so 169x189.4 real
    // pixels — taller than wide, so height is the axis that binds in a square tile.
    offer.imageCrop = { pageId: 'billa:cw31:3', box: [200, 100, 400, 350] }

    const wrapper = await mountSuspended(ProductThumb, { props: { offer, page } })
    const image = wrapper.get('img')

    // Height fills the tile: 1 / 0.2 -> 500%, and 200/1000 down the image -> -100%.
    expect(image.attributes('style')).toContain('height: 500%')
    expect(image.attributes('style')).toContain('top: -100%')
    // Width is scaled to the crop's true ratio (169/189.4) rather than filling,
    // then centred, leaving a symmetric band on each side.
    expect(image.attributes('style')).toContain('width: 356.9166%')
    expect(image.attributes('style')).toContain('left: -30.3062%')
    expect(image.attributes('src')).toBe(page.imageUrl)
    expect(image.classes()).toContain('max-w-none')
  })

  it('centres a landscape crop horizontally and letterboxes it vertically', async () => {
    const offer = makeOffer(1)
    // 500/1000 wide by 100/1000 tall of a 676x947 page -> 338x94.7, clearly wide.
    offer.imageCrop = { pageId: 'billa:cw31:3', box: [0, 0, 100, 500] }

    const wrapper = await mountSuspended(ProductThumb, { props: { offer, page } })
    const image = wrapper.get('img')

    // Width binds: 1 / 0.5 -> 200%, flush left because the crop starts at x=0.
    expect(image.attributes('style')).toContain('width: 200%')
    expect(image.attributes('style')).toContain('left: 0%')
    // Height is the short axis, so it is scaled down and centred vertically.
    const fittedHeight = (0.1 * 947) / (0.5 * 676)
    expect(image.attributes('style')).toContain(`height: ${Math.round((fittedHeight / 0.1) * 1e6) / 1e4}%`)
    expect(image.attributes('style')).toContain(`top: ${Math.round(((1 - fittedHeight) / 2) * 1e6) / 1e4}%`)
  })

  it('gives every mode the same fixed tile shape so cards stay aligned', async () => {
    const portrait = makeOffer(1)
    portrait.imageCrop = { pageId: 'billa:cw31:3', box: [0, 400, 800, 600] }
    const landscape = makeOffer(2)
    landscape.imageCrop = { pageId: 'billa:cw31:3', box: [0, 0, 100, 500] }
    const plain = makeOffer(3)
    plain.imageUrl = 'https://example.com/product.jpg'

    for (const offer of [portrait, landscape, plain, makeOffer(4)]) {
      const wrapper = await mountSuspended(ProductThumb, { props: { offer, page } })
      expect(wrapper.get('div').attributes('style')).toContain('aspect-ratio: 1')
    }
  })

  it('renders a plain lazy image when the offer has a direct image URL', async () => {
    const offer = makeOffer(1)
    offer.imageUrl = 'https://example.com/product.jpg'

    const wrapper = await mountSuspended(ProductThumb, { props: { offer } })
    const image = wrapper.get('img')

    expect(image.attributes('src')).toBe('https://example.com/product.jpg')
    expect(image.attributes('loading')).toBe('lazy')
    expect(image.attributes('decoding')).toBe('async')
    expect(image.classes()).toContain('object-contain')
    expect(image.attributes('crossorigin')).toBeUndefined()
    expect(image.attributes('referrerpolicy')).toBeUndefined()
  })

  it('renders the placeholder when the offer has neither an image URL nor a crop', async () => {
    const wrapper = await mountSuspended(ProductThumb, { props: { offer: makeOffer(1) } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders the placeholder when a crop’s page is not in the snapshot', async () => {
    const offer = makeOffer(1)
    offer.imageCrop = { pageId: 'billa:cw31:3', box: [200, 100, 400, 350] }

    const wrapper = await mountSuspended(ProductThumb, { props: { offer, page: null } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('falls back to the placeholder when the image fails to load', async () => {
    const offer = makeOffer(1)
    offer.imageUrl = 'https://example.invalid/broken.jpg'

    const wrapper = await mountSuspended(ProductThumb, { props: { offer } })
    await wrapper.get('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})
