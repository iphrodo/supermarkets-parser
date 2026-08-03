<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Offer } from '../../shared/types/offer'

const props = defineProps<{ offer: Offer }>()

const imageLoadFailed = ref(false)

const showImage = computed(() => Boolean(props.offer.imageUrl) && !imageLoadFailed.value)

const RETAILER_LABELS: Record<Offer['retailer'], string> = {
  kaufland: 'Kaufland',
  lidl: 'Lidl',
  billa: 'Billa',
}

const retailerLabel = computed(() => RETAILER_LABELS[props.offer.retailer])

const loyaltyLabel = computed(() => {
  switch (props.offer.loyaltyTier) {
    case 'kaufland_card_xtra':
      return 'Kaufland Card Xtra'
    case 'kaufland_card':
      return 'Kaufland Card'
    default:
      return null
  }
})

const mechanicLabel = computed(() => {
  switch (props.offer.mechanic) {
    case 'buy_1_get_1_free':
      return '1+1 free'
    case 'buy_2_get_1_free':
      return '2+1 free'
    default:
      return null
  }
})

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}
</script>

<template>
  <article
    class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
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

    <img
      v-if="showImage"
      :src="offer.imageUrl!"
      :alt="offer.name"
      class="h-32 w-full rounded object-contain"
      loading="lazy"
      @error="imageLoadFailed = true"
    />

    <div>
      <p v-if="offer.brand" class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ offer.brand }}</p>
      <p class="text-sm text-gray-700 dark:text-gray-300">{{ offer.name }}</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ offer.unitText }}</p>
    </div>

    <div class="flex items-baseline gap-2">
      <span class="text-lg font-bold text-gray-900 dark:text-gray-100">{{ formatCents(offer.priceEurCents) }} €</span>
      <span v-if="offer.originalPriceEurCents" class="text-sm text-gray-400 line-through">
        {{ formatCents(offer.originalPriceEurCents) }} €
      </span>
      <span v-if="offer.priceBgnCents" class="text-xs text-gray-500 dark:text-gray-400">
        ({{ formatCents(offer.priceBgnCents) }} ЛВ.)
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

    <p class="text-xs text-gray-500 dark:text-gray-400">Valid until {{ formatDate(offer.validUntil) }}</p>

    <div class="mt-auto flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-400 dark:border-gray-800">
      <span>{{ offer.category }}{{ offer.campaign ? ` · ${offer.campaign}` : '' }}</span>
      <a :href="offer.sourceUrl" target="_blank" rel="noopener" class="underline hover:text-gray-600 dark:hover:text-gray-300">
        Source
      </a>
    </div>
  </article>
</template>
