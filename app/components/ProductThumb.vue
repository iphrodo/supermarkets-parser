<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LeafletPage, Offer } from '../../shared/types/offer'
import DepartmentPlaceholder from './DepartmentPlaceholder.vue'

type ThumbSize = 'sm' | 'md' | 'full'

const props = withDefaults(
  defineProps<{
    offer: Offer
    /** The page `offer.imageCrop` points at, looked up in the snapshot's registry by the caller. */
    page?: LeafletPage | null
    size?: ThumbSize
  }>(),
  { page: null, size: 'full' },
)

/**
 * Sizing is by width only: the container's height comes from its aspect ratio,
 * so the crop is never squashed and its space is reserved before the image
 * loads.
 */
const SIZE_CLASSES: Record<ThumbSize, string> = {
  sm: 'w-16',
  md: 'w-28',
  full: 'w-full',
}

const COORD_MAX = 1000
/**
 * Every thumbnail is the same shape, whatever the source. Letting a crop set
 * its own aspect ratio made a portrait box (a salami stick, a beer can) render
 * three times taller than a landscape one beside it and stretched the whole
 * grid row with it, so the tile shape is fixed and the crop is fitted into it.
 */
const TILE_ASPECT_RATIO = 1

const loadFailed = ref(false)

/** Percentages carry sub-pixel geometry, so round rather than emit float noise. */
function percent(fraction: number): string {
  return `${Math.round(fraction * 1e6) / 1e4}%`
}

const crop = computed<Record<string, string> | null>(() => {
  const imageCrop = props.offer.imageCrop
  const page = props.page
  if (!imageCrop || !page) return null

  const [ymin, xmin, ymax, xmax] = imageCrop.box
  const widthFraction = (xmax - xmin) / COORD_MAX
  const heightFraction = (ymax - ymin) / COORD_MAX
  if (widthFraction <= 0 || heightFraction <= 0) return null

  // Fit the crop inside the tile the way `object-fit: contain` would — scale to
  // whichever axis binds first, then centre the leftover band. The crop keeps
  // its true proportions; only the space around it changes.
  const cropAspectRatio = (widthFraction * page.width) / (heightFraction * page.height)
  const fittedWidth = Math.min(1, cropAspectRatio / TILE_ASPECT_RATIO)
  const fittedHeight = Math.min(1, TILE_ASPECT_RATIO / cropAspectRatio)

  // How large the whole page image must be for its crop region to occupy
  // exactly the fitted area.
  const scaleX = fittedWidth / widthFraction
  const scaleY = fittedHeight / heightFraction

  return {
    width: percent(scaleX),
    height: percent(scaleY),
    left: percent((1 - fittedWidth) / 2 - (xmin / COORD_MAX) * scaleX),
    top: percent((1 - fittedHeight) / 2 - (ymin / COORD_MAX) * scaleY),
  }
})

const mode = computed<'url' | 'crop' | 'placeholder'>(() => {
  if (loadFailed.value) return 'placeholder'
  if (props.offer.imageUrl) return 'url'
  if (crop.value) return 'crop'
  return 'placeholder'
})

const source = computed(() => (mode.value === 'crop' ? props.page!.imageUrl : (props.offer.imageUrl ?? null)))

// Fixed for every mode, so the space is reserved before the image loads and
// cards in a row stay the same height.
const containerStyle = { aspectRatio: String(TILE_ASPECT_RATIO) }

// A different image deserves its own chance to load; without this the failure
// of one offer's image would blank a recycled card.
watch(source, () => {
  loadFailed.value = false
})
</script>

<template>
  <div
    class="relative overflow-hidden rounded bg-white dark:bg-gray-900"
    :class="SIZE_CLASSES[size]"
    :style="containerStyle"
  >
    <!--
      `max-w-none` is load-bearing: Tailwind preflight's `img { max-width: 100% }`
      silently clamps the >100% width a CSS crop depends on, and the result looks
      like a bad bounding box rather than a CSS problem.
    -->
    <img
      v-if="mode === 'crop'"
      :src="source!"
      :alt="offer.name"
      class="absolute max-w-none"
      :style="crop!"
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      @error="loadFailed = true"
    />

    <img
      v-else-if="mode === 'url'"
      :src="source!"
      :alt="offer.name"
      class="h-full w-full object-contain"
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      @error="loadFailed = true"
    />

    <DepartmentPlaceholder v-else />
  </div>
</template>
