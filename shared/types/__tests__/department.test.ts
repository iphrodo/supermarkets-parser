import { describe, expect, it } from 'vitest'
import {
  CATCH_ALL_DEPARTMENT,
  DEPARTMENTS,
  DEPARTMENT_ICONS,
  DEPARTMENT_LABELS_BG,
  DEPARTMENT_ORDER,
  isDepartmentId,
  toDepartmentId,
} from '../department'

describe('department taxonomy', () => {
  it('gives every department a non-empty Bulgarian label', () => {
    for (const id of DEPARTMENTS) {
      expect(DEPARTMENT_LABELS_BG[id]?.trim()).toBeTruthy()
    }
  })

  it('gives every department an icon', () => {
    for (const id of DEPARTMENTS) {
      expect(DEPARTMENT_ICONS[id]?.trim()).toBeTruthy()
    }
  })

  it('exposes no label or icon for a department outside the taxonomy', () => {
    expect(Object.keys(DEPARTMENT_LABELS_BG).sort()).toEqual([...DEPARTMENTS].sort())
    expect(Object.keys(DEPARTMENT_ICONS).sort()).toEqual([...DEPARTMENTS].sort())
  })

  it('orders every department exactly once, with the catch-all last', () => {
    expect([...DEPARTMENT_ORDER].sort()).toEqual([...DEPARTMENTS].sort())
    expect(new Set(DEPARTMENT_ORDER).size).toBe(DEPARTMENTS.length)
    expect(DEPARTMENT_ORDER[DEPARTMENT_ORDER.length - 1]).toBe(CATCH_ALL_DEPARTMENT)
  })
})

describe('toDepartmentId', () => {
  it('passes a member of the taxonomy through unchanged', () => {
    expect(toDepartmentId('dairy-eggs')).toBe('dairy-eggs')
  })

  it('coerces a value the model invented to the catch-all', () => {
    expect(toDepartmentId('млечни продукти')).toBe(CATCH_ALL_DEPARTMENT)
  })

  it('coerces a vocabulary entry that predates departments to the catch-all', () => {
    expect(toDepartmentId(undefined)).toBe(CATCH_ALL_DEPARTMENT)
    expect(toDepartmentId(null)).toBe(CATCH_ALL_DEPARTMENT)
  })
})

describe('isDepartmentId', () => {
  it('accepts only members of the taxonomy', () => {
    expect(isDepartmentId('frozen')).toBe(true)
    expect(isDepartmentId('Frozen')).toBe(false)
    expect(isDepartmentId(7)).toBe(false)
  })
})
