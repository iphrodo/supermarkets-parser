import { describe, expect, it } from 'vitest'
import type { BoundingBox2d } from '../../../../shared/types/offer'
import { rejectOverlappingBoxes, sanitizeBox } from '../bounding-box'

describe('sanitizeBox', () => {
  it('accepts a plausible box and pads it by 4% per side', () => {
    // 200x200 box: 4% padding is 8 units on every side.
    expect(sanitizeBox([100, 100, 300, 300])).toEqual([92, 92, 308, 308])
  })

  it('rejects a box that is not exactly four values', () => {
    expect(sanitizeBox([100, 100, 300])).toBeNull()
    expect(sanitizeBox([100, 100, 300, 300, 300])).toBeNull()
  })

  it('rejects non-integer and non-finite coordinates', () => {
    expect(sanitizeBox([100.5, 100, 300, 300])).toBeNull()
    expect(sanitizeBox([Number.NaN, 100, 300, 300])).toBeNull()
    expect(sanitizeBox([Number.POSITIVE_INFINITY, 100, 300, 300])).toBeNull()
    expect(sanitizeBox(['100', 100, 300, 300])).toBeNull()
  })

  it('rejects anything that is not an array', () => {
    expect(sanitizeBox(null)).toBeNull()
    expect(sanitizeBox(undefined)).toBeNull()
    expect(sanitizeBox({ ymin: 100 })).toBeNull()
  })

  it('rejects inverted axes rather than swapping them', () => {
    // An inverted box usually means [xmin, ymin, xmax, ymax]; swapping would
    // produce a confidently wrong crop.
    expect(sanitizeBox([300, 100, 100, 300])).toBeNull()
    expect(sanitizeBox([100, 300, 300, 100])).toBeNull()
  })

  it('clamps out-of-range coordinates before validating', () => {
    expect(sanitizeBox([-50, -50, 200, 200])).toEqual([0, 0, 208, 208])
    expect(sanitizeBox([800, 800, 1200, 1200])).toEqual([792, 792, 1000, 1000])
  })

  it('rejects a sliver whose shorter side is under 2.5% of the page', () => {
    expect(sanitizeBox([100, 100, 120, 400])).toBeNull()
  })

  it('rejects a box occupying more than 25% of the page', () => {
    // 600x500 = 30% of the page.
    expect(sanitizeBox([100, 100, 700, 600])).toBeNull()
  })

  it('rejects a box with an extreme aspect ratio', () => {
    // 500 wide by 100 tall is 5:1.
    expect(sanitizeBox([100, 100, 200, 600])).toBeNull()
    expect(sanitizeBox([100, 100, 600, 200])).toBeNull()
  })

  it('clamps padding at the page edges', () => {
    expect(sanitizeBox([0, 0, 200, 200])).toEqual([0, 0, 208, 208])
    expect(sanitizeBox([800, 800, 1000, 1000])).toEqual([792, 792, 1000, 1000])
  })
})

describe('rejectOverlappingBoxes', () => {
  function item(box: BoundingBox2d, id: string) {
    return { box, id }
  }

  it('drops the box from both items of a substantially overlapping pair', () => {
    // 100x100 boxes offset by 10 on each axis: IoU ≈ 0.68.
    const kept = rejectOverlappingBoxes([
      item([100, 100, 200, 200], 'a'),
      item([110, 110, 210, 210], 'b'),
    ])

    expect(kept).toEqual([])
  })

  it('keeps both boxes of a mildly overlapping pair', () => {
    // 100x100 boxes offset by 45 on each axis: IoU ≈ 0.19.
    const kept = rejectOverlappingBoxes([
      item([100, 100, 200, 200], 'a'),
      item([145, 145, 245, 245], 'b'),
    ])

    expect(kept.map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('keeps disjoint boxes and only drops the offending pair', () => {
    const kept = rejectOverlappingBoxes([
      item([100, 100, 200, 200], 'a'),
      item([105, 105, 205, 205], 'b'),
      item([600, 600, 700, 700], 'c'),
    ])

    expect(kept.map((entry) => entry.id)).toEqual(['c'])
  })

  it('returns an empty list unchanged', () => {
    expect(rejectOverlappingBoxes([])).toEqual([])
  })
})
