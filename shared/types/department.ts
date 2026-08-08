/**
 * The supermarket departments a canonical product type can belong to.
 *
 * Deliberately a closed set defined here rather than a vocabulary the
 * classifier may extend: the product-type vocabulary is allowed to grow because
 * the model proposing "кисело мляко" as a new type is the feature, but
 * departments are navigation, and a navigation bar that grows a tab whenever the
 * model invents one is not navigation. A value outside this set is coerced to
 * the catch-all by `toDepartmentId` rather than persisted.
 */
export const DEPARTMENTS = [
  'fruit-veg',
  'meat',
  'fish',
  'deli',
  'dairy-eggs',
  'bakery',
  'pantry',
  'sweets-snacks',
  'frozen',
  'drinks',
  'alcohol',
  'household',
  'other',
] as const

export type DepartmentId = (typeof DEPARTMENTS)[number]

/**
 * `other` is a member of the enum rather than the field being nullable, so
 * `DepartmentId` stays total and every `Record<DepartmentId, …>` lookup below
 * resolves without a fallback branch.
 */
export const CATCH_ALL_DEPARTMENT: DepartmentId = 'other'

export const DEPARTMENT_LABELS_BG: Record<DepartmentId, string> = {
  'fruit-veg': 'Плодове и зеленчуци',
  meat: 'Месо',
  fish: 'Риба и морски дарове',
  deli: 'Колбаси и деликатеси',
  'dairy-eggs': 'Мляко, млечни и яйца',
  bakery: 'Хляб и тестени',
  pantry: 'Основни хранителни',
  'sweets-snacks': 'Сладки и солени закуски',
  frozen: 'Замразени',
  drinks: 'Безалкохолни напитки',
  alcohol: 'Алкохол',
  household: 'Домакинство и хигиена',
  other: 'Други',
}

/**
 * Display order for navigation — roughly the order a shopper walks a store,
 * not the order the ids happen to be declared in. The catch-all is last, since
 * "Други" is where a user looks after the named departments have failed them.
 */
export const DEPARTMENT_ORDER: readonly DepartmentId[] = [
  'fruit-veg',
  'bakery',
  'meat',
  'fish',
  'deli',
  'dairy-eggs',
  'frozen',
  'pantry',
  'sweets-snacks',
  'drinks',
  'alcohol',
  'household',
  'other',
]

export const DEPARTMENT_ICONS: Record<DepartmentId, string> = {
  'fruit-veg': '🥦',
  meat: '🥩',
  fish: '🐟',
  deli: '🥓',
  'dairy-eggs': '🥛',
  bakery: '🥖',
  pantry: '🍚',
  'sweets-snacks': '🍫',
  frozen: '🧊',
  drinks: '🥤',
  alcohol: '🍷',
  household: '🧻',
  other: '🛒',
}

const DEPARTMENT_IDS: ReadonlySet<string> = new Set(DEPARTMENTS)

export function isDepartmentId(value: unknown): value is DepartmentId {
  return typeof value === 'string' && DEPARTMENT_IDS.has(value)
}

/**
 * The single coercion point for anything that might not be a department: a
 * value the model invented, and a vocabulary entry persisted before departments
 * existed. Both resolve to the catch-all — an unclassifiable aisle must never
 * cost a comparison group.
 */
export function toDepartmentId(value: unknown): DepartmentId {
  return isDepartmentId(value) ? value : CATCH_ALL_DEPARTMENT
}
