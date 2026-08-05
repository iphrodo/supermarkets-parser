import type { UnitBase } from '../../shared/types/comparison'
import type { Offer, OfferMechanic } from '../../shared/types/offer'
import { splitUnitSegments } from './normalize'

export interface ParsedQuantity {
  unitBase: UnitBase
  baseQuantity: number
}

interface UnitToken {
  unitBase: UnitBase
  toBase: (value: number) => number
}

const UNIT_TOKENS: Record<string, UnitToken> = {
  г: { unitBase: 'kg', toBase: (v) => v / 1000 },
  гр: { unitBase: 'kg', toBase: (v) => v / 1000 },
  g: { unitBase: 'kg', toBase: (v) => v / 1000 },
  кг: { unitBase: 'kg', toBase: (v) => v },
  kg: { unitBase: 'kg', toBase: (v) => v },
  мл: { unitBase: 'l', toBase: (v) => v / 1000 },
  ml: { unitBase: 'l', toBase: (v) => v / 1000 },
  л: { unitBase: 'l', toBase: (v) => v },
  l: { unitBase: 'l', toBase: (v) => v },
  бр: { unitBase: 'pc', toBase: (v) => v },
  броя: { unitBase: 'pc', toBase: (v) => v },
  брой: { unitBase: 'pc', toBase: (v) => v },
  pcs: { unitBase: 'pc', toBase: (v) => v },
  pc: { unitBase: 'pc', toBase: (v) => v },
}

/** Deterministic tie-break when a text carries several unit tokens: volume wins, then weight, then pieces. */
const UNIT_PRIORITY: Record<UnitBase, number> = { l: 0, kg: 1, pc: 2 }

function parseNumber(raw: string): number {
  return Number(raw.replace(',', '.'))
}

const MULTIPACK_RE = /^(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)\s*([a-zа-я]+)\.?$/
const SIMPLE_RE = /^(\d+(?:[.,]\d+)?)\s*([a-zа-я]+)\.?$/

function parseSegment(segment: string): ParsedQuantity | null {
  const multipackMatch = segment.match(MULTIPACK_RE)
  if (multipackMatch) {
    const count = parseNumber(multipackMatch[1]!)
    const size = parseNumber(multipackMatch[2]!)
    const token = UNIT_TOKENS[multipackMatch[3]!]
    if (!token || !Number.isFinite(count) || !Number.isFinite(size)) return null
    return { unitBase: token.unitBase, baseQuantity: token.toBase(count * size) }
  }

  const simpleMatch = segment.match(SIMPLE_RE)
  if (simpleMatch) {
    const value = parseNumber(simpleMatch[1]!)
    const token = UNIT_TOKENS[simpleMatch[2]!]
    if (!token || !Number.isFinite(value)) return null
    return { unitBase: token.unitBase, baseQuantity: token.toBase(value) }
  }

  return null
}

/**
 * Converts Bulgarian unit/quantity text into a base unit and quantity.
 * Multi-token text (e.g. Kaufland's "3 л/ 1455 г") is resolved deterministically
 * by `UNIT_PRIORITY`, regardless of token order. Empty or unrecognized text
 * yields `null` rather than a guessed quantity.
 */
export function parseQuantity(unitText: string): ParsedQuantity | null {
  const segments = splitUnitSegments(unitText)
  if (!segments.length) return null

  const parsed = segments.map(parseSegment).filter((p): p is ParsedQuantity => p !== null)
  if (!parsed.length) return null

  parsed.sort((a, b) => UNIT_PRIORITY[a.unitBase] - UNIT_PRIORITY[b.unitBase])
  return parsed[0]!
}

/** Effective price paid per unit once bought, folding in multi-buy mechanics; `loyaltyTier` is left untouched. */
const MECHANIC_MULTIPLIER: Record<OfferMechanic, number> = {
  standard: 1,
  buy_1_get_1_free: 0.5,
  buy_2_get_1_free: 2 / 3,
}

export function unitPriceEurCents(offer: Pick<Offer, 'priceEurCents' | 'mechanic'>, quantity: ParsedQuantity): number {
  const effectivePriceEurCents = offer.priceEurCents * MECHANIC_MULTIPLIER[offer.mechanic]
  return effectivePriceEurCents / quantity.baseQuantity
}
