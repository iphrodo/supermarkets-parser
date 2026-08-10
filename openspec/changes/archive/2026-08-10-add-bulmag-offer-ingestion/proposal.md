## Why

Users want BulMag's current weekly-brochure promotions included alongside Kaufland, Lidl, and Billa in the deal catalog. Unlike Billa, BulMag publishes a real e-commerce storefront (Nuxt.js) backed by a structured JSON API at `api.bulmag.org`, so its offers can be ingested by direct HTTP calls — no OCR/vision extraction, no third-party leaflet host, and no added per-run extraction cost.

## What Changes

- Add a BulMag scraper that fetches the brochure-tagged subset of BulMag's promo product listing (tag `"АКЦИЯ-БРОШУРА"`, id `1973`) via `api.bulmag.org`'s public JSON API, paginating the list endpoint and probing a small sample of product-detail endpoints to establish the shared weekly validity window (the list endpoint alone does not carry campaign dates).
- Add `bulmag` to the `Retailer` union and wire a `fetchBulmagOffers()` into the daily sync/cron pipeline and `DealsSnapshot.sources`, following the existing `fetchXOffers()` / `parseXYyy()` split so tests can run against fixture JSON without hitting the network.
- Since BulMag exposes no EAN/barcode anywhere in its API, `productKey` SHALL always use the name-hash identity path already used as a fallback by the other sources, never a BulMag-internal product code.
- Since BulMag's API has no clean quantity/unit-text field, unit text SHALL be derived from the product name or a safe per-unit default, and offers where it cannot be derived confidently SHALL still be published (with a warning) rather than dropped, since an unquantified offer is still comparable by absolute price.
- This is the first source in the catalog making more than ~2 requests per sync run (list pagination + date-window probing); a small retry/backoff helper (new for this codebase) SHALL wrap its requests to tolerate the intermittent 403s observed during investigation.

## Capabilities

### New Capabilities
- `bulmag-offer-ingestion`: Fetches BulMag's brochure-tagged promotional products from its public JSON API, determines their shared weekly validity window, and normalizes them into offer records.

### Modified Capabilities
- `deal-catalog`: `Retailer` gains a `bulmag` value; the shared offer schema's identity, imagery, and scope requirements extend to cover a fourth structured-JSON source (BulMag uses the direct-image-URL form like Kaufland/Lidl-site, and always has a null `ean`).
- `deals-snapshot-cache`: `DealsSnapshot.sources` SHALL track a `bulmag` source entry (`scrapedAt`, `ok`) like the existing retailers, and the partial-failure isolation requirements extend to a fifth configured source.

## Impact

- `shared/types/offer.ts`: extend `Retailer` union with `'bulmag'`; add `bulmag` to `DealsSnapshot['sources']`.
- `server/utils/scrapers/bulmag.ts` (new): paginated list fetch, validity-window probing, field mapping/normalization, retry/backoff helper, mirroring `lidl-site.ts`'s conventions (closest existing analog: structured JSON API, `ofetch`, defensive per-item parsing).
- `server/utils/sync.ts`, `server/api/cron/sync-deals.ts`, `server/plugins/catch-up-sync.ts`: wire `fetchBulmagOffers` into the scheduled run.
- `server/api/deals.get.ts`: add `bulmag` to the empty-snapshot source defaults.
- `app/utils/format.ts`, `app/composables/useComparisonFilters.ts`, `app/components/comparison/ComparisonToolbar.vue`, `app/components/DealsFilterBar.vue`: add BulMag to the retailer label map and filter option lists (not covered by the generic retailer-agnostic rendering path).
- Test fixtures: captured `api.bulmag.org` list-page and product-detail JSON responses for `server/utils/scrapers/__tests__/bulmag.test.ts`.
