## Context

`app/pages/index.vue` fetches the entire deals snapshot once via `useFetch('/api/deals')` and renders every offer in `filteredOffers` through a single `v-for` into the grid (lines ~42-44). `server/api/deals.get.ts` has no pagination params — it reads one pre-built snapshot from Upstash Redis (`server/utils/kv.ts`) per the `deals-snapshot-cache` capability, which explicitly forbids live scraping or per-request backend work. Filtering (retailer/category/price) already happens client-side over the in-memory array. There is no store — state lives in local refs in `index.vue`. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Reduce initial DOM/render cost of the deals page by rendering offers in bounded batches.
- Trigger the next batch automatically as the user scrolls near the end of the rendered list.
- Keep filtering behavior and the ISR/no-live-scrape guarantee of `deals-snapshot-cache` untouched.

**Non-Goals:**
- Server-side/API pagination of `/api/deals`. The snapshot is a single cached KV read that's cheap to return whole; splitting it into paged requests would add round-trip latency and backend complexity for no benefit, since the full dataset is already in memory client-side after one fetch.
- Virtual scrolling / DOM recycling of already-rendered items (removing offscreen nodes above the fold). Only forward batching (not rendering ahead) is in scope; revisit if profiling shows the growing rendered list itself becomes a bottleneck.
- Changes to `OfferCard.vue`'s props or markup.

## Decisions

**Client-side batching over the already-fetched array, not paginated fetch.** The whole snapshot is fetched once (existing behavior, unchanged). A local `visibleCount` ref (initialized to one batch size, e.g. 24) slices `filteredOffers` for rendering; scrolling near the bottom increments it by one batch. Alternative considered: paginated `/api/deals?offset=&limit=` — rejected because it would require the server to re-slice a value that's already fully materialized per request (no incremental KV read benefit) and turns a single fast fetch into N sequential ones, working against the ISR "never block on user request" principle.

**`IntersectionObserver` on a sentinel element** at the end of the grid, rather than a scroll/resize event listener, to trigger loading the next batch. Avoids manual throttling/debouncing of scroll events and matches standard Vue/Nuxt practice for scroll-triggered loading.

**Batch size:** fixed constant (not responsive to viewport), simple and predictable; can be tuned later without spec changes since batch size is an implementation detail, not an observable behavior.

**Filter change resets `visibleCount`** back to one batch, computed as part of the same reactive chain (`watch` on the filter refs, or recomputing `filteredOffers` resets the slice). Prevents showing a leftover tail from a previous filter's batch progress.

## Risks / Trade-offs

- [Very large future snapshots make even one batch's worth of card markup non-trivial to hydrate] → Batch size is a tunable constant; if this becomes a real problem, revisit with virtual scrolling (explicitly a non-goal here).
- [`IntersectionObserver` support/behavior in the target browsers/test environment] → Widely supported in all evergreen browsers; component tests will need a mock/polyfill in the Vitest/jsdom environment, called out in tasks.md.
- [Accessibility: screen reader / keyboard users relying on scroll-triggered loading] → Add a visible "load more" fallback affordance alongside the observer isn't required by the spec but should be considered during implementation; not a spec requirement for this change.
