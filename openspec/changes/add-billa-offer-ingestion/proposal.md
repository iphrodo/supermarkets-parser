## Why

Users want Billa's current promotional products included alongside Kaufland and Lidl in the deal catalog. Billa has no structured product/price API publicly available (its Nuxt.js webshop routes like `/products` are not live for the Bulgarian market) and no legally-mandated price export like Lidl's XLSX. The only public source of its current promotions is the weekly digital leaflet ("седмична брошура"), rendered as a page-image flipbook by the third-party service Publitas. Getting Billa offers into the catalog therefore requires extracting product name, price, and validity data from leaflet page images via OCR/vision, a fundamentally different ingestion mechanism than the two existing scrapers.

## What Changes

- Add a Billa scraper that locates the current week's Publitas publication for Billa's leaflet, fetches its page images, and runs each page through a hosted OCR/vision service to extract offer records.
- Add `billa` to the `Retailer` union and wire a `fetchBillaOffers()` into the daily sync/cron pipeline and `DealsSnapshot.sources`, following the existing `fetchXOffers()` / `parseXHtml()` split so tests can run against fixture images without calling the OCR service or hitting the network.
- Since OCR extraction is inherently noisier than parsing structured JSON/XLSX, low-confidence or ambiguous extractions SHALL be flagged via the existing `Offer.warnings` field rather than silently publishing a possibly-wrong price, and offers the system cannot extract with reasonable confidence SHALL be dropped rather than guessed.
- My Market is explicitly out of scope for this change (deferred: no viable data source identified).

## Capabilities

### New Capabilities
- `billa-offer-ingestion`: Locates the current Publitas leaflet publication for Billa, fetches its page images, and OCRs each page into normalized, confidence-checked offer records.

### Modified Capabilities
- `deal-catalog`: `Retailer` gains a `billa` value and the deal catalog SHALL include Billa offers alongside Kaufland and Lidl.
- `deals-snapshot-cache`: `DealsSnapshot.sources` SHALL track a `billa` source entry (`scrapedAt`, `ok`) like the existing retailers.

## Impact

- `shared/types/offer.ts`: extend `Retailer` union with `'billa'`.
- `server/utils/scrapers/billa.ts` (new): publication discovery, image fetch, OCR call, parsing/normalization, mirroring `kaufland.ts`/`lidl.ts` conventions.
- `server/utils/sync.ts`, `server/api/cron/*.ts`: wire `fetchBillaOffers` into the daily run.
- New dependency: a hosted OCR/vision API client (network + auth + cost considerations, detailed in design.md).
- Test fixtures: sample leaflet page images (or pre-fetched OCR responses) for `server/utils/scrapers/__tests__`.
