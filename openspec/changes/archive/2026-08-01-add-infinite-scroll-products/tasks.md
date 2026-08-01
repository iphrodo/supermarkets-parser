## 1. Batching state in the listing page

- [x] 1.1 Add a `visibleCount` ref (initialized to one batch size) in `app/pages/index.vue`
- [x] 1.2 Derive a `visibleOffers` computed that slices `filteredOffers` by `visibleCount`
- [x] 1.3 Update the grid `v-for` to iterate `visibleOffers` instead of `filteredOffers`
- [x] 1.4 Reset `visibleCount` to one batch whenever the retailer, category, or price filter changes

## 2. Scroll-triggered loading

- [x] 2.1 Add a sentinel element after the grid (rendered only while more offers remain)
- [x] 2.2 Wire an `IntersectionObserver` on the sentinel that increments `visibleCount` by one batch when it enters the viewport
- [x] 2.3 Guard against incrementing past `filteredOffers.length`
- [x] 2.4 Disconnect/re-observe the observer correctly on component unmount and when the sentinel element changes

## 3. Loading and end states

- [x] 3.1 Show a loading-more indicator while a new batch is being appended
- [x] 3.2 Show an end-of-list indicator once all matching offers are rendered
- [x] 3.3 Confirm the existing empty-results state still renders correctly when zero offers match (no batch/sentinel/indicator shown)

## 4. Tests

- [x] 4.1 Add an `IntersectionObserver` mock/polyfill to the Vitest/jsdom setup
- [x] 4.2 Add a component test for `app/pages/index.vue` (or extracted logic) covering: initial batch size on load, batch growth on sentinel intersection, filter change resetting the batch, end-of-list state, empty-results state
- [x] 4.3 Run `pnpm test` and confirm existing server-side tests still pass unaffected

## 5. Manual verification

- [x] 5.1 Run the app locally and confirm the deals page loads a bounded first batch, loads more on scroll, and reaches a clear end state
- [x] 5.2 Confirm changing filters mid-scroll resets the list to the top without a stale tail
