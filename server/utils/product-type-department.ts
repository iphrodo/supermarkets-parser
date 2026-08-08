import { Type } from '@google/genai'
import { DEPARTMENTS, DEPARTMENT_LABELS_BG, toDepartmentId, type DepartmentId } from '../../shared/types/department'
import { writeProductTypeVocabulary, type ProductTypeVocabulary } from './kv'
import { extractStructuredData } from './scrapers/vision-extraction'

/** Matches `classifyOffers`, for the same reason: it amortizes the instruction preamble without approaching an output limit. */
const BATCH_SIZE = 40

export interface DepartmentAssignmentItem {
  index: number
  labelBg: string
  labelEn: string
}

export interface DepartmentAssignmentResult {
  index: number
  department: DepartmentId
}

export interface BackfillDepartmentsDeps {
  assignDepartments: (items: DepartmentAssignmentItem[]) => Promise<DepartmentAssignmentResult[]>
  writeVocabulary: (vocabulary: ProductTypeVocabulary) => Promise<void>
  logError?: (message: string, error: unknown) => void
}

/**
 * Gives a department to canonical types persisted before departments existed.
 *
 * This runs at the *vocabulary* level, not per product, and that is the only
 * workable level: type assignments are cached forever per `productKey`, so a
 * product classified in an earlier week is never re-classified and a
 * per-product backfill would reach almost nothing.
 *
 * Idempotent by construction — an entry is work only while its `department` key
 * is absent, so once every entry has one this issues no model calls at all and
 * costs a single array scan on every subsequent sync.
 */
export async function backfillDepartments(
  vocabulary: ProductTypeVocabulary,
  deps: BackfillDepartmentsDeps,
): Promise<ProductTypeVocabulary> {
  const log = deps.logError ?? ((message: string, error: unknown) => console.error(message, error))

  const pending = vocabulary.filter((type) => type.department === undefined)
  if (!pending.length) return vocabulary

  const departmentById = new Map<string, DepartmentId>()

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE)
    const items: DepartmentAssignmentItem[] = batch.map((type, index) => ({
      index,
      labelBg: type.labelBg,
      labelEn: type.labelEn,
    }))

    let results: DepartmentAssignmentResult[]
    try {
      results = await deps.assignDepartments(items)
    } catch (error) {
      // A failed batch leaves its entries without a department, so the next
      // sync picks up exactly those again. Aborting the whole backfill would
      // punish the batches that did succeed.
      log('Department backfill batch failed', error)
      continue
    }

    for (const result of results) {
      const type = batch[result.index]
      if (!type) continue
      departmentById.set(type.id, toDepartmentId(result.department))
    }
  }

  if (!departmentById.size) return vocabulary

  const updated: ProductTypeVocabulary = vocabulary.map((type) => {
    const department = departmentById.get(type.id)
    return department && type.department === undefined ? { ...type, department } : type
  })

  await deps.writeVocabulary(updated)

  return updated
}

function buildBackfillPrompt(items: DepartmentAssignmentItem[]): string {
  const departmentBlock = DEPARTMENTS.map((id) => `- ${id} — ${DEPARTMENT_LABELS_BG[id]}`).join('\n')
  const itemsBlock = items.map((item) => `${item.index}. ${item.labelBg} (${item.labelEn})`).join('\n')

  return `You are assigning each of the following generic Bulgarian supermarket product types to the department (aisle) it belongs to.

Departments — use exactly one id from this list, copied verbatim:
${departmentBlock}

Choose the aisle a Bulgarian shopper would walk to for that kind of product. Use "other" only when none of the named departments genuinely applies — it is a last resort, not a default. Note that "frozen" wins over the food kind for a frozen product, and "alcohol" wins over "drinks" for anything alcoholic.

Return one result per product type. Each result's "index" MUST exactly match the number of the type it describes below.

Product types:
${itemsBlock}`
}

const BACKFILL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          department: { type: Type.STRING, enum: [...DEPARTMENTS] },
        },
        required: ['index', 'department'],
      },
    },
  },
  required: ['items'],
} as const

/** Default `assignDepartments`, wired to the real Gemini text call. */
async function assignDepartmentsWithModel(items: DepartmentAssignmentItem[]): Promise<DepartmentAssignmentResult[]> {
  const parsed = await extractStructuredData<{ items?: DepartmentAssignmentResult[] }>(
    buildBackfillPrompt(items),
    BACKFILL_RESPONSE_SCHEMA,
  )
  return parsed.items ?? []
}

/** Wires `backfillDepartments` to the real KV store and model; the production default used by `runDailySync`. */
export function defaultBackfillDepartmentsDeps(): BackfillDepartmentsDeps {
  return {
    assignDepartments: assignDepartmentsWithModel,
    writeVocabulary: writeProductTypeVocabulary,
  }
}
