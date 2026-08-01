import { ofetch } from 'ofetch'
import * as XLSX from 'xlsx'
import type { Offer } from '../../../shared/types/offer'
import { computeOfferKey, computeProductKey } from '../normalize'

export const LIDL_EXPORT_URL = 'https://www.lidl.bg/explore/assets/webPriceData/bg/ExportSecondList.xlsx'

const SHEET_NAME = 'SecondList'

/** Column indices in the official ЗУПА price-monitoring export (0-indexed, header row excluded). */
const COLUMN = {
  productName: 2,
  brand: 3,
  netQuantity: 4,
  categoryCode: 5,
  productCode: 6,
  referencePrice: 7,
  discountedPrice: 8,
  validFrom: 9,
  validUntil: 10,
  discountPercentage: 11,
} as const

type RawRow = (string | number | null)[]

export class LidlIngestionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'LidlIngestionError'
  }
}

function isNonEmpty(value: string | number | null | undefined): value is string | number {
  return value !== null && value !== undefined && value !== ''
}

function toCents(value: string | number | null): number | null {
  if (!isNonEmpty(value)) return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  if (Number.isNaN(parsed)) return null
  return Math.round(parsed * 100)
}

function toDateOnly(value: string | number | null): string | null {
  if (!isNonEmpty(value)) return null
  const text = String(value)
  const match = text.match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : null
}

interface DiscountedRow {
  productName: string
  brand: string | null
  netQuantity: string
  categoryCode: string
  productCode: string
  referencePriceEurCents: number | null
  discountedPriceEurCents: number
  discountPercentage: number
  validFrom: string
  validUntil: string
}

function parseRow(row: RawRow): DiscountedRow | null {
  const discountedPriceEurCents = toCents(row[COLUMN.discountedPrice] ?? null)
  if (discountedPriceEurCents === null) return null

  const validFrom = toDateOnly(row[COLUMN.validFrom] ?? null)
  const validUntil = toDateOnly(row[COLUMN.validUntil] ?? null)
  const productCode = row[COLUMN.productCode]
  const productName = row[COLUMN.productName]

  if (!validFrom || !validUntil || !isNonEmpty(productCode) || !isNonEmpty(productName)) {
    return null
  }

  const percentageRaw = row[COLUMN.discountPercentage]

  return {
    productName: String(productName).trim(),
    brand: isNonEmpty(row[COLUMN.brand]) ? String(row[COLUMN.brand]).trim() : null,
    netQuantity: isNonEmpty(row[COLUMN.netQuantity]) ? String(row[COLUMN.netQuantity]).trim() : '',
    categoryCode: isNonEmpty(row[COLUMN.categoryCode]) ? String(row[COLUMN.categoryCode]).trim() : '',
    productCode: String(productCode).trim(),
    referencePriceEurCents: toCents(row[COLUMN.referencePrice] ?? null),
    discountedPriceEurCents,
    discountPercentage: isNonEmpty(percentageRaw) ? Number.parseFloat(String(percentageRaw)) : 0,
    validFrom,
    validUntil,
  }
}

/**
 * Deduplicates store-row rows into one national offer per product code +
 * period, and flags a warning when store rows for the same product/period
 * unexpectedly disagree on price (contradicting the verified national-pricing
 * baseline) instead of silently discarding or arbitrarily picking a value.
 */
function dedupeByProductAndPeriod(rows: DiscountedRow[]): { row: DiscountedRow; divergent: boolean }[] {
  const groups = new Map<string, DiscountedRow[]>()

  for (const row of rows) {
    const key = `${row.productCode}:${row.validFrom}:${row.validUntil}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  return Array.from(groups.values()).map((group) => {
    const [first, ...rest] = group
    const divergent = rest.some(
      (row) =>
        row.discountedPriceEurCents !== first!.discountedPriceEurCents ||
        row.referencePriceEurCents !== first!.referencePriceEurCents,
    )
    return { row: first!, divergent }
  })
}

function mapOffer(entry: DiscountedRow, divergent: boolean, sourceUrl: string, scrapedAt: string): Offer {
  const productKey = computeProductKey({
    retailer: 'lidl',
    name: entry.productName,
    unitText: entry.netQuantity,
    ean: null,
  })
  const offerKey = computeOfferKey(productKey, entry.validFrom)

  return {
    offerKey,
    productKey,
    retailer: 'lidl',
    brand: entry.brand,
    name: entry.productName,
    unitText: entry.netQuantity,
    category: entry.categoryCode,
    campaign: null,
    discountPercentage: entry.discountPercentage,
    priceEurCents: entry.discountedPriceEurCents,
    priceBgnCents: null,
    originalPriceEurCents: entry.referencePriceEurCents,
    loyaltyTier: 'none',
    mechanic: 'standard',
    purchaseLimit: null,
    ean: null,
    scope: 'national',
    store: null,
    validFrom: entry.validFrom,
    validUntil: entry.validUntil,
    sourceUrl,
    scrapedAt,
    warnings: divergent
      ? [
          `Store-level price divergence detected for product code "${entry.productCode}" in period ${entry.validFrom}..${entry.validUntil}`,
        ]
      : [],
  }
}

/** Exported separately so fixture-based tests never need to hit the network. */
export function parseLidlWorkbook(buffer: ArrayBuffer | Buffer): Offer[] {
  const scrapedAt = new Date().toISOString()

  let workbook: XLSX.WorkBook
  try {
    const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    workbook = XLSX.read(nodeBuffer, { type: 'buffer' })
  } catch (error) {
    throw new LidlIngestionError('Failed to parse Lidl export as a valid XLSX workbook', { cause: error })
  }

  const sheet = workbook.Sheets[SHEET_NAME] ?? workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet) {
    throw new LidlIngestionError('Lidl export workbook has no sheets')
  }

  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { header: 1, defval: null })
  const discountedRows = rows.slice(1).map(parseRow).filter((row): row is DiscountedRow => row !== null)
  const deduped = dedupeByProductAndPeriod(discountedRows)

  return deduped.map(({ row, divergent }) => mapOffer(row, divergent, LIDL_EXPORT_URL, scrapedAt))
}

export async function fetchLidlOffers(): Promise<Offer[]> {
  let buffer: ArrayBuffer
  try {
    buffer = await ofetch<ArrayBuffer>(LIDL_EXPORT_URL, { responseType: 'arrayBuffer' })
  } catch (error) {
    throw new LidlIngestionError('Failed to download Lidl XLSX export', { cause: error })
  }

  return parseLidlWorkbook(buffer)
}
