import type { BoundingBox2d } from '../../../shared/types/offer'

/** Gemini's detection coordinates are normalized to this range on both axes. */
const COORD_MAX = 1000
/** Below this, the "box" is a sliver of packaging or a misplaced price tag, not a product photo. */
const MIN_SIDE = 25
/** A box larger than this is usually the whole tile, the page banner, or a hallucinated full-page box. */
const MAX_AREA_FRACTION = 0.25
const MIN_ASPECT_RATIO = 1 / 4
const MAX_ASPECT_RATIO = 4
/** Grown per side, relative to the box's own size, so a tight box doesn't shave the product. */
const PADDING_FRACTION = 0.04
/** Above this, two items are claiming the same photograph and neither can be trusted with it. */
const MAX_IOU = 0.5

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Validates one model-emitted `[ymin, xmin, ymax, xmax]` box and returns a
 * padded, in-bounds copy, or `null` when the box cannot be trusted.
 *
 * Every ambiguity resolves toward `null`: a missing product image is a
 * placeholder tile, while a wrong one is a card confidently showing the wrong
 * product. In particular, inverted axes are rejected rather than swapped —
 * an inverted box usually means the model emitted `[xmin, ymin, xmax, ymax]`,
 * and swapping that produces a plausible-looking crop of the wrong region.
 */
export function sanitizeBox(raw: unknown): BoundingBox2d | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  if (!raw.every((value) => typeof value === 'number' && Number.isInteger(value))) return null

  const [ymin, xmin, ymax, xmax] = (raw as number[]).map((value) => clamp(value, 0, COORD_MAX)) as BoundingBox2d

  if (ymin >= ymax || xmin >= xmax) return null

  const height = ymax - ymin
  const width = xmax - xmin

  if (Math.min(height, width) < MIN_SIDE) return null
  if ((height * width) / (COORD_MAX * COORD_MAX) > MAX_AREA_FRACTION) return null

  const aspectRatio = width / height
  if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) return null

  const padY = height * PADDING_FRACTION
  const padX = width * PADDING_FRACTION

  return [
    Math.round(clamp(ymin - padY, 0, COORD_MAX)),
    Math.round(clamp(xmin - padX, 0, COORD_MAX)),
    Math.round(clamp(ymax + padY, 0, COORD_MAX)),
    Math.round(clamp(xmax + padX, 0, COORD_MAX)),
  ]
}

function intersectionOverUnion(a: BoundingBox2d, b: BoundingBox2d): number {
  const overlapHeight = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
  const overlapWidth = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  if (overlapHeight <= 0 || overlapWidth <= 0) return 0

  const intersection = overlapHeight * overlapWidth
  const areaA = (a[2] - a[0]) * (a[3] - a[1])
  const areaB = (b[2] - b[0]) * (b[3] - b[1])

  return intersection / (areaA + areaB - intersection)
}

/**
 * Drops boxes that substantially overlap another box on the same page, from
 * **both** sides of the pair: when two items claim the same photograph it
 * cannot be determined which one it depicts. Dense leaflet pages are where
 * detection fails, and duplicated or shifted boxes are its signature there.
 */
export function rejectOverlappingBoxes<T extends { box: BoundingBox2d }>(items: T[]): T[] {
  const overlapping = new Set<number>()

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (intersectionOverUnion(items[i]!.box, items[j]!.box) > MAX_IOU) {
        overlapping.add(i)
        overlapping.add(j)
      }
    }
  }

  return items.filter((_, index) => !overlapping.has(index))
}
