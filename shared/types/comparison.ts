import type { DepartmentId } from './department'
import type { Retailer } from './offer'

export type UnitBase = 'kg' | 'l' | 'pc'

export interface ComparisonEntry {
  offerKey: string
  retailer: Retailer
  priceEurCents: number
  unitPriceEurCents: number
  isCheapest: boolean
}

export interface ComparisonGroup {
  groupKey: string
  labelBg: string
  unitBase: UnitBase
  /** Carried on the group so consumers can group, count, and filter by aisle without resolving the type vocabulary. */
  department: DepartmentId
  entries: ComparisonEntry[]
  savingsPercentage: number
  warnings: string[]
}
