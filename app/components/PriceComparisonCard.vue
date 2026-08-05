<script setup lang="ts">
import { computed } from 'vue'
import type { ComparisonGroup, UnitBase } from '../../shared/types/comparison'
import type { Offer, Retailer } from '../../shared/types/offer'

const props = defineProps<{ group: ComparisonGroup; offers: Offer[] }>()

const RETAILER_LABELS: Record<Retailer, string> = {
  kaufland: 'Kaufland',
  lidl: 'Lidl',
  billa: 'Billa',
}

const UNIT_SUFFIX: Record<UnitBase, string> = {
  kg: '/кг',
  l: '/л',
  pc: '/бр',
}

const offersByKey = computed(() => new Map(props.offers.map((offer) => [offer.offerKey, offer])))

const rows = computed(() =>
  props.group.entries
    .map((entry) => ({ entry, offer: offersByKey.value.get(entry.offerKey) ?? null }))
    .filter((row): row is { entry: (typeof props.group.entries)[number]; offer: Offer } => row.offer !== null),
)

const savingsLabel = computed(() => `${Math.round(props.group.savingsPercentage * 100)}%`)

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}
</script>

<template>
  <article
    class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <header class="flex items-center justify-between gap-2">
      <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ group.labelBg }}</h3>
      <span
        v-if="group.savingsPercentage > 0"
        class="whitespace-nowrap rounded bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-300"
      >
        Save up to {{ savingsLabel }}
      </span>
    </header>

    <ul class="flex flex-col gap-2">
      <li
        v-for="row in rows"
        :key="row.entry.offerKey"
        class="flex items-center justify-between gap-3 rounded border p-2 text-sm"
        :class="
          row.entry.isCheapest
            ? 'border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950'
            : 'border-gray-100 dark:border-gray-800'
        "
      >
        <div class="flex flex-col">
          <span class="font-medium text-gray-900 dark:text-gray-100">
            {{ RETAILER_LABELS[row.entry.retailer] }}
            <span
              v-if="row.entry.isCheapest"
              class="ml-1 rounded bg-green-600 px-1.5 py-0.5 text-xs font-semibold text-white"
            >
              Cheapest
            </span>
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ row.offer.name }} · {{ row.offer.unitText }}</span>
        </div>

        <div class="flex flex-col items-end">
          <span class="font-semibold text-gray-900 dark:text-gray-100">
            {{ formatCents(row.entry.unitPriceEurCents) }} € {{ UNIT_SUFFIX[group.unitBase] }}
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatCents(row.entry.priceEurCents) }} €</span>
        </div>
      </li>
    </ul>
  </article>
</template>
