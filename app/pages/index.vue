<script setup lang="ts">
import { computed } from 'vue'
import type { ComparisonGroup } from '../../shared/types/comparison'
import type { DepartmentId } from '../../shared/types/department'
import type { DealsSnapshot, Offer } from '../../shared/types/offer'
import PriceComparisonCard from '../components/PriceComparisonCard.vue'
import ComparisonDetailsModal from '../components/comparison/ComparisonDetailsModal.vue'
import ComparisonToolbar from '../components/comparison/ComparisonToolbar.vue'
import DepartmentChips from '../components/comparison/DepartmentChips.vue'
import { useComparisonFilters } from '../composables/useComparisonFilters'
import { provideOffersByKey } from '../composables/useOffersByKey'

const BATCH_SIZE = 24

const { data: snapshot } = await useFetch<DealsSnapshot>('/api/deals')

const offers = computed<Offer[]>(() => snapshot.value?.offers ?? [])
const comparisons = computed<ComparisonGroup[]>(() => snapshot.value?.comparisons ?? [])
const leafletPages = computed(() => snapshot.value?.leafletPages ?? {})

// Built once for the page rather than once per card. Each card used to build
// its own map over the whole offer list inside a `computed` — ~120k insertions
// per 24-card batch at current data volumes, redone every time the batch grew.
const offersByKey = computed(() => new Map(offers.value.map((offer) => [offer.offerKey, offer])))
provideOffersByKey(offersByKey)

/**
 * A pre-lowercased blob per group: its type label plus its offers' names and
 * brands. Searching product names and brands — not just the generic type label
 * — is what makes search useful, and precomputing keeps filtering at O(groups)
 * per keystroke instead of O(groups × entries).
 */
const searchIndex = computed(() => {
  const index = new Map<string, string>()
  for (const group of comparisons.value) {
    const parts = [group.labelBg]
    for (const entry of group.entries) {
      const offer = offersByKey.value.get(entry.offerKey)
      if (!offer) continue
      parts.push(offer.name)
      if (offer.brand) parts.push(offer.brand)
    }
    index.set(group.groupKey, parts.join(' ').toLowerCase())
  }
  return index
})

const {
  search,
  department,
  retailers,
  sortKey,
  minSavings,
  openGroupKey,
  selectDepartment,
  toggleRetailer,
  setMinSavings,
  clearFilters,
} = useComparisonFilters()

/** Search is applied first and on its own, because the department counts are derived from its result. */
const searchMatched = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return comparisons.value
  return comparisons.value.filter((group) => searchIndex.value.get(group.groupKey)?.includes(query))
})

const departmentCounts = computed(() => {
  const counts: Partial<Record<DepartmentId, number>> = {}
  for (const group of searchMatched.value) {
    counts[group.department] = (counts[group.department] ?? 0) + 1
  }
  return counts
})

const filteredGroups = computed(() => {
  const selectedRetailers = retailers.value
  const threshold = minSavings.value

  const matching = searchMatched.value.filter((group) => {
    if (department.value && group.department !== department.value) return false
    // OR semantics: a group survives when any of its entries is from a selected retailer.
    if (selectedRetailers.length && !group.entries.some((entry) => selectedRetailers.includes(entry.retailer))) {
      return false
    }
    if (threshold > 0 && group.savingsPercentage < threshold) return false
    return true
  })

  const sorted = [...matching]
  if (sortKey.value === 'label') {
    sorted.sort((a, b) => a.labelBg.localeCompare(b.labelBg, 'bg'))
  } else if (sortKey.value === 'unit-price') {
    sorted.sort((a, b) => cheapestUnitPrice(a) - cheapestUnitPrice(b))
  } else {
    sorted.sort((a, b) => b.savingsPercentage - a.savingsPercentage)
  }
  return sorted
})

function cheapestUnitPrice(group: ComparisonGroup): number {
  return Math.min(...group.entries.map((entry) => entry.unitPriceEurCents))
}

const { visibleItems: visibleGroups, hasMore, sentinel } = useIncrementalList(filteredGroups, BATCH_SIZE)

/** Null while the snapshot is still resolving, and for a `g` naming no published group. */
const openGroup = computed(
  () => comparisons.value.find((group) => group.groupKey === openGroupKey.value) ?? null,
)

const generatedAtLabel = computed(() =>
  snapshot.value?.generatedAt ? new Date(snapshot.value.generatedAt).toLocaleString('bg-BG') : null,
)
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-4">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Сравнете цените в магазините</h1>
      <p v-if="generatedAtLabel" class="text-sm text-gray-500 dark:text-gray-400">
        Обновено на {{ generatedAtLabel }}
      </p>
    </header>

    <ComparisonToolbar
      :search="search"
      :sort-key="sortKey"
      :retailers="retailers"
      :min-savings="minSavings"
      :department="department"
      :shown="filteredGroups.length"
      :total="comparisons.length"
      @update:search="search = $event"
      @update:sort-key="sortKey = $event"
      @toggle-retailer="toggleRetailer"
      @set-min-savings="setMinSavings"
      @select-department="selectDepartment"
      @clear-filters="clearFilters"
    />

    <DepartmentChips
      :counts="departmentCounts"
      :total="searchMatched.length"
      :selected="department"
      @select="selectDepartment"
    />

    <!-- Two distinct empty states: nothing published at all, versus a narrowing
         that matched nothing. Reading the first when the second is true is what
         makes a filtered list look broken. -->
    <p v-if="!filteredGroups.length" class="py-8 text-gray-500 dark:text-gray-400">
      {{
        comparisons.length
          ? 'Няма продукти по избраните филтри.'
          : 'В момента няма продукт с оферта в два или повече магазина.'
      }}
    </p>

    <template v-else>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PriceComparisonCard
          v-for="group in visibleGroups"
          :key="group.groupKey"
          :group="group"
          :leaflet-pages="leafletPages"
          @open="openGroupKey = $event"
        />
      </div>

      <div v-if="hasMore" ref="sentinel" class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Зареждане…
      </div>
      <p v-else class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">Това е краят на списъка.</p>
    </template>

    <ComparisonDetailsModal :group="openGroup" :leaflet-pages="leafletPages" @close="openGroupKey = null" />
  </div>
</template>
