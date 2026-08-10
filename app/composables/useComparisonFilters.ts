import { computed, onMounted, ref, watch } from 'vue'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { isDepartmentId, type DepartmentId } from '#shared/types/department'
import type { Retailer } from '../../shared/types/offer'

export const SORT_KEYS = ['savings', 'unit-price', 'label'] as const
export type SortKey = (typeof SORT_KEYS)[number]

export const DEFAULT_SORT: SortKey = 'savings'

/**
 * Discrete rather than a slider: these match how people actually think about a
 * saving ("at least a fifth off"), are easier to hit on touch, and do not invite
 * fiddling for a precision the underlying data cannot support.
 */
export const MIN_SAVINGS_STEPS = [0.1, 0.2, 0.3] as const

const RETAILERS: readonly Retailer[] = ['kaufland', 'lidl', 'billa', 'bulmag']

/** Long enough that typing does not spray history/URL writes, short enough that a copied URL is current. */
const SEARCH_DEBOUNCE_MS = 300

function firstValue(value: LocationQuery[string]): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

function sameQuery(a: LocationQueryRaw, b: LocationQuery): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => String(a[key]) === String(firstValue(b[key] ?? null) ?? ''))
}

/**
 * Owns the comparison view's narrowing, ordering, and open details view, and
 * keeps them in the URL so a view a user reaches is a view they can share.
 *
 * The URL is read on the client only. `/` is served with `isr: 1800`, and
 * initializing from `route.query` during server rendering would fragment that
 * cache across every distinct query string and invite hydration mismatches. So
 * server rendering always emits the default, unfiltered view and the client
 * applies the URL state after mount — at the cost of a brief flash of the
 * unfiltered list when opening a shared link.
 */
export function useComparisonFilters() {
  const route = useRoute()
  const router = useRouter()

  const search = ref('')
  /** The debounced mirror of `search`: filtering reacts immediately, the URL does not. */
  const searchInUrl = ref('')
  const department = ref<DepartmentId | null>(null)
  const retailers = ref<Retailer[]>([])
  const sortKey = ref<SortKey>(DEFAULT_SORT)
  const minSavings = ref(0)
  const openGroupKey = ref<string | null>(null)

  /** Until the client has read the URL, nothing writes back to it. */
  const hydrated = ref(false)

  function toQuery(): LocationQueryRaw {
    const query: LocationQueryRaw = {}
    // Defaults are omitted so an unnarrowed view keeps a clean address.
    if (searchInUrl.value) query.q = searchInUrl.value
    if (department.value) query.d = department.value
    if (retailers.value.length) query.r = retailers.value.join(',')
    if (sortKey.value !== DEFAULT_SORT) query.s = sortKey.value
    if (minSavings.value > 0) query.min = String(Math.round(minSavings.value * 100))
    if (openGroupKey.value) query.g = openGroupKey.value
    return query
  }

  function applyQuery(query: LocationQuery): void {
    const q = firstValue(query.q ?? null) ?? ''
    search.value = q
    searchInUrl.value = q

    const d = firstValue(query.d ?? null)
    department.value = isDepartmentId(d) ? d : null

    const r = firstValue(query.r ?? null)
    retailers.value = r ? r.split(',').filter((value): value is Retailer => RETAILERS.includes(value as Retailer)) : []

    const s = firstValue(query.s ?? null)
    sortKey.value = SORT_KEYS.includes(s as SortKey) ? (s as SortKey) : DEFAULT_SORT

    const min = Number(firstValue(query.min ?? null))
    minSavings.value = Number.isFinite(min) && min > 0 ? min / 100 : 0

    openGroupKey.value = firstValue(query.g ?? null)
  }

  onMounted(() => {
    applyQuery(route.query)
    hydrated.value = true
  })

  let searchTimer: ReturnType<typeof setTimeout> | null = null
  watch(search, (value) => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      searchInUrl.value = value
    }, SEARCH_DEBOUNCE_MS)
  })

  // Filter changes replace, so the history does not fill with intermediate
  // states; opening the details view pushes, so Back closes it and leaves the
  // narrowing intact.
  function write(mode: 'replace' | 'push'): void {
    if (!hydrated.value) return
    const query = toQuery()
    if (sameQuery(query, route.query)) return
    void router[mode]({ query })
  }

  watch([searchInUrl, department, retailers, sortKey, minSavings], () => write('replace'), { deep: true })
  watch(openGroupKey, () => write('push'))

  // Back/forward changes the URL without touching the refs, so the state has to
  // follow the route as well as drive it. The equality guard on both sides keeps
  // this from ping-ponging.
  watch(
    () => route.query,
    (query) => {
      if (!hydrated.value) return
      if (sameQuery(toQuery(), query)) return
      applyQuery(query)
    },
  )

  const activeFilterCount = computed(
    () =>
      (search.value ? 1 : 0) +
      (department.value ? 1 : 0) +
      retailers.value.length +
      (minSavings.value > 0 ? 1 : 0),
  )

  const hasActiveFilters = computed(() => activeFilterCount.value > 0)

  function toggleRetailer(retailer: Retailer): void {
    retailers.value = retailers.value.includes(retailer)
      ? retailers.value.filter((value) => value !== retailer)
      : [...retailers.value, retailer]
  }

  /** Selecting the active department clears it, so the chip bar needs no separate "all" affordance beyond its leading chip. */
  function selectDepartment(next: DepartmentId | null): void {
    department.value = department.value === next ? null : next
  }

  function setMinSavings(next: number): void {
    minSavings.value = minSavings.value === next ? 0 : next
  }

  function clearFilters(): void {
    search.value = ''
    searchInUrl.value = ''
    department.value = null
    retailers.value = []
    minSavings.value = 0
  }

  return {
    search,
    department,
    retailers,
    sortKey,
    minSavings,
    openGroupKey,
    activeFilterCount,
    hasActiveFilters,
    toggleRetailer,
    selectDepartment,
    setMinSavings,
    clearFilters,
  }
}
