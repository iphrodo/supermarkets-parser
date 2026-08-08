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
import {
  DEPARTMENTS,
  DEPARTMENT_LABELS_BG,
  toDepartmentId,
  type DepartmentId,
} from '../../shared/types/department'
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
  newType: { labelBg: string; labelEn: string; unitBase: UnitBase; department: DepartmentId } | null
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

/**
 * The identity a type is deduplicated on. Lowercase, trimmed, internal
 * whitespace collapsed — and deliberately nothing more: stripping accents or
 * stemming would start approximating meaning, and merging on an approximation
 * of meaning is how two genuinely distinct product kinds get silently combined.
 */
export function normalizeLabel(labelBg: string): string {
  return labelBg.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Resolves the id a proposed type should use: an existing type's when it is
 * indistinguishable from the proposal, a fresh slug otherwise.
 *
 * The previous version keyed on the slug alone, so a taken slug meant "mint
 * `<slug>-2`". In production that read the model proposing a type that already
 * existed as a reason to create a second one — every one of the 88 suffixed ids
 * in the live vocabulary was a duplicate, and not one was the slug collision the
 * suffix was written for. Keying on the label makes the intent explicit and
 * leaves the slug doing only what a slug should.
 *
 * `unitBase` is part of the identity because `buildComparisons` excludes an
 * offer whose base unit disagrees with its type: merging a `kg` type into an
 * `l` one of the same name would replace a duplicate with a broken group.
 */
function resolveTypeId(labelBg: string, unitBase: UnitBase, vocabulary: ProductTypeVocabulary): string {
  const label = normalizeLabel(labelBg)
  const existing = vocabulary.find((t) => normalizeLabel(t.labelBg) === label && t.unitBase === unitBase)
  if (existing) return existing.id

  const base = slugify(labelBg)
  const existingIds = new Set(vocabulary.map((t) => t.id))
  if (!existingIds.has(base)) return base

  // Only reachable now by two genuinely different labels slugifying the same.
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
 * a `typeId` outside the vocabulary are dropped rather than trusted, while a
 * `department` outside the fixed taxonomy is coerced to the catch-all — an
 * unusable type id has no safe reading, an unusable aisle does.
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
        const id = resolveTypeId(result.newType.labelBg, result.newType.unitBase, vocabulary)

        // `resolveTypeId` returns an existing id when the proposal is
        // indistinguishable from a type already in the vocabulary. Appending
        // then would be creating the near-duplicate the reuse requirement
        // forbids, so the offer joins the existing type instead. Its recorded
        // department wins — the proposal's is discarded with the proposal.
        if (!vocabulary.some((t) => t.id === id)) {
          const type: ProductType = {
            id,
            labelBg: result.newType.labelBg,
            labelEn: result.newType.labelEn,
            unitBase: result.newType.unitBase,
            // A department the model invented is coerced rather than rejected: a
            // bad aisle must never cost a comparison group.
            department: toDepartmentId(result.newType.department),
          }
          vocabulary = [...vocabulary, type]
        }

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

  const departmentBlock = DEPARTMENTS.map((id) => `- ${id} — ${DEPARTMENT_LABELS_BG[id]}`).join('\n')

  return `You are assigning Bulgarian supermarket products to a canonical product *type* used to compare prices across retailers.

A type is a generic kind of product with brand and pack size stripped, e.g. "пилешко филе", "кисело мляко", "кашкавал от краве мляко" — not a specific SKU, and not a broad department like "месо" or "млечни продукти".

Never assign a product to a type of a different species, animal source, or fundamentally different ingredient — e.g. chicken is never "свинско месо" (pork), and a plant-based product is never assigned a dairy or meat type — even if the names or pack sizes look superficially similar. When in doubt between two specific, non-overlapping types, prefer proposing a new type over forcing a mismatch.

Existing types:
${vocabularyBlock}

For each numbered product below, either:
- reuse an existing type by its id if one clearly matches this generic kind of product (strongly prefer reuse over creating a near-duplicate type), or
- propose a new type (labelBg, labelEn, unitBase, department) only if none of the existing types fit.

A new type's "department" is the supermarket aisle that kind of product belongs to. It MUST be exactly one id from this fixed list, copied verbatim:
${departmentBlock}

Choose the aisle a Bulgarian shopper would walk to. Use "other" only when none of the named departments genuinely applies — it is a last resort, not a default. Note that "frozen" wins over the food kind for a frozen product, and "alcohol" wins over "drinks" for anything alcoholic.

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
              department: { type: Type.STRING, enum: [...DEPARTMENTS] },
            },
            required: ['labelBg', 'labelEn', 'unitBase', 'department'],
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
