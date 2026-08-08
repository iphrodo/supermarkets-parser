<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComparisonGroup } from '../../../shared/types/comparison'
import type { LeafletPage } from '../../../shared/types/offer'
import { useOffersByKey } from '../../composables/useOffersByKey'
import {
  LOYALTY_LABELS,
  MECHANIC_LABELS,
  RETAILER_LABELS,
  formatBgn,
  formatDate,
  formatEur,
  formatUnitPrice,
} from '../../utils/format'
import ProductThumb from '../ProductThumb.vue'

const props = defineProps<{
  /**
   * Null while the snapshot is still resolving, or when the `g` parameter names
   * no published group. Guarding on the group rather than on the injected
   * lookup being populated is what lets a details URL be opened directly.
   */
  group: ComparisonGroup | null
  leafletPages: Record<string, LeafletPage>
}>()

const emit = defineEmits<{ close: [] }>()

const offersByKey = useOffersByKey()
const dialog = ref<HTMLElement | null>(null)

const entries = computed(() => {
  const group = props.group
  if (!group) return []
  return group.entries.flatMap((entry) => {
    const offer = offersByKey.value.get(entry.offerKey)
    if (!offer) return []
    const pageId = offer.imageCrop?.pageId
    return [
      {
        entry,
        offer,
        page: pageId ? (props.leafletPages[pageId] ?? null) : null,
        retailer: RETAILER_LABELS[entry.retailer],
        mechanic: MECHANIC_LABELS[offer.mechanic],
        loyalty: LOYALTY_LABELS[offer.loyaltyTier],
      },
    ]
  })
})

function focusables(): HTMLElement[] {
  if (!dialog.value) return []
  return Array.from(
    dialog.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  )
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key !== 'Tab') return

  const items = focusables()
  if (!items.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement

  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

// Locking the body is what keeps the page beneath from scrolling under the
// overlay on touch; restoring the previous value rather than clearing it keeps
// a nested lock (the mobile filter sheet) from being undone here.
let previousOverflow: string | null = null

function lockScroll(): void {
  if (typeof document === 'undefined' || previousOverflow !== null) return
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockScroll(): void {
  if (typeof document === 'undefined' || previousOverflow === null) return
  document.body.style.overflow = previousOverflow
  previousOverflow = null
}

watch(
  () => props.group,
  async (group) => {
    if (!group) {
      unlockScroll()
      return
    }
    lockScroll()
    await nextTick()
    focusables()[0]?.focus()
  },
  { immediate: true },
)

onBeforeUnmount(unlockScroll)
</script>

<template>
  <Teleport to="body">
    <div v-if="group" class="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />

      <div
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="group.labelBg"
        class="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl dark:bg-gray-900 sm:rounded-xl"
        @keydown="onKeydown"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ group.labelBg }}</h2>
          <button
            type="button"
            class="shrink-0 rounded px-2 py-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            @click="emit('close')"
          >
            Затвори
          </button>
        </div>

        <ul class="flex flex-col gap-3">
          <li
            v-for="item in entries"
            :key="item.entry.offerKey"
            class="flex gap-3 rounded-lg border p-3"
            :class="
              item.entry.isCheapest
                ? 'border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950'
                : 'border-gray-200 dark:border-gray-700'
            "
          >
            <div class="h-20 w-20 shrink-0">
              <ProductThumb :offer="item.offer" :page="item.page" />
            </div>

            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="flex flex-wrap items-baseline gap-2">
                <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ item.retailer }}</span>
                <span
                  v-if="item.entry.isCheapest"
                  class="rounded bg-green-600 px-1.5 py-0.5 text-xs font-semibold text-white"
                >
                  Най-евтино
                </span>
              </div>

              <p v-if="item.offer.brand" class="text-xs font-medium text-gray-700 dark:text-gray-300">
                {{ item.offer.brand }}
              </p>
              <p class="text-sm text-gray-700 dark:text-gray-300">{{ item.offer.name }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ item.offer.unitText }}</p>

              <div class="flex flex-wrap items-baseline gap-2">
                <span class="text-base font-bold text-gray-900 dark:text-gray-100">
                  {{ formatUnitPrice(item.entry.unitPriceEurCents, group.unitBase) }}
                </span>
                <span class="text-sm text-gray-600 dark:text-gray-300">{{ formatEur(item.entry.priceEurCents) }}</span>
                <span v-if="item.offer.originalPriceEurCents" class="text-xs text-gray-400 line-through">
                  {{ formatEur(item.offer.originalPriceEurCents) }}
                </span>
                <span v-if="item.offer.priceBgnCents" class="text-xs text-gray-500 dark:text-gray-400">
                  ({{ formatBgn(item.offer.priceBgnCents) }})
                </span>
              </div>

              <div v-if="item.mechanic || item.loyalty" class="flex flex-wrap gap-1">
                <span
                  v-if="item.mechanic"
                  class="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300"
                >
                  {{ item.mechanic }}
                </span>
                <span
                  v-if="item.loyalty"
                  class="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                >
                  {{ item.loyalty }}
                </span>
              </div>

              <p class="text-xs text-gray-500 dark:text-gray-400">
                Валидна {{ formatDate(item.offer.validFrom) }} – {{ formatDate(item.offer.validUntil) }}
              </p>

              <p v-if="item.offer.ean" class="text-xs text-gray-400 dark:text-gray-500">EAN {{ item.offer.ean }}</p>

              <!--
                Ingestion diagnostics promoted to user-facing copy: the Lidl
                listing writes these for a discount label it could not quantify,
                so they are frequent and quote the retailer's own wording.
              -->
              <ul v-if="item.offer.warnings.length" class="flex flex-col gap-0.5">
                <li
                  v-for="warning in item.offer.warnings"
                  :key="warning"
                  class="text-xs text-amber-700 dark:text-amber-400"
                >
                  {{ warning }}
                </li>
              </ul>

              <a
                :href="item.offer.sourceUrl"
                target="_blank"
                rel="noopener"
                class="text-xs text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
              >
                Източник
              </a>
            </div>
          </li>
        </ul>

        <div
          v-if="group.warnings.length"
          class="mt-4 rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <p class="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Бележки за сравнението</p>
          <ul class="flex flex-col gap-0.5">
            <li v-for="warning in group.warnings" :key="warning" class="text-xs text-gray-500 dark:text-gray-400">
              {{ warning }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>
