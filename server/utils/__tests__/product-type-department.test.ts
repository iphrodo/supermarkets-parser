import { describe, expect, it, vi } from 'vitest'
import type { ProductTypeVocabulary } from '../kv'
import type {
  BackfillDepartmentsDeps,
  DepartmentAssignmentItem,
  DepartmentAssignmentResult,
} from '../product-type-department'
import { backfillDepartments } from '../product-type-department'

function makeType(id: string, overrides: Partial<ProductTypeVocabulary[number]> = {}): ProductTypeVocabulary[number] {
  return { id, labelBg: `Тип ${id}`, labelEn: `Type ${id}`, unitBase: 'kg', ...overrides }
}

function makeDeps(overrides: Partial<BackfillDepartmentsDeps> = {}): BackfillDepartmentsDeps & {
  written: ProductTypeVocabulary[]
} {
  const written: ProductTypeVocabulary[] = []
  return {
    assignDepartments: vi.fn(async () => []),
    writeVocabulary: async (vocabulary) => {
      written.push(vocabulary)
    },
    logError: () => {},
    ...overrides,
    written,
  }
}

/** Assigns every item the same department, so a test can assert on placement rather than on which aisle was picked. */
function assignAll(department: string) {
  return vi.fn(async (items: DepartmentAssignmentItem[]): Promise<DepartmentAssignmentResult[]> =>
    items.map((item) => ({ index: item.index, department: department as DepartmentAssignmentResult['department'] })),
  )
}

describe('backfillDepartments', () => {
  it('issues no model call when every entry already has a department', async () => {
    const assignDepartments = assignAll('meat')
    const deps = makeDeps({ assignDepartments })
    const vocabulary = [makeType('a', { department: 'meat' }), makeType('b', { department: 'other' })]

    const result = await backfillDepartments(vocabulary, deps)

    expect(assignDepartments).not.toHaveBeenCalled()
    expect(deps.written).toHaveLength(0)
    expect(result).toBe(vocabulary)
  })

  it('batches only the entries that lack a department', async () => {
    const assignDepartments = assignAll('dairy-eggs')
    const deps = makeDeps({ assignDepartments })
    const vocabulary = [makeType('a', { department: 'meat' }), makeType('b'), makeType('c')]

    const result = await backfillDepartments(vocabulary, deps)

    expect(assignDepartments).toHaveBeenCalledTimes(1)
    expect(assignDepartments.mock.calls[0]![0].map((item) => item.labelBg)).toEqual(['Тип b', 'Тип c'])
    expect(result.map((type) => type.department)).toEqual(['meat', 'dairy-eggs', 'dairy-eggs'])
  })

  it('persists the updated vocabulary', async () => {
    const deps = makeDeps({ assignDepartments: assignAll('bakery') })

    await backfillDepartments([makeType('a')], deps)

    expect(deps.written).toHaveLength(1)
    expect(deps.written[0]![0]!.department).toBe('bakery')
  })

  it('coerces a department outside the taxonomy to the catch-all', async () => {
    const deps = makeDeps({ assignDepartments: assignAll('млечни') })

    const result = await backfillDepartments([makeType('a')], deps)

    expect(result[0]!.department).toBe('other')
  })

  it('leaves a failed batch for the next run instead of aborting the whole backfill', async () => {
    // 41 entries is two batches: the first fails, the second must still land.
    const pending = Array.from({ length: 41 }, (_, i) => makeType(`t-${i}`))
    let call = 0
    const assignDepartments = vi.fn(async (items: DepartmentAssignmentItem[]): Promise<DepartmentAssignmentResult[]> => {
      call += 1
      if (call === 1) throw new Error('model unavailable')
      return items.map((item) => ({ index: item.index, department: 'pantry' }))
    })
    const logError = vi.fn()
    const deps = makeDeps({ assignDepartments, logError })

    const result = await backfillDepartments(pending, deps)

    expect(assignDepartments).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledOnce()
    expect(result.slice(0, 40).every((type) => type.department === undefined)).toBe(true)
    expect(result[40]!.department).toBe('pantry')
  })

  it('writes nothing when every batch fails, so the next run retries the same entries', async () => {
    const assignDepartments = vi.fn(async (): Promise<DepartmentAssignmentResult[]> => {
      throw new Error('model unavailable')
    })
    const deps = makeDeps({ assignDepartments })
    const vocabulary = [makeType('a')]

    const result = await backfillDepartments(vocabulary, deps)

    expect(deps.written).toHaveLength(0)
    expect(result).toBe(vocabulary)
    expect(result[0]!.department).toBeUndefined()
  })

  it('does not touch a type the model returned an out-of-range index for', async () => {
    const assignDepartments = vi.fn(async (): Promise<DepartmentAssignmentResult[]> => [
      { index: 99, department: 'frozen' },
    ])
    const deps = makeDeps({ assignDepartments })

    const result = await backfillDepartments([makeType('a')], deps)

    expect(result[0]!.department).toBeUndefined()
    expect(deps.written).toHaveLength(0)
  })
})
