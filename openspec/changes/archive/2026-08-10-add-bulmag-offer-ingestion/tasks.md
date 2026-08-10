## 1. Listing and brochure-tag scoping

- [x] 1.1 Verify `productTagIds=1973` filters `products?isPromo=1` server-side (compare `totalItems` with and without the tag filter) before writing the pagination loop; if it does not filter, stop and raise the scope question back to the user rather than choosing a fallback unilaterally
- [x] 1.2 Implement paginated fetch of `products?isPromo=1&productTagIds=1973&page=N&itemsPerPage=100`, advancing by what's actually returned and stopping once `totalItems` is reached
- [x] 1.3 Add a `BulmagIngestionError` (mirroring `KauflandIngestionError`/`LidlIngestionError`/`BillaIngestionError`) and fail the run clearly (log + no publish) when the first list page fails outright or the response shape is wrong

## 2. Validity window

- [x] 2.1 After listing, sample a handful of listed items (e.g. one per list page, ~3-5 total) and fetch their detail endpoint for `promotionFrom`/`promotionTo`
- [x] 2.2 If the sample agrees on one window, reformat `DD.MM.YYYY` → ISO and apply it to every listed item's `validFrom`/`validUntil`
- [x] 2.3 If the sample disagrees, or every date probe fails, fail the run (`BulmagIngestionError`) rather than guessing or averaging a validity period

## 3. Field mapping and normalization

- [x] 3.1 Add `'bulmag'` to the `Retailer` union in `shared/types/offer.ts`
- [x] 3.2 Implement `server/utils/scrapers/bulmag.ts` exporting `fetchBulmagOffers()` (list + date-probe fetch) and a separate `parseBulmagOffers()`-style function that maps already-fetched list/detail data into `Offer[]`, mirroring the `fetchXOffers()`/`parseXYyy()` split, using `computeProductKey`/`computeOfferKey` from `server/utils/normalize.ts`
- [x] 3.3 Map `price`/`promoPrice`/`priceBgn`/`promoPriceBgn`/`discount` to `originalPriceEurCents`/`priceEurCents`/`priceBgnCents`/`discountPercentage`, guarding `originalPriceEurCents` against a zero or equal-to-promo full price (map to `null`, mirroring `lidl-site.ts`'s guard)
- [x] 3.4 Set `ean: null` always; never populate it from BulMag's internal `number`/`id` codes
- [x] 3.5 Implement `unitText` derivation: name-embedded quantity via regex → `measure === 'БР'` single-piece default → omit with a warning for anything else (loose-weight items); verify a real `parseQuantity()` call from `server/utils/quantity.ts` succeeds for the first two cases
- [x] 3.6 Set `imageUrl` from `imageThumbnail` (or null when empty); do not set `imageCrop` at all (structurally absent, not null)
- [x] 3.7 Set `loyaltyTier: 'none'`, `mechanic: 'standard'` (and log the distinct `specialTags` values seen in a real run to check for missed BOGO-style badges), `campaign: null`, `purchaseLimit: null`
- [x] 3.8 Set `scope: 'national'`, `store: null`, `sourceUrl`, and `scrapedAt` on every emitted offer; confirm the real BulMag product page URL pattern for `sourceUrl` (fall back to the brochure page URL if it can't be confirmed cheaply)

## 4. Retry, backoff, and pacing

- [x] 4.1 Add a small local retry helper for `bulmag.ts`'s requests (bounded attempts, backoff, retry only on 403/429/5xx)
- [x] 4.2 Add a small fixed delay between successive list-page and detail-probe requests
- [x] 4.3 On retries exhausted for a load-bearing request (first list page, or all date-window probes), fail the run via `BulmagIngestionError` rather than proceeding with incomplete data

## 5. Wiring into sync/cron

- [x] 5.1 Add a `bulmag` entry to `DealsSnapshot.sources` in `shared/types/offer.ts`
- [x] 5.2 Wire `fetchBulmagOffers` into `server/utils/sync.ts`'s daily run (`RunSyncDeps` + `sources` array, `belongsToSource: (o) => o.retailer === 'bulmag'`), following the existing partial-failure isolation behavior
- [x] 5.3 Add `fetchBulmagOffers` to `server/api/cron/sync-deals.ts` and `server/plugins/catch-up-sync.ts`
- [x] 5.4 Add `bulmag: { ok: false, scrapedAt: null }` to the empty-snapshot source defaults in `server/api/deals.get.ts`

## 6. Frontend retailer wiring

- [x] 6.1 Add `bulmag: 'BulMag'` (or similar) to `RETAILER_LABELS` in `app/utils/format.ts`
- [x] 6.2 Add `'bulmag'` to the `RETAILERS` array in `app/composables/useComparisonFilters.ts`
- [x] 6.3 Add `'bulmag'` to `ALL_RETAILERS` in `app/components/comparison/ComparisonToolbar.vue`
- [x] 6.4 Add a `<option value="bulmag">BulMag</option>` to `app/components/DealsFilterBar.vue`

## 7. Tests

- [x] 7.1 Add `server/utils/scrapers/__tests__/bulmag.test.ts` covering: pagination boundary, missing `brand`, tag-filter-mismatch item, malformed/disagreeing promo dates, all three `unitText` derivation cases, `originalPriceEurCents` zero/equal guard, `imageCrop` structurally absent (`'imageCrop' in offer` assertion, mirroring `lidl-site.test.ts`), `ean` always null despite `number`/`id` existing, and a retry/backoff test (fails N times then succeeds; exhausts retries and throws) — all against fixtures under `test/fixtures/bulmag-*.json`, no real network calls
- [x] 7.2 Extend `server/utils/__tests__/sync.test.ts`'s partial/total-failure matrix from four to five sources
- [x] 7.3 Extend `server/utils/__tests__/catalog.test.ts` if cross-source merge behavior needs BulMag fixtures (likely not needed — `mergeCatalog` is already retailer-agnostic and generically tested, mirroring Billa's precedent)

## 8. Verification

- [x] 8.1 Run the daily sync locally against real BulMag data once and manually sanity-check: offer count lands near ~300, a sample of `unitText`/price-per-unit values look plausible for loose-weight items, `validFrom`/`validUntil` match the actual current brochure — dry-run against the live API: 522 offers (server-verified tag-filtered count, higher than the design doc's marketing-copy estimate of ~300), validity window `2026-08-10..2026-08-16` uniform across all offers, 484/522 offers got a derived `unitText` and all of those parse successfully, 38 loose-weight items correctly omitted with a warning, unit prices and images look correct on inspection
- [ ] 8.2 Run a couple of manual syncs spaced apart to check whether the intermittent 403 behavior observed during investigation recurs under the implemented retry/pacing — **blocked on human review**
- [ ] 8.3 Confirm the deals/comparison UI renders BulMag offers correctly (retailer label, filter option, cards) without layout/field regressions — **blocked on human review**
- [x] 8.4 Run full test suite and typecheck
