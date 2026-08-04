## 1. Shared vision-extraction module

- [x] 1.1 Create `server/utils/scrapers/vision-extraction.ts` exporting `VisionExtractionError`, `getVisionClient`/`extractStructuredDataFromImage<T>(imageBuffer, prompt, responseSchema)`, `mapWithConcurrency`, `PageImageRef`/`FetchedPageImage` types, `fetchPageImages(refs)`, and `__resetVisionClientForTests()`, extracted from the equivalent inline code in `server/utils/scrapers/billa.ts`.
- [x] 1.2 Update `server/utils/scrapers/billa.ts` to import and use the shared module instead of its inline client/`mapWithConcurrency`/`fetchPageImages`/JSON-parse code; re-export `fetchPageImages` so existing imports in `billa.test.ts` keep working; confirm `billa.ts`'s own tests still pass (error class for `extractOffersFromPageImage` failures becomes `VisionExtractionError` — confirm nothing asserts the old `BillaIngestionError` type on that path).

## 2. Lidl leaflet discovery and vision extraction

- [x] 2.1 Create `server/utils/scrapers/lidl-leaflet.ts` with constants (`LIDL_LEAFLET_LISTING_URL`, `FLYER_API_URL`, `WEEKLY_WINDOW_DAYS`, `LIDL_LEAFLET_SOURCE_URL_PREFIX`, `VISION_CONCURRENCY`) and a `LidlLeafletIngestionError` class mirroring `BillaIngestionError`.
- [x] 2.2 Implement `discoverLeafletSlugs(html): string[]` (cheerio, `a.flyer[href]`, `/\/l\/bg\/broshura\/([^/]+)\/ar\/0/`), fixture-testable with no network calls.
- [x] 2.3 Implement `fetchFlyer(slug)` (GET `${FLYER_API_URL}?flyer_identifier=<slug>`) and `selectWeeklyFlyer(slugs, fetchFlyerFn?)`, which fetches all candidates in parallel and selects the one with a 7-day validity window (`endDate - startDate === 6`), throwing `LidlLeafletIngestionError` on zero or multiple matches.
- [x] 2.4 Implement `toPageImageRefs(flyer)` mapping `flyer.pages` (sorted by `number`) to `{ pageNumber, imageUrl: page.zoom }`.
- [x] 2.5 Define `LidlLeafletExtractedItem`/`LidlLeafletExtractedPage` types (same fields as Billa's minus `validFrom`/`validUntil`/`validityConfident`), the extraction prompt and response schema (telling the model validity is tracked separately), and `extractOffersFromPageImage(imageBuffer)` using `extractStructuredDataFromImage` from the shared module.
- [x] 2.6 Implement `mapExtractedItem`/`parseLidlLeafletExtraction(pages, flyer, sourceUrl)`: confidence-gate on `priceConfident && priceEurCents != null`; set `productKey`/`offerKey` via `computeProductKey`/`computeOfferKey` from `server/utils/normalize.ts` with `retailer: 'lidl'`; set `validFrom`/`validUntil` from `flyer.offerStartDate`/`offerEndDate`; set `campaign` from `flyer.title`; set `scope: 'national'`, `store: null`; attach warnings for uncertain non-critical fields.
- [x] 2.7 Implement `isLidlLeafletOffer(offer): boolean` (`retailer === 'lidl' && sourceUrl.startsWith(LIDL_LEAFLET_SOURCE_URL_PREFIX)`), exported for use by `sync.ts`.
- [x] 2.8 Implement `fetchLidlLeafletOffers(deps?)`: fetch listing page → `discoverLeafletSlugs` (throw if empty) → `selectWeeklyFlyer` → build `sourceUrl` → check `readLastLidlLeafletSlug()` against the selected slug and short-circuit to previously extracted offers (filtered via `isLidlLeafletOffer`) if unchanged → `toPageImageRefs` → `fetchPageImages` (throw if zero pages fetched, warn on partial) → `mapWithConcurrency` vision extraction (throw if zero pages extracted, warn on partial) → `parseLidlLeafletExtraction` → `writeLastLidlLeafletSlug(slug)` → return offers.

## 3. KV persistence and existing-Lidl-source identity

- [x] 3.1 Add `LIDL_LEAFLET_SLUG_KEY` and `readLastLidlLeafletSlug()`/`writeLastLidlLeafletSlug(slug)` to `server/utils/kv.ts`, mirroring the existing Billa publication-slug pattern.
- [x] 3.2 Add `export function isLidlXlsxOffer(offer: Offer): boolean` to `server/utils/scrapers/lidl.ts`, matching on `retailer === 'lidl'` and the existing XLSX export URL constant.

## 4. Snapshot type and sync orchestration

- [x] 4.1 Add `lidlLeaflet: { scrapedAt: string | null; ok: boolean }` to `DealsSnapshot['sources']` in `shared/types/offer.ts`. Do not add a new `Retailer` value.
- [x] 4.2 Refactor `server/utils/sync.ts`: add `fetchLidlLeafletOffers` to `RunSyncDeps`; introduce a per-source `SourceConfig` list (`key`, `label`, `fetch`, `belongsToSource`) covering all four sources, using `isLidlXlsxOffer`/`isLidlLeafletOffer` for the two Lidl entries; drive `runSource`, the stale-offer fallback, the `sources` block, and the total-failure/success/partial determination from that list.
- [x] 4.3 Wire `fetchLidlLeafletOffers` into `server/plugins/catch-up-sync.ts` and `server/api/cron/sync-deals.ts` alongside the existing three fetchers.

## 5. Tests and fixtures

- [x] 5.1 Add fixtures: `test/fixtures/lidl-broshura-listing.html` (weekly-shaped slug + two longer-campaign slugs), `test/fixtures/lidl-flyer-weekly.json`, `test/fixtures/lidl-flyer-campaign.json` (trimmed real API response shapes).
- [x] 5.2 Create `server/utils/scrapers/__tests__/lidl-leaflet.test.ts` covering: `discoverLeafletSlugs` (all slugs extracted; empty on no matches); `selectWeeklyFlyer` (picks the 7-day candidate; throws on 0 or 2+ matches); `parseLidlLeafletExtraction` (dates from `flyer.offerStartDate`/`offerEndDate`, not the item; drops low-confidence/missing-price items; attaches non-critical-field warnings); `isLidlLeafletOffer` (true/false including the sibling XLSX-source offer).
- [x] 5.3 Create `server/utils/scrapers/__tests__/vision-extraction.test.ts`: move `fetchPageImages` coverage here from `billa.test.ts` (drop the now-redundant block there); add `mapWithConcurrency` coverage and `extractStructuredDataFromImage` coverage (happy path, missing API key, request failure, empty response, invalid JSON), using `__resetVisionClientForTests()` between cases.
- [x] 5.4 Update `server/utils/__tests__/sync.test.ts`: add `fetchLidlLeafletOffers` to every `runDailySync({...})` call and `lidlLeaflet` to every expected `sources` block; give lidl-tagged offer fixtures distinct `sourceUrl`s (XLSX export URL vs. leaflet page URL); add a regression test proving that when only the XLSX source fails, its own stale previous offers come back but the still-succeeding leaflet source's stale previous offers are not also resurrected.

## 6. Verification

- [x] 6.1 Run the test suite and confirm all new and existing scraper/sync tests pass.
- [x] 6.2 With `GEMINI_API_KEY` set locally, manually invoke `fetchLidlLeafletOffers()` once against the real network and confirm it discovers the current weekly slug, extracts a plausible offer count, and that the skip-if-unchanged path works on a second run.
- [x] 6.3 Hit `server/api/cron/sync-deals.ts` locally with the configured `CRON_SECRET` and confirm the resulting snapshot's `sources.lidlLeaflet.ok` is `true` and `offers` includes `lidl`-retailer entries with the leaflet `sourceUrl` alongside the existing XLSX ones.
