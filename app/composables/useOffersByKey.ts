import { inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import type { Offer } from '../../shared/types/offer'

export type OffersByKey = Map<string, Offer>

/** Exported so a test can provide the lookup directly, without standing up a host component. */
export const OFFERS_BY_KEY: InjectionKey<ComputedRef<OffersByKey>> = Symbol('offersByKey')

/**
 * Resolves a `ComparisonEntry.offerKey` to its `Offer`.
 *
 * Provided rather than passed as a prop for two reasons. Each card used to
 * build its own `Map` over the snapshot's whole offer list inside a `computed`
 * — at ~5000 offers and a 24-card batch that is ~120k insertions, redone every
 * time the batch grew. And the details view needs the same lookup while being
 * mounted at page level, outside the card tree, so a prop would mean threading
 * one object down two separate paths.
 */
export function provideOffersByKey(offersByKey: ComputedRef<OffersByKey>): void {
  provide(OFFERS_BY_KEY, offersByKey)
}

export function useOffersByKey(): ComputedRef<OffersByKey> {
  const offersByKey = inject(OFFERS_BY_KEY)
  if (!offersByKey) {
    throw new Error('useOffersByKey() requires provideOffersByKey() on an ancestor')
  }
  return offersByKey
}
