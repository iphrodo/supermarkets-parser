## Why

The comparison landing page is hard to use, for two reasons its users named directly.

**There are too many products and no way through them.** The page renders every published group in one flat grid, offering a substring search over the type label and a two-option sort. There is no category navigation, no retailer filter, no way to hide marginal savings, no result count, and no URL state — so a view cannot be shared, and the browser's Back button does not undo a filter. Finding "the yoghurt deals" means scrolling.

**It is not obvious what the products are.** A card is text only: a generic type label as the heading, then three rows of 11px grey text carrying the retailer, product name, pack size, and EAN at the same visual weight. The price — the entire point of the page — is not the most prominent thing on it. Meanwhile the interface is in English while every product name is in Bulgarian, which reads as unfinished to the audience actually using it.

There is also a latent performance problem: each card builds a `Map` over the snapshot's whole offer list in its own `computed`, so rendering a batch of 24 cards over ~5000 offers costs ~120k map insertions, redone every time the batch grows.

## What Changes

- **Card redesign.** One product image per card, resolved through a defined fallback chain that ends at a placeholder tile rather than a gap. The cheapest per-unit price becomes the dominant element; the pack price sits beneath it. The savings badge states both the percentage and the absolute per-unit amount saved, which is what actually tells a shopper whether the difference is worth a detour. Retailer rows stay cheapest-first.
- **Details view.** The card sheds its secondary detail into a details view opened from it and reflected in the URL. That view carries each retailer's own image, brand, full product name, pack size, EAN, validity dates, promotional mechanic and loyalty badges, original price, and source link — plus the warnings the pipeline has always produced and the UI has never shown, both the group's and each offer's own.
- **Narrowing.** A department chip bar with live counts, a retailer multi-select, a minimum-savings threshold, and a search that covers product names and brands rather than only the generic type label. An applied-filters overview makes it obvious why a list is short, and clears in one action.
- **Shareable state.** Filters and the open details view live in the URL.
- **Bulgarian interface** across the comparison view, the offer listing, and the shared navigation.
- **Performance.** The offer lookup and a search index are built once per page and shared, rather than per card.

Two existing requirements say the source link and EAN must be visible *on each comparison entry*. Moving them into the details view contradicts that, so those requirements are modified here rather than quietly broken — the capability is preserved, its placement changes.

One dependency remains: if `add-product-departments` is not yet deployed, the chip bar is omitted rather than rendering a single degenerate chip. Imagery is no longer a dependency — `add-leaflet-product-image-crops` has landed and `replace-lidl-leaflet-with-site-api` gave Lidl direct product photographs, so three of the four sources now carry imagery and the placeholder tile is the exception rather than the rule.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `deals-browsing-ui`: the landing view gains a product image with a defined fallback, a savings figure expressed in both relative and absolute terms, filtering by department, retailer, minimum savings and free text, an applied-filters overview with a result count, URL-reflected state, and a details view that becomes the home for per-entry source links, EANs, and the warnings recorded for a group and for its individual offers. All user-facing text becomes Bulgarian.

## Impact

- `app/pages/index.vue`: hoists the `offerKey` lookup and a search index out of the cards, owns filter state, and composes the new toolbar, chip bar, grid, and details view. Continues to use `useIncrementalList` unchanged.
- `app/components/PriceComparisonCard.vue`: rewritten; its `offers` prop is replaced by an injected lookup, since the details view needs the same map from outside the card tree.
- New: `app/components/comparison/{ComparisonToolbar,DepartmentChips,ComparisonDetailsModal}.vue`, `app/composables/{useComparisonFilters,useOffersByKey}.ts`, `app/utils/{format,hero-image}.ts`.
- `app/utils/format.ts` absorbs the retailer labels, unit suffixes, and cent formatting currently duplicated between `OfferCard.vue` and `PriceComparisonCard.vue`.
- `app/app.vue`, `app/pages/deals.vue`, `app/components/{DealsFilterBar,OfferCard}.vue`: string translation only — `/deals` is not redesigned, but leaving it English while the shell is Bulgarian would read as half-finished.
- Filter state must be read from the URL on the client only. The landing route is served with a 30-minute ISR window, and initializing from query parameters during server rendering would fragment that cache per query string and risk hydration mismatches.
