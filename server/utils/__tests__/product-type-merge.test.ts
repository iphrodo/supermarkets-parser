import { describe, expect, it } from 'vitest'
import type { ProductType, ProductTypeAssignments, ProductTypeVocabulary } from '../kv'
import { mergeDuplicateTypes } from '../product-type-merge'

function makeType(id: string, labelBg: string, overrides: Partial<ProductType> = {}): ProductType {
  return { id, labelBg, labelEn: labelBg, unitBase: 'kg', department: 'meat', ...overrides }
}

/** `n` products all pointing at `typeId`, keyed so keys never collide between calls. */
function assign(typeId: string, n: number): ProductTypeAssignments {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`${typeId}:product-${i}`, typeId]))
}

describe('mergeDuplicateTypes', () => {
  it('collapses a two-type cluster and moves its products onto the survivor', () => {
    const vocabulary: ProductTypeVocabulary = [
      makeType('кисело-мляко', 'кисело мляко'),
      makeType('кисело-мляко-2', 'кисело мляко'),
    ]
    const assignments = { ...assign('кисело-мляко', 17), ...assign('кисело-мляко-2', 2) }

    const result = mergeDuplicateTypes(vocabulary, assignments)

    expect(result.vocabulary.map((t) => t.id)).toEqual(['кисело-мляко'])
    expect(result.merged).toEqual({ 'кисело-мляко-2': 'кисело-мляко' })
    expect(new Set(Object.values(result.assignments))).toEqual(new Set(['кисело-мляко']))
    expect(Object.keys(result.assignments)).toHaveLength(19)
  })

  it('collapses a four-type cluster to one', () => {
    // The shape `свинско месо` has in live data.
    const vocabulary: ProductTypeVocabulary = [
      makeType('свинско-месо', 'свинско месо'),
      makeType('свинско-месо-2', 'свинско месо'),
      makeType('свинско-месо-3', 'свинско месо'),
      makeType('свинско-месо-4', 'свинско месо'),
    ]
    const assignments = {
      ...assign('свинско-месо', 1),
      ...assign('свинско-месо-2', 1),
      ...assign('свинско-месо-3', 1),
      ...assign('свинско-месо-4', 2),
    }

    const result = mergeDuplicateTypes(vocabulary, assignments)

    expect(result.vocabulary).toHaveLength(1)
    expect(result.vocabulary[0]!.id).toBe('свинско-месо-4')
    expect(Object.keys(result.assignments)).toHaveLength(5)
  })

  it('keeps the most-assigned type, not the unsuffixed one', () => {
    const vocabulary: ProductTypeVocabulary = [
      makeType('сладолед', 'сладолед'),
      makeType('сладолед-7', 'сладолед'),
    ]
    const assignments = { ...assign('сладолед', 3), ...assign('сладолед-7', 48) }

    const result = mergeDuplicateTypes(vocabulary, assignments)

    expect(result.vocabulary[0]!.id).toBe('сладолед-7')
    expect(result.merged).toEqual({ сладолед: 'сладолед-7' })
  })

  it('breaks a tie deterministically, whatever order the vocabulary is in', () => {
    const a = makeType('банан-2', 'банан')
    const b = makeType('банан', 'банан')
    const assignments = { ...assign('банан', 4), ...assign('банан-2', 4) }

    const forwards = mergeDuplicateTypes([a, b], assignments)
    const backwards = mergeDuplicateTypes([b, a], assignments)

    // Shorter id wins the tie.
    expect(forwards.vocabulary[0]!.id).toBe('банан')
    expect(backwards.vocabulary[0]!.id).toBe('банан')
  })

  it('does not merge types that share a label but not a base unit', () => {
    // Merging these would produce a type whose own `l` offers are then excluded
    // from it by the base-unit rule — a duplicate replaced by a broken group.
    const vocabulary: ProductTypeVocabulary = [
      makeType('сладолед', 'сладолед', { unitBase: 'kg' }),
      makeType('сладолед-2', 'сладолед', { unitBase: 'l' }),
    ]

    const result = mergeDuplicateTypes(vocabulary, assign('сладолед', 1))

    expect(result.vocabulary).toHaveLength(2)
    expect(result.merged).toEqual({})
  })

  it('leaves labels that merely resemble one another alone', () => {
    const vocabulary: ProductTypeVocabulary = [
      makeType('свинско-месо', 'свинско месо'),
      makeType('свинско-месо-котлет', 'свинско месо котлет'),
    ]

    const result = mergeDuplicateTypes(vocabulary, assign('свинско-месо', 1))

    expect(result.vocabulary).toHaveLength(2)
    expect(result.merged).toEqual({})
  })

  it('treats casing and stray whitespace as the same label', () => {
    const vocabulary: ProductTypeVocabulary = [
      makeType('кашкавал', 'Кашкавал'),
      makeType('кашкавал-2', '  кашкавал  '),
    ]

    const result = mergeDuplicateTypes(vocabulary, assign('кашкавал', 3))

    expect(result.vocabulary).toHaveLength(1)
  })

  it('returns its inputs untouched when nothing is duplicated', () => {
    const vocabulary: ProductTypeVocabulary = [makeType('кашкавал', 'кашкавал'), makeType('банан', 'банан')]
    const assignments = assign('кашкавал', 2)

    const result = mergeDuplicateTypes(vocabulary, assignments)

    expect(result.vocabulary).toBe(vocabulary)
    expect(result.assignments).toBe(assignments)
    expect(result.merged).toEqual({})
  })

  it('never emits an assignment pointing at a type absent from the returned vocabulary', () => {
    const vocabulary: ProductTypeVocabulary = [
      makeType('кисело-мляко', 'кисело мляко'),
      makeType('кисело-мляко-2', 'кисело мляко'),
    ]
    const assignments = {
      ...assign('кисело-мляко', 2),
      ...assign('кисело-мляко-2', 1),
      // Already dangling before the merge — a product whose type is long gone.
      'orphan:product-0': 'изчезнал-тип',
    }

    const result = mergeDuplicateTypes(vocabulary, assignments)

    const ids = new Set(result.vocabulary.map((t) => t.id))
    for (const typeId of Object.values(result.assignments)) expect(ids.has(typeId)).toBe(true)
    expect(result.assignments['orphan:product-0']).toBeUndefined()
  })
})
