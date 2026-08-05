## Why

The catalog currently shows every offer from every source as one flat list. A user who wants the cheapest chicken breast this week has to eyeball hundreds of cards across four sources, mentally convert "1.79 EUR / 400 г" into a price per kilo, and remember what the other retailers charged. Nothing in the system relates one retailer's product to another's.

Cross-store identity cannot be derived from the existing data: only Kaufland offers ever carry an `ean`, `productKey` is deliberately retailer-scoped for non-EAN offers, and `category` is incomparable across sources (Kaufland's Bulgarian display labels, Lidl's raw numeric category codes, the vision sources' free-text guesses). Matching exact SKUs across retailers would also produce very few results, since the same SKU is rarely on promotion in two chains in the same week.

The useful comparison is therefore between *similar* products — a canonical product type ("пилешко филе", "кисело мляко") compared by price per kilogram / litre / piece — and it must be built automatically, without the user picking products.

## What Changes

- Add quantity parsing that converts Bulgarian unit text ("500 г", "1,5 л", "4 x 125 г") into a base quantity (kg / l / pc) and derives a per-base-unit price, adjusted for the offer's `mechanic` so 1+1 and 2+1 promotions compare fairly against plain discounts.
- Add automatic canonical product-type classification: each offer is assigned a type from a vocabulary persisted in KV, using the model already in the stack (Gemini) for text classification, with per-`productKey` caching so repeat syncs cost nothing.
- Add comparison-group building: offers of the same type are grouped, reduced to one cheapest entry per retailer, and kept only when at least two different retailers are present; groups are ranked by potential savings.
- Publish the resulting groups inside the existing KV snapshot (`DealsSnapshot.comparisons`) so the UI stays a pure reader and ISR is unchanged.
- Make price comparison the landing page and move the full offer list to `/deals`.
- Classification/comparison failure SHALL never block snapshot publication — the snapshot is published with the previous run's comparisons instead.

## Capabilities

### New Capabilities
- `price-comparison`: Normalizes offer quantities into comparable base units, assigns each offer a canonical product type, and builds cross-retailer comparison groups that identify the cheapest option per product type.

### Modified Capabilities
- `deal-catalog`: the published snapshot SHALL carry comparison groups alongside offers, referencing offers by `offerKey` rather than duplicating them.
- `deals-snapshot-cache`: comparison building SHALL run as part of a scheduled sync and SHALL NOT be able to prevent a snapshot from being published.
- `deals-browsing-ui`: price comparison SHALL be the landing view; the existing filterable offer list SHALL remain reachable at its own route with its current behavior intact.

## Impact

- `server/utils/quantity.ts` (new): unit-text parsing and per-base-unit pricing.
- `server/utils/product-type.ts` (new): vocabulary + assignment cache, model-based classification.
- `server/utils/comparison.ts` (new): grouping, per-retailer reduction, outlier guard, savings ranking.
- `server/utils/scrapers/vision-extraction.ts`: add a text-only structured-output helper next to the existing image one, reusing `getVisionClient`.
- `server/utils/kv.ts`: two new keys (`product-types:vocabulary`, `product-types:assignments`) with accessors.
- `shared/types/comparison.ts` (new) and `shared/types/offer.ts`: `DealsSnapshot` gains `comparisons`.
- `server/utils/sync.ts`: enrichment step after `mergeCatalog`, guarded so it cannot block publication.
- `server/api/deals.get.ts`: `EMPTY_SNAPSHOT` currently omits the `lidlLeaflet` and `billa` source entries despite being typed `DealsSnapshot` — fixed here, plus `comparisons: []`.
- `app/pages/index.vue` (comparison view), `app/pages/deals.vue` (current list, moved), `app/components/PriceComparisonCard.vue` (new), `app/composables/useIncrementalList.ts` (new, extracted from the current page), `app/app.vue` (navigation).
- Ongoing cost: one model call per batch of previously unseen products per sync; zero when nothing new appeared.
