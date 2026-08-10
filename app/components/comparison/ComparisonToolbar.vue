<script setup lang="ts">
import { computed, ref } from 'vue'
import { DEPARTMENT_LABELS_BG, type DepartmentId } from '#shared/types/department'
import type { Retailer } from '../../../shared/types/offer'
import { MIN_SAVINGS_STEPS, SORT_KEYS, type SortKey } from '../../composables/useComparisonFilters'
import { RETAILER_LABELS, pluralizeProducts } from '../../utils/format'

const props = defineProps<{
  search: string
  sortKey: SortKey
  retailers: Retailer[]
  minSavings: number
  department: DepartmentId | null
  shown: number
  total: number
}>()

const emit = defineEmits<{
  'update:search': [string]
  'update:sortKey': [SortKey]
  toggleRetailer: [Retailer]
  setMinSavings: [number]
  selectDepartment: [DepartmentId | null]
  clearFilters: []
}>()

const SORT_LABELS: Record<SortKey, string> = {
  savings: 'Най-голяма отстъпка',
  'unit-price': 'Най-ниска цена за единица',
  label: 'По име',
}

const ALL_RETAILERS: readonly Retailer[] = ['kaufland', 'lidl', 'billa', 'bulmag']

/** Below `sm` everything except search collapses behind this, so the sticky header does not eat the first card. */
const sheetOpen = ref(false)

function percentLabel(fraction: number): string {
  return `${Math.round(fraction * 100)}% +`
}

/**
 * One removable chip per active narrowing. Without this a short result list
 * looks broken rather than filtered — it is the single thing that makes the
 * difference legible.
 */
const appliedFilters = computed(() => {
  const applied: { key: string; label: string; clear: () => void }[] = []

  if (props.search) {
    applied.push({ key: 'q', label: `„${props.search}“`, clear: () => emit('update:search', '') })
  }
  if (props.department) {
    applied.push({
      key: 'd',
      label: DEPARTMENT_LABELS_BG[props.department],
      clear: () => emit('selectDepartment', null),
    })
  }
  for (const retailer of props.retailers) {
    applied.push({
      key: `r-${retailer}`,
      label: RETAILER_LABELS[retailer],
      clear: () => emit('toggleRetailer', retailer),
    })
  }
  if (props.minSavings > 0) {
    applied.push({
      key: 'min',
      label: `Отстъпка ${percentLabel(props.minSavings)}`,
      clear: () => emit('setMinSavings', props.minSavings),
    })
  }

  return applied
})
</script>

<template>
  <div class="sticky top-0 z-20 -mx-4 mb-4 bg-gray-50/95 px-4 py-3 backdrop-blur dark:bg-gray-950/95">
    <div class="flex items-center gap-2">
      <input
        :value="search"
        type="search"
        placeholder="Търсене на продукт или марка"
        aria-label="Търсене"
        class="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />

      <button
        type="button"
        class="shrink-0 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 sm:hidden"
        :aria-expanded="sheetOpen"
        @click="sheetOpen = true"
      >
        Филтри
      </button>

      <label class="hidden shrink-0 items-center gap-2 text-sm sm:flex">
        <span class="text-gray-600 dark:text-gray-300">Подреди</span>
        <select
          :value="sortKey"
          aria-label="Подреди"
          class="rounded border border-gray-300 px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          @change="emit('update:sortKey', ($event.target as HTMLSelectElement).value as SortKey)"
        >
          <option v-for="key in SORT_KEYS" :key="key" :value="key">{{ SORT_LABELS[key] }}</option>
        </select>
      </label>
    </div>

    <div class="mt-3 hidden flex-wrap items-center gap-2 sm:flex">
      <span class="text-sm text-gray-600 dark:text-gray-300">Магазин</span>
      <button
        v-for="retailer in ALL_RETAILERS"
        :key="retailer"
        type="button"
        class="rounded-full border px-3 py-1 text-sm"
        :class="
          retailers.includes(retailer)
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
        "
        :aria-pressed="retailers.includes(retailer)"
        @click="emit('toggleRetailer', retailer)"
      >
        {{ RETAILER_LABELS[retailer] }}
      </button>

      <span class="ml-2 text-sm text-gray-600 dark:text-gray-300">Отстъпка</span>
      <button
        v-for="step in MIN_SAVINGS_STEPS"
        :key="step"
        type="button"
        class="rounded-full border px-3 py-1 text-sm"
        :class="
          minSavings === step
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
        "
        :aria-pressed="minSavings === step"
        @click="emit('setMinSavings', step)"
      >
        {{ percentLabel(step) }}
      </button>
    </div>

    <!-- Visible at every width: a filtered list must always explain itself. -->
    <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-gray-500 dark:text-gray-400">
        Показани {{ shown }} от {{ total }} {{ pluralizeProducts(total) }}
      </span>

      <template v-if="appliedFilters.length">
        <button
          v-for="filter in appliedFilters"
          :key="filter.key"
          type="button"
          class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          @click="filter.clear()"
        >
          {{ filter.label }}
          <span aria-hidden="true">×</span>
          <span class="sr-only">Премахни филтъра</span>
        </button>

        <button
          type="button"
          class="text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          @click="emit('clearFilters')"
        >
          Изчисти всички
        </button>
      </template>
    </div>

    <div v-if="sheetOpen" class="fixed inset-0 z-30 sm:hidden">
      <div class="absolute inset-0 bg-black/40" @click="sheetOpen = false" />
      <div
        class="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-xl bg-white p-4 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-label="Филтри"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">Филтри</h2>
          <button type="button" class="text-sm text-gray-500" @click="sheetOpen = false">Затвори</button>
        </div>

        <label class="mb-4 flex flex-col gap-1 text-sm">
          <span class="text-gray-600 dark:text-gray-300">Подреди</span>
          <select
            :value="sortKey"
            class="rounded border border-gray-300 px-2 py-2 dark:border-gray-600 dark:bg-gray-800"
            @change="emit('update:sortKey', ($event.target as HTMLSelectElement).value as SortKey)"
          >
            <option v-for="key in SORT_KEYS" :key="key" :value="key">{{ SORT_LABELS[key] }}</option>
          </select>
        </label>

        <p class="mb-2 text-sm text-gray-600 dark:text-gray-300">Магазин</p>
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="retailer in ALL_RETAILERS"
            :key="retailer"
            type="button"
            class="rounded-full border px-3 py-1 text-sm"
            :class="
              retailers.includes(retailer)
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300'
            "
            :aria-pressed="retailers.includes(retailer)"
            @click="emit('toggleRetailer', retailer)"
          >
            {{ RETAILER_LABELS[retailer] }}
          </button>
        </div>

        <p class="mb-2 text-sm text-gray-600 dark:text-gray-300">Отстъпка</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="step in MIN_SAVINGS_STEPS"
            :key="step"
            type="button"
            class="rounded-full border px-3 py-1 text-sm"
            :class="
              minSavings === step
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300'
            "
            :aria-pressed="minSavings === step"
            @click="emit('setMinSavings', step)"
          >
            {{ percentLabel(step) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
