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
  entries: ComparisonEntry[]
  savingsPercentage: number
  warnings: string[]
}
