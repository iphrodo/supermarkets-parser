import { computed, onUnmounted, ref, watch, type Ref } from 'vue'

/**
 * Renders `items` in bounded batches, growing the visible slice as an
 * `IntersectionObserver`-watched sentinel element scrolls into view.
 * Resets to the first batch whenever `items` itself changes identity
 * (e.g. a filter narrows the matching set).
 */
export function useIncrementalList<T>(items: Ref<T[]>, batchSize: number) {
  const visibleCount = ref(batchSize)

  watch(items, () => {
    visibleCount.value = batchSize
  })

  const visibleItems = computed(() => items.value.slice(0, visibleCount.value))
  const hasMore = computed(() => visibleCount.value < items.value.length)

  function loadMore() {
    if (!hasMore.value) return
    visibleCount.value = Math.min(visibleCount.value + batchSize, items.value.length)
  }

  const sentinel = ref<HTMLElement | null>(null)
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

  return { visibleItems, hasMore, sentinel }
}
