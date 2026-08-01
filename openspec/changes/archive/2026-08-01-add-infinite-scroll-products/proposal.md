## Why

`app/pages/index.vue` renders every offer from the cached deals snapshot into the DOM in one pass via a plain `v-for` over `filteredOffers`. As the snapshot grows (two retailers, weekly refreshes), the page pays the full render/layout cost on first paint even though the user only ever looks at the first screenful before scrolling. Loading and rendering the list incrementally as the user scrolls removes that up-front cost without changing what the user can ultimately see.

## What Changes

- Render the offer grid in `app/pages/index.vue` incrementally: only a bounded initial batch of offers is rendered on load; more batches render as the user scrolls near the bottom of the list.
- Add a scroll-triggered loading mechanism (sentinel element + `IntersectionObserver`) that appends the next batch of already-fetched offers to the visible list.
- Re-slice/reset the visible batch whenever the active filters (retailer, category, price) change, so filtering still feels instant and never shows a stale tail from the previous filter set.
- Add a loading-more indicator at the bottom of the grid while a batch is pending, and a clear end-of-list state when all matching offers are shown.
- The existing single `/api/deals` fetch (whole snapshot from the KV-backed cache) is unchanged — batching is a client-side rendering concern layered on top of data already in memory, not a new paginated API.

## Capabilities

### Modified Capabilities
- `deals-browsing-ui`: the filterable listing requirement changes from "render all matching offers immediately" to "render matching offers in incremental batches triggered by scroll position," while filtering and source-attribution behavior stay the same.

## Impact

- `app/pages/index.vue`: list rendering logic, batch/window state, `IntersectionObserver` wiring, filter-change reset.
- `app/components/OfferCard.vue`: unaffected in props/behavior; only the surrounding loop changes.
- No changes to `server/api/deals.get.ts`, `server/utils/kv.ts`, or the snapshot schema.
- New test coverage needed for `index.vue` batching/scroll behavior — no existing page-level tests exist to extend.
