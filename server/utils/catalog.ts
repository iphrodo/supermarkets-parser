import type { Offer } from '../../shared/types/offer'

export interface CatalogMergeResult {
  offers: Offer[]
  warnings: string[]
}

/**
 * Combines offers from both retailers into one deduplicated catalog.
 * Two offers colliding on `offerKey` with different prices indicates an
 * upstream anomaly (e.g. unexpected store-level divergence that slipped
 * past a source's own dedup) — kept, flagged, not silently dropped.
 */
export function mergeCatalog(...offerLists: Offer[][]): CatalogMergeResult {
  const byKey = new Map<string, Offer>()
  const warnings: string[] = []

  for (const offer of offerLists.flat()) {
    const existing = byKey.get(offer.offerKey)

    if (!existing) {
      byKey.set(offer.offerKey, { ...offer, warnings: [...offer.warnings] })
      continue
    }

    if (existing.priceEurCents !== offer.priceEurCents) {
      const warning = `Price divergence for offerKey "${offer.offerKey}": ${existing.priceEurCents} vs ${offer.priceEurCents} EUR cents`
      warnings.push(warning)
      existing.warnings.push(warning)
    }
  }

  return { offers: Array.from(byKey.values()), warnings }
}
