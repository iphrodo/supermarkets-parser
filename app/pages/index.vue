<script setup lang="ts">
import type { DealsFilterValue } from '../components/DealsFilterBar.vue'
import type { DealsSnapshot } from '../../shared/types/offer'

const BATCH_SIZE = 24

const { data: snapshot } = await useFetch<DealsSnapshot>('/api/deals')

const filter = ref<DealsFilterValue>({ retailer: 'all', category: 'all', maxPriceEurCents: null })

const offers = computed(() => snapshot.value?.offers ?? [])

const categories = computed(() =>
  Array.from(new Set(offers.value.map((offer) => offer.category))).sort((a, b) => a.localeCompare(b)),
)

const filteredOffers = computed(() =>
  offers.value.filter((offer) => {
    if (filter.value.retailer !== 'all' && offer.retailer !== filter.value.retailer) return false
    if (filter.value.category !== 'all' && offer.category !== filter.value.category) return false
    if (filter.value.maxPriceEurCents !== null && offer.priceEurCents > filter.value.maxPriceEurCents) return false
    return true
  }),
)

const visibleCount = ref(BATCH_SIZE)

watch(filteredOffers, () => {
  visibleCount.value = BATCH_SIZE
})

const visibleOffers = computed(() => filteredOffers.value.slice(0, visibleCount.value))

const hasMore = computed(() => visibleCount.value < filteredOffers.value.length)

function loadMore() {
  if (!hasMore.value) return
  visibleCount.value = Math.min(visibleCount.value + BATCH_SIZE, filteredOffers.value.length)
}

const sentinel = useTemplateRef<HTMLElement>('sentinel')
let observer: IntersectionObserver | null = null

function observeSentinel() {
  observer?.disconnect()
  if (!sentinel.value) return
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore()
  })
  observer.observe(sentinel.value)
}

watch(sentinel, observeSentinel)

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})

const generatedAtLabel = computed(() =>
  snapshot.value?.generatedAt ? new Date(snapshot.value.generatedAt).toLocaleString('bg-BG') : null,
)
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">This week's deals</h1>
      <p v-if="generatedAtLabel" class="text-sm text-gray-500 dark:text-gray-400">
        Snapshot last updated {{ generatedAtLabel }}
      </p>
    </header>

    <DealsFilterBar v-model="filter" :categories="categories" class="mb-6" />

    <p v-if="!filteredOffers.length" class="text-gray-500 dark:text-gray-400">No offers match these filters yet.</p>

    <template v-else>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <OfferCard v-for="offer in visibleOffers" :key="offer.offerKey" :offer="offer" />
      </div>

      <div v-if="hasMore" ref="sentinel" class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Loading more offers…
      </div>
      <p v-else class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
        You've reached the end of the list.
      </p>
    </template>
  </div>
</template>
