## 1. Publication discovery

- [x] 1.1 Fetch `https://www.billa.bg/promocii/sedmichna-broshura` and extract the current weekly-leaflet Publitas publication slug, distinguishing it from other Publitas links on the page (T&Cs, game rules) by its naming convention
- [x] 1.2 Add a `BillaIngestionError` (mirroring `KauflandIngestionError`/`LidlIngestionError`) and fail this step clearly (log + no publish) when no matching slug can be found

## 2. Page image retrieval

- [x] 2.1 Spike: inspect `view.publitas.com`'s reader for a JSON manifest of page image URLs; if found, implement direct fetch/parsing against it (found: public, unsigned `{publicationUrl}spreads.json` returns every page's resize-proxy image URLs at several sizes)
- [x] 2.2 Fallback (only if 2.1 finds no usable endpoint): use Playwright to load the reader and capture page image URLs from network responses; evaluate and document the resulting Vercel cron function size/duration impact (not needed — 2.1's plain-fetch manifest covers all pages, no headless browser required)
- [x] 2.3 On partial page-fetch failure, proceed with the pages that succeeded and record a warning listing the skipped pages, per spec

## 3. Change detection

- [x] 3.1 Persist the last successfully-processed publication slug alongside existing snapshot storage (`server/utils/kv.ts` or equivalent)
- [x] 3.2 Skip page fetch/extraction and reuse the existing Billa offers when the discovered slug matches the last-processed one

## 4. Vision-based extraction

- [x] 4.1 Choose and integrate a hosted multimodal vision API client; add required config/secrets (e.g. API key in runtime config, matching the pattern of `config.cronSecret`) (chose Gemini per user's provided API key; `GEMINI_API_KEY` in `.env`, mirrored into `nuxt.config.ts` runtimeConfig)
- [x] 4.2 Prompt the model per page image to return structured JSON: product name, brand, unit text, price, discount percentage, validity dates, and a per-field confidence/uncertainty signal
- [x] 4.3 Implement confidence gating: drop items whose price or validity dates aren't confidently extracted; attach a `warnings` entry for offers with lower-confidence non-critical fields
- [ ] 4.4 Tune the concrete confidence threshold against a handful of real leaflet pages (design.md Open Question) — **blocked on human review**: needs a person to compare real extraction output against the actual leaflet and decide if the model's self-reported `priceConfident`/`validityConfident` booleans need a stricter numeric threshold instead

## 5. Normalization and offer mapping

- [x] 5.1 Add `'billa'` to the `Retailer` union in `shared/types/offer.ts`
- [x] 5.2 Implement `server/utils/scrapers/billa.ts` exporting `fetchBillaOffers()` (network + discovery + vision calls) and a separate `parseBillaExtraction()`-style function that maps already-extracted structured data into `Offer[]` (mirroring the `fetchXOffers()`/`parseXHtml()` split), using `computeProductKey`/`computeOfferKey` from `server/utils/normalize.ts`
- [x] 5.3 Set `scope: 'national'`, `store: null`, `sourceUrl` (leaflet/publication URL), and `scrapedAt` on every emitted offer

## 6. Wiring into sync/cron

- [x] 6.1 Add a `billa` entry to `DealsSnapshot.sources` in `shared/types/offer.ts`
- [x] 6.2 Wire `fetchBillaOffers` into `server/utils/sync.ts`'s daily run, following the existing partial-failure isolation behavior (per-source `ok`/`scrapedAt`, no total-failure publish)
- [x] 6.3 Add `fetchBillaOffers` to the cron endpoint(s) in `server/api/cron/`

## 7. Tests

- [x] 7.1 Add `server/utils/scrapers/__tests__/billa.test.ts` covering: successful slug discovery, missing/ambiguous slug, confidence gating (low-confidence items dropped, uncertain-field warnings attached), and partial page-fetch failure — all against fixtures, no real network/vision calls
- [x] 7.2 Extend `server/utils/__tests__/sync.test.ts` to cover the three-source partial-failure and total-failure matrix now that Billa is a third source
- [x] 7.3 Extend `server/utils/__tests__/catalog.test.ts` if cross-source merge behavior needs Billa fixtures (not needed — `mergeCatalog` is already retailer-agnostic and generically tested)

## 8. Verification

- [ ] 8.1 Run the daily sync locally against real Billa data once and manually sanity-check a sample of extracted offers against the actual leaflet — **blocked on human review**: requires a person to eyeball real vision-extracted offers against the actual leaflet images
- [ ] 8.2 Confirm the deals UI renders Billa offers without layout/field regressions (warnings, missing `imageUrl`, etc.) — **blocked on human review**: needs a browser check against real (or realistic) Billa offer data
- [x] 8.3 Run full test suite and typecheck
