<script setup lang="ts">
import type { Retailer } from '../../shared/types/offer'

export interface DealsFilterValue {
  retailer: Retailer | 'all'
  category: string | 'all'
  maxPriceEurCents: number | null
}

const props = defineProps<{
  modelValue: DealsFilterValue
  categories: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [DealsFilterValue] }>()

function update(partial: Partial<DealsFilterValue>) {
  emit('update:modelValue', { ...props.modelValue, ...partial })
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-gray-600 dark:text-gray-300">Retailer</span>
      <select
        class="rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        :value="modelValue.retailer"
        @change="update({ retailer: ($event.target as HTMLSelectElement).value as DealsFilterValue['retailer'] })"
      >
        <option value="all">All retailers</option>
        <option value="kaufland">Kaufland</option>
        <option value="lidl">Lidl</option>
        <option value="billa">Billa</option>
      </select>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-gray-600 dark:text-gray-300">Category</span>
      <select
        class="rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        :value="modelValue.category"
        @change="update({ category: ($event.target as HTMLSelectElement).value })"
      >
        <option value="all">All categories</option>
        <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
      </select>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-gray-600 dark:text-gray-300">Max price (€)</span>
      <input
        type="number"
        min="0"
        step="0.5"
        class="w-28 rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        :value="modelValue.maxPriceEurCents === null ? '' : modelValue.maxPriceEurCents / 100"
        @input="
          update({
            maxPriceEurCents: ($event.target as HTMLInputElement).value
              ? Math.round(Number(($event.target as HTMLInputElement).value) * 100)
              : null,
          })
        "
      />
    </label>
  </div>
</template>
