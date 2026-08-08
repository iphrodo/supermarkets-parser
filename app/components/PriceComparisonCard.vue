<script setup lang="ts">
import { computed } from 'vue'
import type { ComparisonGroup } from '../../shared/types/comparison'
import type { LeafletPage, Offer } from '../../shared/types/offer'
import { useOffersByKey } from '../composables/useOffersByKey'
import { RETAILER_LABELS, formatEur, formatUnitPrice } from '../utils/format'
import { resolveHeroOffer } from '../utils/hero-image'
import DepartmentPlaceholder from './DepartmentPlaceholder.vue'
import ProductThumb from './ProductThumb.vue'

const props = defineProps<{
  group: ComparisonGroup
  /** The snapshot's page registry, needed to resolve a hero crop and to render it. */
  leafletPages: Record<string, LeafletPage>
}>()

const emit = defineEmits<{ open: [string] }>()

// Injected rather than passed: the lookup is built once for the whole page, and
// the details view needs the same one from outside the card tree.
const offersByKey = useOffersByKey()

interface Row {
  offerKey: string
  retailer: string
  offer: Offer
  unitPriceEurCents: number
  priceEurCents: number
  isCheapest: boolean
}

/** Entries already arrive sorted cheapest-first from the comparison builder. */
const rows = computed<Row[]>(() =>
  props.group.entries.flatMap((entry) => {
    const offer = offersByKey.value.get(entry.offerKey)
    if (!offer) return []
    return [
      {
        offerKey: entry.offerKey,
        retailer: RETAILER_LABELS[entry.retailer],
        offer,
        unitPriceEurCents: entry.unitPriceEurCents,
        priceEurCents: entry.priceEurCents,
        isCheapest: entry.isCheapest,
      },
    ]
  }),
)

const cheapest = computed(() => rows.value.find((row) => row.isCheapest) ?? rows.value[0] ?? null)
const others = computed(() => rows.value.filter((row) => row !== cheapest.value))

const heroOffer = computed(() => resolveHeroOffer(props.group, offersByKey.value, props.leafletPages))
const heroPage = computed(() => {
  const pageId = heroOffer.value?.imageCrop?.pageId
  return pageId ? (props.leafletPages[pageId] ?? null) : null
})

/**
 * Both figures, because either alone misleads: a percentage flatters a cheap
 * item (40% off €0.60) and an absolute amount flatters an expensive one. The
 * absolute delta is the spread between the group's most and least expensive
 * per-unit prices, so no schema change is needed.
 */
const savings = computed(() => {
  if (props.group.savingsPercentage <= 0 || rows.value.length < 2) return null
  const prices = rows.value.map((row) => row.unitPriceEurCents)
  return {
    percentage: Math.round(props.group.savingsPercentage * 100),
    absolute: Math.max(...prices) - Math.min(...prices),
  }
})

function difference(row: Row): string {
  const delta = row.unitPriceEurCents - (cheapest.value?.unitPriceEurCents ?? 0)
  return `+${formatUnitPrice(delta, props.group.unitBase)}`
}
</script>

<template>
  <article
    class="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-gray-300 hover:shadow dark:border-gray-700 dark:bg-gray-900"
    role="button"
    tabindex="0"
    :aria-label="`Детайли за ${group.labelBg}`"
    @click="emit('open', group.groupKey)"
    @keydown.enter.prevent="emit('open', group.groupKey)"
    @keydown.space.prevent="emit('open', group.groupKey)"
  >
    <div class="h-24 w-24 shrink-0 sm:h-28 sm:w-28">
      <ProductThumb v-if="heroOffer" :offer="heroOffer" :page="heroPage" />
      <DepartmentPlaceholder v-else class="rounded" />
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-start justify-between gap-2">
        <h3 class="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{{ group.labelBg }}</h3>
        <span
          v-if="savings"
          class="shrink-0 whitespace-nowrap rounded bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-300"
        >
          Спести {{ savings.percentage }}% · {{ formatUnitPrice(savings.absolute, group.unitBase) }}
        </span>
      </div>

      <div v-if="cheapest" class="flex items-baseline gap-2">
        <span class="text-xl font-bold text-gray-900 dark:text-gray-100">
          {{ formatUnitPrice(cheapest.unitPriceEurCents, group.unitBase) }}
        </span>
        <span class="text-sm font-medium text-gray-600 dark:text-gray-300">{{ cheapest.retailer }}</span>
      </div>
      <p v-if="cheapest" class="text-xs text-gray-500 dark:text-gray-400">
        {{ formatEur(cheapest.priceEurCents) }} · {{ cheapest.offer.unitText }}
      </p>

      <ul v-if="others.length" class="mt-1 flex flex-col gap-0.5">
        <li
          v-for="row in others"
          :key="row.offerKey"
          class="flex items-baseline justify-between gap-2 text-xs text-gray-500 dark:text-gray-400"
        >
          <span>{{ row.retailer }}</span>
          <span class="whitespace-nowrap">
            {{ formatUnitPrice(row.unitPriceEurCents, group.unitBase) }}
            <span class="text-gray-400 dark:text-gray-500">{{ difference(row) }}</span>
          </span>
        </li>
      </ul>
    </div>
  </article>
</template>
