<script setup lang="ts">
import type { DealsSnapshot } from '../../shared/types/offer'

const BATCH_SIZE = 24

const { data: snapshot } = await useFetch<DealsSnapshot>('/api/deals')

const search = ref('')
const sortBy = ref<'savings' | 'label'>('savings')

const offers = computed(() => snapshot.value?.offers ?? [])
const comparisons = computed(() => snapshot.value?.comparisons ?? [])

const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase()
  const matching = query ? comparisons.value.filter((group) => group.labelBg.toLowerCase().includes(query)) : comparisons.value

  const sorted = [...matching]
  if (sortBy.value === 'label') {
    sorted.sort((a, b) => a.labelBg.localeCompare(b.labelBg))
  } else {
    sorted.sort((a, b) => b.savingsPercentage - a.savingsPercentage)
  }
  return sorted
})

const { visibleItems: visibleGroups, hasMore, sentinel } = useIncrementalList(filteredGroups, BATCH_SIZE)

const generatedAtLabel = computed(() =>
  snapshot.value?.generatedAt ? new Date(snapshot.value.generatedAt).toLocaleString('bg-BG') : null,
)
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Compare prices across stores</h1>
      <p v-if="generatedAtLabel" class="text-sm text-gray-500 dark:text-gray-400">
        Snapshot last updated {{ generatedAtLabel }}
      </p>
    </header>

    <div
      class="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
    >
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-gray-600 dark:text-gray-300">Search</span>
        <input
          v-model="search"
          type="search"
          placeholder="e.g. кисело мляко"
          class="w-56 rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-gray-600 dark:text-gray-300">Sort by</span>
        <select v-model="sortBy" class="rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800">
          <option value="savings">Biggest savings</option>
          <option value="label">Name</option>
        </select>
      </label>
    </div>

    <p v-if="!filteredGroups.length" class="text-gray-500 dark:text-gray-400">
      No product is currently on offer in two or more stores.
    </p>

    <template v-else>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PriceComparisonCard v-for="group in visibleGroups" :key="group.groupKey" :group="group" :offers="offers" />
      </div>

      <div v-if="hasMore" ref="sentinel" class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Loading more comparisons…
      </div>
      <p v-else class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
        You've reached the end of the list.
      </p>
    </template>
  </div>
</template>
