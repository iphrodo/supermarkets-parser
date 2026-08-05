import { createHash } from 'node:crypto'

/** Splits slash-joined multi-unit text into trimmed, lowercased, whitespace-collapsed segments. */
export function splitUnitSegments(unitText: string): string[] {
  return unitText
    .split('/')
    .map((token) => token.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(Boolean)
}

/**
 * Collapses case, whitespace, and token order differences in unit/quantity
 * text (e.g. "3 л/ 1455 г" vs "1455 г/ 3 л") so both hash to the same key.
 */
export function normalizeUnitText(unitText: string): string {
  return [...splitUnitSegments(unitText)].sort().join('/')
}

export function normalizeNameText(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface ProductIdentityInput {
  retailer: string
  name: string
  unitText: string
  ean: string | null
}

/**
 * Stable across weeks: EAN-based when present (comparable across retailers),
 * otherwise a retailer-scoped hash of normalized name + unit text.
 */
export function computeProductKey(input: ProductIdentityInput): string {
  if (input.ean) {
    return `ean:${input.ean}`
  }

  const normalizedName = normalizeNameText(input.name)
  const normalizedUnit = normalizeUnitText(input.unitText)
  const hash = createHash('sha1')
    .update(`${input.retailer}:${normalizedName}:${normalizedUnit}`)
    .digest('hex')
    .slice(0, 16)

  return `name:${hash}`
}

export function computeOfferKey(productKey: string, validFrom: string): string {
  return `${productKey}:${validFrom}`
}
