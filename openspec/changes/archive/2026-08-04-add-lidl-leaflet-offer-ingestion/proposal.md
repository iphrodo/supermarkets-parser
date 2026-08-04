## Why

The existing Lidl ingestion (`lidl-offer-ingestion`) parses Lidl's official XLSX price-export, which is a price list rather than a curated promotional feed — it misses offers that only appear in Lidl's weekly leaflet. Billa's leaflet+Gemini-vision ingestion (`billa-offer-ingestion`) already proves this pattern works and materially increases offer coverage. Adding the same approach for Lidl's weekly leaflet, as a second independent source alongside the XLSX scraper, increases the number of Lidl products surfaced without touching the still-useful XLSX source.

## What Changes

- Add a new, independent Lidl ingestion source that discovers Lidl Bulgaria's current weekly leaflet via the Schwarz-Gruppe leaflets platform (`https://www.lidl.bg/c/broshura/s10020060` listing page → `https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=<slug>` metadata+page-image API), fetches each leaflet page image, and extracts offers via Gemini vision — mirroring `billa-offer-ingestion`'s pattern, but using the flyer API's own `offerStartDate`/`offerEndDate` for validity instead of asking the model to read dates off the page.
- Both Lidl sources tag offers `retailer: 'lidl'` (no new `Retailer` value) so they contribute to one "Lidl" bucket; they are told apart internally by `sourceUrl`.
- Extract the source-agnostic parts of Billa's Gemini-vision plumbing (client init, structured-JSON call, bounded-concurrency helper, per-page image fetch with failure isolation) into a small shared module so the new Lidl source reuses them instead of duplicating them.
- Generalize the sync orchestrator's per-source stale-offer fallback (`deals-snapshot-cache`) from a hardcoded `retailer` check to a per-source predicate, since two sources now share `retailer: 'lidl'` and must be distinguished by `sourceUrl` for correct partial-failure fallback.
- Add a `lidlLeaflet` entry to the deals snapshot's `sources` health block for independent monitoring of this source.

## Capabilities

### New Capabilities
- `lidl-leaflet-offer-ingestion`: Discovers Lidl Bulgaria's current weekly leaflet, extracts offers from its page images via Gemini vision, and produces `Offer[]` tagged `retailer: 'lidl'`, independent of the existing XLSX-based `lidl-offer-ingestion` source.

### Modified Capabilities
- `deals-snapshot-cache`: The per-source partial-failure fallback (falling back to a previous snapshot's offers for a failed source) must distinguish sources by more than `retailer` alone, since two independent sources can now share the same `retailer` value; and the snapshot's `sources` health block gains a fourth entry (`lidlLeaflet`) alongside `kaufland`, `lidl`, `billa`.

## Impact

- New files: `server/utils/scrapers/lidl-leaflet.ts`, `server/utils/scrapers/vision-extraction.ts`, associated tests and fixtures.
- Modified: `server/utils/scrapers/billa.ts` (consumes shared vision-extraction module), `server/utils/scrapers/lidl.ts` (exports a source-identity predicate), `server/utils/kv.ts` (new slug-tracking key), `shared/types/offer.ts` (`DealsSnapshot.sources` gains `lidlLeaflet`), `server/utils/sync.ts` (generalized fallback filter, 4th source wiring), `server/plugins/catch-up-sync.ts`, `server/api/cron/sync-deals.ts`.
- New runtime dependency: none (reuses existing `@google/genai`, `cheerio`, `ofetch` already used by `billa.ts`).
- New external dependency at runtime: `www.lidl.bg` (leaflet listing page) and `endpoints.leaflets.schwarz` (flyer metadata/pages API), both unauthenticated public endpoints confirmed reachable during investigation.
