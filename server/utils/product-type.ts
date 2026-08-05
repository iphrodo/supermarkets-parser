import { Type } from '@google/genai'
import type { Offer } from '../../shared/types/offer'
import {
  readProductTypeAssignments,
  readProductTypeVocabulary,
  writeProductTypeAssignments,
  writeProductTypeVocabulary,
  type ProductType,
  type ProductTypeAssignments,
  type ProductTypeVocabulary,
} from './kv'
import type { UnitBase } from '../../shared/types/comparison'
import { extractStructuredData } from './scrapers/vision-extraction'

/** Kept well under typical structured-output limits while still amortizing the vocabulary preamble across many items. */
const BATCH_SIZE = 40

export interface ClassificationItem {
  index: number
  name: string
  brand: string | null
}

export interface ClassificationResult {
  index: number
  typeId: string | null
  newType: { labelBg: string; labelEn: string; unitBase: UnitBase } | null
  confident: boolean
}

export interface ClassifyOffersDeps {
  readVocabulary: () => Promise<ProductTypeVocabulary>
  writeVocabulary: (vocabulary: ProductTypeVocabulary) => Promise<void>
  readAssignments: () => Promise<ProductTypeAssignments>
  writeAssignments: (assignments: ProductTypeAssignments) => Promise<void>
  classifyBatch: (items: ClassificationItem[], vocabulary: ProductTypeVocabulary) => Promise<ClassificationResult[]>
  logError?: (message: string, error: unknown) => void
}

export interface ClassifyOffersResult {
  vocabulary: ProductTypeVocabulary
  assignments: ProductTypeAssignments
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9а-я]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'type'
  )
}

function uniqueTypeId(labelBg: string, vocabulary: ProductTypeVocabulary): string {
  const base = slugify(labelBg)
  const existingIds = new Set(vocabulary.map((t) => t.id))
  if (!existingIds.has(base)) return base

  let suffix = 2
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

/**
 * Classifies offers into canonical product types, skipping any offer whose
 * `productKey` is already cached in `assignments`. Batches new offers
 * (~`BATCH_SIZE` per call) through `deps.classifyBatch`, growing the
 * vocabulary in place across batches so later batches in the same run see
 * types proposed by earlier ones. Unconfident results and results claiming
 * a `typeId` outside the vocabulary are dropped rather than trusted.
 */
export async function classifyOffers(offers: Offer[], deps: ClassifyOffersDeps): Promise<ClassifyOffersResult> {
  const log = deps.logError ?? ((message: string, error: unknown) => console.error(message, error))

  let vocabulary = await deps.readVocabulary()
  const assignments = await deps.readAssignments()

  const uniqueByProductKey = new Map<string, Offer>()
  for (const offer of offers) {
    if (!uniqueByProductKey.has(offer.productKey)) uniqueByProductKey.set(offer.productKey, offer)
  }

  const newEntries = Array.from(uniqueByProductKey.values()).filter((offer) => !(offer.productKey in assignments))
  if (!newEntries.length) {
    return { vocabulary, assignments }
  }

  for (let start = 0; start < newEntries.length; start += BATCH_SIZE) {
    const batch = newEntries.slice(start, start + BATCH_SIZE)
    const items: ClassificationItem[] = batch.map((offer, index) => ({ index, name: offer.name, brand: offer.brand }))

    let results: ClassificationResult[]
    try {
      results = await deps.classifyBatch(items, vocabulary)
    } catch (error) {
      log('Product-type classification batch failed', error)
      continue
    }

    for (const result of results) {
      const offer = batch[result.index]
      if (!offer || !result.confident) continue

      if (result.typeId) {
        if (!vocabulary.some((t) => t.id === result.typeId)) continue
        assignments[offer.productKey] = result.typeId
      } else if (result.newType) {
        const id = uniqueTypeId(result.newType.labelBg, vocabulary)
        const type: ProductType = {
          id,
          labelBg: result.newType.labelBg,
          labelEn: result.newType.labelEn,
          unitBase: result.newType.unitBase,
        }
        vocabulary = [...vocabulary, type]
        assignments[offer.productKey] = id
      }
    }
  }

  await deps.writeVocabulary(vocabulary)
  await deps.writeAssignments(assignments)

  return { vocabulary, assignments }
}

function buildClassificationPrompt(items: ClassificationItem[], vocabulary: ProductTypeVocabulary): string {
  const vocabularyBlock = vocabulary.length
    ? vocabulary.map((type) => `- ${type.id}: ${type.labelBg} (${type.unitBase})`).join('\n')
    : '(empty — no types exist yet)'

  const itemsBlock = items
    .map((item) => `${item.index}. ${item.brand ? `${item.brand} ` : ''}${item.name}`)
    .join('\n')

  return `You are assigning Bulgarian supermarket products to a canonical product *type* used to compare prices across retailers.

A type is a generic kind of product with brand and pack size stripped, e.g. "пилешко филе", "кисело мляко", "кашкавал от краве мляко" — not a specific SKU, and not a broad department like "месо" or "млечни продукти".

Never assign a product to a type of a different species, animal source, or fundamentally different ingredient — e.g. chicken is never "свинско месо" (pork), and a plant-based product is never assigned a dairy or meat type — even if the names or pack sizes look superficially similar. When in doubt between two specific, non-overlapping types, prefer proposing a new type over forcing a mismatch.

Existing types:
${vocabularyBlock}

For each numbered product below, either:
- reuse an existing type by its id if one clearly matches this generic kind of product (strongly prefer reuse over creating a near-duplicate type), or
- propose a new type (labelBg, labelEn, unitBase) only if none of the existing types fit.

Set confident to false (with typeId and newType both null) if you cannot determine a clear, generic product type for that item — do not guess.

Each result's "index" MUST exactly match the number of the product it describes below. Double-check every index before responding — a mismatched index silently corrupts the comparison for two unrelated products.

Products:
${itemsBlock}`
}

const CLASSIFICATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          typeId: { type: Type.STRING, nullable: true },
          newType: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              labelBg: { type: Type.STRING },
              labelEn: { type: Type.STRING },
              unitBase: { type: Type.STRING, enum: ['kg', 'l', 'pc'] },
            },
            required: ['labelBg', 'labelEn', 'unitBase'],
          },
          confident: { type: Type.BOOLEAN },
        },
        required: ['index', 'confident'],
      },
    },
  },
  required: ['items'],
} as const

/** Default `classifyBatch`, wired to the real Gemini text-classification call. */
async function classifyBatchWithModel(
  items: ClassificationItem[],
  vocabulary: ProductTypeVocabulary,
): Promise<ClassificationResult[]> {
  const prompt = buildClassificationPrompt(items, vocabulary)
  const parsed = await extractStructuredData<{ items?: ClassificationResult[] }>(prompt, CLASSIFICATION_RESPONSE_SCHEMA)
  return parsed.items ?? []
}

/** Wires `classifyOffers` to the real KV store and model; the production default used by `runDailySync`. */
export function defaultClassifyOffersDeps(): ClassifyOffersDeps {
  return {
    readVocabulary: readProductTypeVocabulary,
    writeVocabulary: writeProductTypeVocabulary,
    readAssignments: readProductTypeAssignments,
    writeAssignments: writeProductTypeAssignments,
    classifyBatch: classifyBatchWithModel,
  }
}
