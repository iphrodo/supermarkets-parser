<script setup lang="ts">
import { computed } from 'vue'
import type { LeafletPage, Offer } from '../../shared/types/offer'
import { LOYALTY_LABELS, MECHANIC_LABELS, RETAILER_LABELS, formatBgn, formatDate, formatEur } from '../utils/format'
import ProductThumb from './ProductThumb.vue'

const props = withDefaults(
  defineProps<{
    offer: Offer
    /** The leaflet page this offer's crop points at, when it has one. */
    page?: LeafletPage | null
  }>(),
  { page: null },
)

const retailerLabel = computed(() => RETAILER_LABELS[props.offer.retailer])
const loyaltyLabel = computed(() => LOYALTY_LABELS[props.offer.loyaltyTier])
const mechanicLabel = computed(() => MECHANIC_LABELS[props.offer.mechanic])
</script>

<template>
  <article
    class="flex gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="h-24 w-24 shrink-0 sm:h-28 sm:w-28">
      <ProductThumb :offer="offer" :page="page" />
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-center justify-between">
        <span
          class="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300"
        >
          {{ retailerLabel }}
        </span>
        <span v-if="offer.discountPercentage" class="text-sm font-semibold text-red-600">
          -{{ offer.discountPercentage }}%
        </span>
      </div>

      <p v-if="offer.brand" class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ offer.brand }}</p>
      <p class="line-clamp-2 min-w-0 break-words text-sm text-gray-700 dark:text-gray-300">{{ offer.name }}</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ offer.unitText }}</p>

      <div class="flex items-baseline gap-2">
        <span class="text-lg font-bold text-gray-900 dark:text-gray-100">{{ formatEur(offer.priceEurCents) }}</span>
        <span v-if="offer.originalPriceEurCents" class="text-sm text-gray-400 line-through">
          {{ formatEur(offer.originalPriceEurCents) }}
        </span>
        <span v-if="offer.priceBgnCents" class="text-xs text-gray-500 dark:text-gray-400">
          ({{ formatBgn(offer.priceBgnCents) }})
        </span>
      </div>

      <div v-if="loyaltyLabel || mechanicLabel" class="flex flex-wrap gap-1">
        <span
          v-if="loyaltyLabel"
          class="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
        >
          {{ loyaltyLabel }}
        </span>
        <span
          v-if="mechanicLabel"
          class="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300"
        >
          {{ mechanicLabel }}
        </span>
      </div>

      <p v-if="offer.purchaseLimit" class="text-xs text-gray-500 dark:text-gray-400">{{ offer.purchaseLimit }}</p>

      <p class="text-xs text-gray-500 dark:text-gray-400">Валидна до {{ formatDate(offer.validUntil) }}</p>

      <div class="flex items-center justify-between text-xs text-gray-400">
        <span>{{ offer.category }}{{ offer.campaign ? ` · ${offer.campaign}` : '' }}</span>
        <a :href="offer.sourceUrl" target="_blank" rel="noopener" class="underline hover:text-gray-600 dark:hover:text-gray-300">
          Източник
        </a>
      </div>
    </div>
  </article>
</template>
