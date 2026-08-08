import type { UnitBase } from '../../shared/types/comparison'
import type { LoyaltyTier, OfferMechanic, Retailer } from '../../shared/types/offer'

/**
 * The presentation vocabulary shared by every card and the details view.
 * Previously each component carried its own copy of the retailer labels and the
 * cent formatter, which is how `OfferCard` and `PriceComparisonCard` drifted
 * into rendering the same value two different ways.
 */

export const RETAILER_LABELS: Record<Retailer, string> = {
  kaufland: 'Kaufland',
  lidl: 'Lidl',
  billa: 'Billa',
}

export const UNIT_SUFFIX: Record<UnitBase, string> = {
  kg: '/кг',
  l: '/л',
  pc: '/бр',
}

/** `null` where the mechanic is the absence of a promotion — nothing should be rendered for it. */
export const MECHANIC_LABELS: Record<OfferMechanic, string | null> = {
  standard: null,
  buy_1_get_1_free: '1+1 безплатно',
  buy_2_get_1_free: '2+1 безплатно',
}

/** Loyalty programmes keep their own brand names; they are not translated. */
export const LOYALTY_LABELS: Record<LoyaltyTier, string | null> = {
  none: null,
  kaufland_card: 'Kaufland Card',
  kaufland_card_xtra: 'Kaufland Card Xtra',
}

/** Prices are integer cents everywhere in the pipeline; this is the only place they become text. */
export function formatEur(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`
}

export function formatBgn(cents: number): string {
  return `${(cents / 100).toFixed(2)} лв.`
}

/** `DD.MM.YYYY` — the Bulgarian convention, and never the raw ISO string. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getFullYear()}`
}

/** A per-unit price with its base unit attached, e.g. `4.80 €/кг`. */
export function formatUnitPrice(cents: number, unitBase: UnitBase): string {
  return `${formatEur(cents)}${UNIT_SUFFIX[unitBase]}`
}

/**
 * Bulgarian has a two-form plural (one / many), so a count label cannot be
 * built by appending an "s". Used for the result count in the toolbar.
 */
export function pluralizeProducts(count: number): string {
  return count === 1 ? 'продукт' : 'продукта'
}
