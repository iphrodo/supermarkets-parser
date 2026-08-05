## 1. Quantity normalization

- [x] 1.1 Add `server/utils/quantity.ts` exporting `parseQuantity(unitText): { unitBase: 'kg' | 'l' | 'pc'; baseQuantity: number } | null`, handling г/гр/g, кг/kg, мл/ml, л/l, бр/броя/pcs, decimal commas, and multipack forms ("4 x 125 г", "2х1,5 л")
- [x] 1.2 Handle Kaufland's slash-joined multi-unit text ("3 л/ 1455 г") by preferring the volume token, then weight, then pieces; return `null` for empty or unrecognized text
- [x] 1.3 Add `unitPriceEurCents(offer, quantity)` folding in `mechanic` (`buy_1_get_1_free` × 0.5, `buy_2_get_1_free` × 2/3) and leaving `loyaltyTier` untouched
- [x] 1.4 Reuse the lowercase/whitespace normalization already in `server/utils/normalize.ts` rather than re-implementing it (extract a shared helper if `normalizeUnitText`'s token sorting is unsuitable for quantity parsing)

## 2. Canonical product types

- [x] 2.1 Add `product-types:vocabulary` and `product-types:assignments` keys plus read/write accessors to `server/utils/kv.ts`, following the existing `read/writeLastBillaPublicationSlug` pattern
- [x] 2.2 Add a text-only `extractStructuredData(prompt, responseSchema, model)` alongside `extractStructuredDataFromImage` in `server/utils/scrapers/vision-extraction.ts`, reusing `getVisionClient()`
- [x] 2.3 Add `server/utils/product-type.ts` exporting `classifyOffers(offers, deps)`: split cached vs. new by `productKey`, batch new ones (~40 per call) with the current vocabulary in the prompt, and request `{ index, typeId | null, newType | null, confident }` per item
- [x] 2.4 Append proposed new types to the vocabulary, persist vocabulary + assignments, and drop unconfident assignments so those offers never enter a comparison
- [x] 2.5 Write the classification prompt to fix granularity: a generic kind of product, brand and pack size stripped, prefer an existing type over proposing a new one

## 3. Comparison groups

- [x] 3.1 Add `shared/types/comparison.ts` with `UnitBase`, `ComparisonEntry` (`offerKey`, `retailer`, `priceEurCents`, `unitPriceEurCents`, `isCheapest`) and `ComparisonGroup` (`groupKey`, `labelBg`, `unitBase`, `entries`, `savingsPercentage`, `warnings`); add `comparisons: ComparisonGroup[]` to `DealsSnapshot`
- [x] 3.2 Add `server/utils/comparison.ts` exporting `buildComparisons(offers, vocabulary, assignments)`: group by type, compute per-unit prices, drop offers whose `unitBase` disagrees with the type's
- [x] 3.3 Reduce each retailer to its cheapest per-unit entry (must collapse Lidl price-list and Lidl leaflet into one entry) and discard groups with fewer than two distinct retailers
- [x] 3.4 Drop entries above 10× the group median per-unit price and record them in the group's `warnings`
- [x] 3.5 Mark exactly one `isCheapest` entry, sort entries cheapest-first, and sort groups by `savingsPercentage` descending

## 4. Sync wiring

- [x] 4.1 Run classification + `buildComparisons` in `server/utils/sync.ts` after `mergeCatalog`, injecting the classifier through `RunSyncDeps` so tests never touch the network
- [x] 4.2 Guard the enrichment: on any failure, log and publish the snapshot with the previous snapshot's `comparisons` (or `[]` when there is none), never blocking publication

## 5. API and fixtures

- [x] 5.1 Fix `EMPTY_SNAPSHOT` in `server/api/deals.get.ts` — it is typed `DealsSnapshot` but omits the `lidlLeaflet` and `billa` source entries — and add `comparisons: []`
- [x] 5.2 Fix the same omission in `makeSnapshot` in `app/pages/__tests__/fixtures.ts` and add a `makeComparisonGroup` helper

## 6. UI

- [x] 6.1 Extract the batch / `IntersectionObserver` incremental-scroll logic currently inline in `app/pages/index.vue` into `app/composables/useIncrementalList.ts`
- [x] 6.2 Move the current offer-list page to `app/pages/deals.vue` unchanged in behavior, using the extracted composable, and move its page tests to `deals-*.test.ts`
- [x] 6.3 Add `app/components/PriceComparisonCard.vue`: type label, one row per retailer with per-unit price, absolute price and pack size, cheapest row badged with the savings percentage
- [x] 6.4 Rewrite `app/pages/index.vue` as the comparison view over `snapshot.comparisons`, resolving `offerKey` against `snapshot.offers`, with search by type label, sort (savings / label), the incremental-scroll composable, and an explicit empty state
- [x] 6.5 Add navigation between the comparison view and `/deals` in `app/app.vue`
- [x] 6.6 Add a Storybook story for `PriceComparisonCard` alongside the existing `stories/OfferCard.stories.ts`

## 7. Tests

- [x] 7.1 `server/utils/__tests__/quantity.test.ts`: unit table (г/кг/мл/л/бр), decimal comma, multipacks, "3 л/ 1455 г", unparseable → null, 1+1 and 2+1 adjustment
- [x] 7.2 `server/utils/__tests__/product-type.test.ts` with a mocked model client: cached `productKey` triggers no call, new type is appended to the vocabulary, unconfident assignment is dropped, batching splits large inputs
- [x] 7.3 `server/utils/__tests__/comparison.test.ts`: single-retailer group discarded, two Lidl sources collapse to one entry, outlier dropped and warned, exactly one `isCheapest`, groups sorted by savings
- [x] 7.4 Extend `server/utils/__tests__/sync.test.ts`: classification failure still publishes, carrying forward previous comparisons
- [x] 7.5 `app/components/__tests__/PriceComparisonCard.test.ts` and page tests for the comparison view (renders groups, empty state) plus the moved `/deals` tests

## 8. Verification

- [x] 8.1 Run one real sync locally and manually review 5–10 produced groups against the source leaflets, judging whether the grouped products are genuinely comparable; tune the classification prompt if granularity is off — reviewed with the user; found and fixed a real cross-species misclassification (Billa chicken thighs assigned to "свинско месо"/pork), tightened the prompt against species/ingredient conflation and index mismatches, wiped the cache, and re-ran; spot checks after the fix look correct
- [x] 8.2 Run a second sync immediately after and confirm zero model calls (assignment cache hit) — second sync completed near-instantly (vs. minutes for the full reclassification), confirming the cache was hit
- [x] 8.3 Confirm the comparison view and `/deals` both render without regressions in a browser — verified by user
- [x] 8.4 Run the full test suite and typecheck
