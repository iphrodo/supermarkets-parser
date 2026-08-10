import type { ComparisonEntry, ComparisonGroup } from '../../shared/types/comparison'
import { CATCH_ALL_DEPARTMENT, toDepartmentId, type DepartmentId } from '../../shared/types/department'
import type { Offer, Retailer } from '../../shared/types/offer'
import type { ProductTypeAssignments, ProductTypeVocabulary } from './kv'
import { parseQuantity, unitPriceEurCents } from './quantity'

/** An entry whose per-unit price exceeds this multiple of its group's median is treated as a likely extraction error. */
const OUTLIER_MULTIPLIER = 10

interface CandidateEntry {
  offer: Offer
  unitPrice: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** Resolves a canonical product type's department from either the type id or an offer's `productKey`. */
export interface DepartmentResolver {
  forTypeId(typeId: string | undefined): DepartmentId
  forProductKey(productKey: string): DepartmentId
}

/**
 * Joins `productKey → typeId → ProductType.department` through the same
 * vocabulary/assignments already computed each sync. Extracted from
 * `buildComparisons` so per-offer department annotation (`sync.ts`) doesn't
 * duplicate the join.
 */
export function createDepartmentResolver(
  vocabulary: ProductTypeVocabulary,
  assignments: ProductTypeAssignments,
): DepartmentResolver {
  const typesById = new Map(vocabulary.map((type) => [type.id, type]))

  function forTypeId(typeId: string | undefined): DepartmentId {
    if (!typeId) return CATCH_ALL_DEPARTMENT
    const type = typesById.get(typeId)
    return toDepartmentId(type?.department)
  }

  function forProductKey(productKey: string): DepartmentId {
    return forTypeId(assignments[productKey])
  }

  return { forTypeId, forProductKey }
}

/**
 * Builds cross-retailer comparison groups from a snapshot's offers.
 * Groups by canonical product type, reduces each retailer to its cheapest
 * comparable offer, drops groups covering fewer than two retailers, and
 * guards against implausible per-unit prices (see `price-comparison` spec).
 */
export function buildComparisons(
  offers: Offer[],
  vocabulary: ProductTypeVocabulary,
  assignments: ProductTypeAssignments,
): ComparisonGroup[] {
  const typesById = new Map(vocabulary.map((type) => [type.id, type]))
  const resolveDepartment = createDepartmentResolver(vocabulary, assignments)

  const byTypeId = new Map<string, CandidateEntry[]>()

  for (const offer of offers) {
    const typeId = assignments[offer.productKey]
    if (!typeId) continue

    const type = typesById.get(typeId)
    if (!type) continue

    const quantity = parseQuantity(offer.unitText)
    if (!quantity) continue
    if (quantity.unitBase !== type.unitBase) continue

    const unitPrice = unitPriceEurCents(offer, quantity)
    const list = byTypeId.get(typeId) ?? []
    list.push({ offer, unitPrice })
    byTypeId.set(typeId, list)
  }

  const groups: ComparisonGroup[] = []

  for (const [typeId, candidates] of byTypeId) {
    const type = typesById.get(typeId)!

    const cheapestByRetailer = new Map<Retailer, CandidateEntry>()
    for (const candidate of candidates) {
      const existing = cheapestByRetailer.get(candidate.offer.retailer)
      if (!existing || candidate.unitPrice < existing.unitPrice) {
        cheapestByRetailer.set(candidate.offer.retailer, candidate)
      }
    }

    let reduced = Array.from(cheapestByRetailer.values())
    if (reduced.length < 2) continue

    const medianUnitPrice = median(reduced.map((entry) => entry.unitPrice))
    const warnings: string[] = []
    reduced = reduced.filter((entry) => {
      if (entry.unitPrice > medianUnitPrice * OUTLIER_MULTIPLIER) {
        warnings.push(
          `Excluded ${entry.offer.offerKey} (${entry.offer.retailer}): unit price ${entry.unitPrice.toFixed(2)} is more than ${OUTLIER_MULTIPLIER}x the group median ${medianUnitPrice.toFixed(2)}`,
        )
        return false
      }
      return true
    })

    if (reduced.length < 2) continue

    reduced.sort((a, b) => a.unitPrice - b.unitPrice)
    const cheapestUnitPrice = reduced[0]!.unitPrice
    const mostExpensiveUnitPrice = reduced[reduced.length - 1]!.unitPrice

    const entries: ComparisonEntry[] = reduced.map((entry, index) => ({
      offerKey: entry.offer.offerKey,
      retailer: entry.offer.retailer,
      priceEurCents: entry.offer.priceEurCents,
      unitPriceEurCents: entry.unitPrice,
      isCheapest: index === 0,
    }))

    const savingsPercentage =
      mostExpensiveUnitPrice === 0 ? 0 : (mostExpensiveUnitPrice - cheapestUnitPrice) / mostExpensiveUnitPrice

    groups.push({
      groupKey: typeId,
      labelBg: type.labelBg,
      unitBase: type.unitBase,
      department: resolveDepartment.forTypeId(typeId),
      entries,
      savingsPercentage,
      warnings,
    })
  }

  groups.sort((a, b) => b.savingsPercentage - a.savingsPercentage)

  return groups
}
