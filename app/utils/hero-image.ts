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
 * The order prefers a clean product photograph over a leaflet crop, and the
 * cheapest entry over the others:
 *
 * 1. cheapest entry with a direct image URL
 * 2. any entry with one
 * 3. cheapest entry with a resolvable crop
 * 4. any entry with a resolvable crop
 * 5. none — the caller shows a placeholder tile
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

  const anyWithUrl = offers.find(hasUrl)
  if (anyWithUrl) return anyWithUrl.offer

  const cheapestWithCrop = offers.find((candidate) => candidate.isCheapest && hasCrop(candidate))
  if (cheapestWithCrop) return cheapestWithCrop.offer

  return offers.find(hasCrop)?.offer ?? null
}
