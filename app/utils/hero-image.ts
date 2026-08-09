import type { ComparisonGroup } from '../../shared/types/comparison'
import type { LeafletPage, Offer } from '../../shared/types/offer'

/**
 * Picks the one offer whose imagery represents a comparison group.
 *
 * One image per card rather than one per retailer row: three images across a
 * 24-card batch is visually noisy and expensive, and it reintroduces the
 * flatness the redesign removes. Per-retailer imagery lives in the details
 * view, where the user has already asked to compare specifics.
 *
 * The order prefers the cheapest entry's own imagery over attribution to any
 * other entry, since the image and the headline price are read as one
 * statement about one product:
 *
 * 1. cheapest entry with a direct image URL
 * 2. cheapest entry with a resolvable crop
 * 3. any entry with a direct image URL
 * 4. any entry with a resolvable crop
 * 5. none — the caller shows a placeholder tile
 *
 * Cross-entry fallback (steps 3-4) only applies when the cheapest entry has
 * no usable imagery of its own; there, a clean photograph is still preferred
 * over a leaflet crop.
 *
 * A crop counts only when the page it points at is present in the same
 * snapshot; an unresolvable crop is no imagery at all, not a broken image.
 */
export function resolveHeroOffer(
  group: ComparisonGroup,
  offersByKey: Map<string, Offer>,
  leafletPages: Record<string, LeafletPage>,
): Offer | null {
  const offers: { offer: Offer; isCheapest: boolean }[] = []
  for (const entry of group.entries) {
    const offer = offersByKey.get(entry.offerKey)
    if (offer) offers.push({ offer, isCheapest: entry.isCheapest })
  }

  const hasUrl = ({ offer }: { offer: Offer }) => Boolean(offer.imageUrl)
  const hasCrop = ({ offer }: { offer: Offer }) =>
    Boolean(offer.imageCrop && leafletPages[offer.imageCrop.pageId])

  const cheapestWithUrl = offers.find((candidate) => candidate.isCheapest && hasUrl(candidate))
  if (cheapestWithUrl) return cheapestWithUrl.offer

  const cheapestWithCrop = offers.find((candidate) => candidate.isCheapest && hasCrop(candidate))
  if (cheapestWithCrop) return cheapestWithCrop.offer

  const anyWithUrl = offers.find(hasUrl)
  if (anyWithUrl) return anyWithUrl.offer

  return offers.find(hasCrop)?.offer ?? null
}
